const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const axios = require('axios');
const { Client } = require('discord.js-selfbot-v13');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { runScanner } = require('./scanner');
const { runGuildRobloxScanner, lookupRobloxUsersDirect } = require('./guild_roblox_scanner');

const PORT = process.env.PORT || 3000;
const ROBLOX_PORT = 8765;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ASSETS_DIR = path.join(__dirname, 'assets');
const ROBLOX_APP_PATH = 'C:\\Users\\^\\.gemini\\antigravity\\scratch\\roblox-value-scanner\\app.py';
const VENCORD_USERPLUGINS_DIR = 'C:\\Users\\^\\Documents\\Vencord\\src\\userplugins';
const STATS_FILE_PATH = path.join(__dirname, 'stats.json');
const KEYS_DB_PATH = path.join(__dirname, 'keys_db.json');
const VISITORS_DB_PATH = path.join(__dirname, 'visitors_db.json');
const ipGeoCache = new Map();

// ================= REAL HARDWARE HWID ENGINE + PERSISTENT HMAC SESSION LOCK =================
const activeAuthSessions = new Map(); // sessionToken -> { key, role, hwid, ip, createdAt }
const SESSION_HMAC_SECRET = (() => {
    const seed = process.env.SESSION_SECRET || getHostMachineHardwareInfoSeed();
    return crypto.createHash('sha256').update(`EARLYHOST-SESSION-VAULT-KEY::${seed}`).digest();
})();

function getHostMachineHardwareInfoSeed() {
    try {
        const cpus = os.cpus() || [];
        return `${os.hostname()}|${cpus[0]?.model || 'CPU'}|${os.arch()}|${os.totalmem()}`;
    } catch (_) {
        return 'EARLYHOST-FALLBACK-SEED';
    }
}

function createSignedSessionToken(payload) {
    const dataB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sigB64 = crypto.createHmac('sha256', SESSION_HMAC_SECRET).update(dataB64).digest('base64url');
    return `at_${dataB64}.${sigB64}`;
}

function verifySignedSessionToken(token) {
    try {
        if (!token || !token.startsWith('at_') || !token.includes('.')) return null;
        const raw = token.slice(3);
        const dotIdx = raw.indexOf('.');
        if (dotIdx <= 0) return null;
        const dataB64 = raw.slice(0, dotIdx);
        const sigB64 = raw.slice(dotIdx + 1);
        const expectedSig = crypto.createHmac('sha256', SESSION_HMAC_SECRET).update(dataB64).digest('base64url');
        const bufA = Buffer.from(sigB64);
        const bufB = Buffer.from(expectedSig);
        if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return null;
        const parsed = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
        if (!parsed || !parsed.key || !parsed.hwid) return null;
        // Max session lifetime: 14 days
        if (Date.now() - (parsed.iat || 0) > 14 * 86400000) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function atomicWriteJson(filePath, obj) {
    try {
        const tmpPath = `${filePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), 'utf8');
        fs.renameSync(tmpPath, filePath);
    } catch (_) {
        try { fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8'); } catch (__) {}
    }
}

// ================= LAYER-7 WAF, ANTI-DDOS, ANTI-SCRAPING & BRUTE-FORCE SHIELD =================
const wafRateBuckets = new Map();     // ip -> { globalTokens, heavyTokens, lastRefill, strikes, bannedUntil }
const loginFailTracker = new Map();   // ip_or_hwid -> { fails, lockUntil }
const activeScanCountByHwid = new Map(); // hwid -> activeJobCount
let wafBlockedTotalCount = 0;

const BLOCKED_SCRAPER_UA_REGEX = /(sqlmap|nikto|acunetix|nmap|masscan|zgrab|gobuster|dirbuster|wpscan|nuclei|nessus|python-requests|aiohttp|scrapy|libwww-perl|jaeles|feroxbuster|ffuf|httpx)/i;
const SENSITIVE_PATH_REGEX = /(\.env|keys_db|visitors_db|stats\.json|package-lock|\.git|node_modules|server\.js|scanner\.js|guild_roblox_scanner\.js|\.\.(\/|\\)|%2e%2e)/i;

// Periodic memory GC for rate-limit buckets every 3 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of wafRateBuckets.entries()) {
        if (now - v.lastRefill > 10 * 60 * 1000 && (!v.bannedUntil || now > v.bannedUntil)) {
            wafRateBuckets.delete(k);
        }
    }
    for (const [k, v] of loginFailTracker.entries()) {
        if (v.lockUntil && now > v.lockUntil + 10 * 60 * 1000) {
            loginFailTracker.delete(k);
        }
    }
}, 3 * 60 * 1000).unref();

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https: http:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api4.ipify.org; frame-ancestors 'none';"
};

function checkWafAndRateLimit(req, pathname) {
    const ip = getClientIp(req);
    const now = Date.now();
    const ua = String(req.headers['user-agent'] || '');
    const rawUrl = String(req.url || '');

    // 1. Block path traversal, null bytes & direct database/source scraping attempts
    if (rawUrl.includes('\0') || rawUrl.length > 2048 || SENSITIVE_PATH_REGEX.test(rawUrl)) {
        wafBlockedTotalCount++;
        return { allowed: false, status: 403, error: 'WAF Koruması: Yetkisiz dosya veya dizin erişimi engellendi.' };
    }

    // 2. Block automated vulnerability scanners & raw scraper bots on API routes
    if (pathname.startsWith('/api/') && (!ua || BLOCKED_SCRAPER_UA_REGEX.test(ua))) {
        wafBlockedTotalCount++;
        return { allowed: false, status: 403, error: 'WAF Koruması: Otomatik veri çekme (scraping) botu engellendi.' };
    }

    // 3. Token-bucket Layer-7 DDoS & Flood limiter
    let bucket = wafRateBuckets.get(ip);
    if (!bucket) {
        bucket = { globalTokens: 160, heavyTokens: 16, lastRefill: now, strikes: 0, bannedUntil: 0 };
        wafRateBuckets.set(ip, bucket);
    }

    if (bucket.bannedUntil > now) {
        wafBlockedTotalCount++;
        const waitSec = Math.ceil((bucket.bannedUntil - now) / 1000);
        return { allowed: false, status: 429, error: `Anti-DDoS Koruması: Çok fazla istek gönderildi (${waitSec} sn geçici engel).` };
    }

    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    if (elapsedSec > 0) {
        bucket.globalTokens = Math.min(160, bucket.globalTokens + elapsedSec * 12); // ~720 req/min steady, 160 burst
        bucket.heavyTokens = Math.min(16, bucket.heavyTokens + elapsedSec * 0.45); // ~27 heavy scans/min
        bucket.lastRefill = now;
    }

    const isHeavyApi = pathname === '/api/discord/scan'
        || pathname === '/api/roblox/guild-scan'
        || pathname === '/api/roblox/scan'
        || pathname === '/api/tools/username-check'
        || pathname === '/api/tools/vanity-check'
        || pathname === '/api/tools/token-check'
        || pathname === '/api/tools/guild-assets-zip';

    bucket.globalTokens -= 1;
    if (bucket.globalTokens < 0) {
        bucket.strikes += 1;
        wafBlockedTotalCount++;
        if (bucket.strikes >= 8) {
            bucket.bannedUntil = now + 90 * 1000; // 90s auto-cooldown on flood
            bucket.strikes = 0;
        }
        return { allowed: false, status: 429, error: 'Anti-DDoS Hız Sınırı: İstek limiti aşıldı, lütfen birkaç saniye bekleyin.' };
    }

    if (isHeavyApi) {
        if (bucket.heavyTokens < 1) {
            wafBlockedTotalCount++;
            return { allowed: false, status: 429, error: 'Tarama Koruma Kalkanı: Çok sık tarama başlatıldı, lütfen birkaç saniye bekleyin.' };
        }
        bucket.heavyTokens -= 1;
    }

    return { allowed: true };
}

function checkLoginBruteForce(ip, hwid) {
    const now = Date.now();
    for (const key of [ip, hwid].filter(Boolean)) {
        const rec = loginFailTracker.get(key);
        if (rec && rec.lockUntil > now) {
            const sec = Math.ceil((rec.lockUntil - now) / 1000);
            return { locked: true, waitSec: sec };
        }
    }
    return { locked: false, waitSec: 0 };
}

function registerLoginFailure(ip, hwid) {
    const now = Date.now();
    for (const key of [ip, hwid].filter(Boolean)) {
        const rec = loginFailTracker.get(key) || { fails: 0, lockUntil: 0 };
        rec.fails += 1;
        if (rec.fails >= 6) {
            rec.lockUntil = now + Math.min(15 * 60 * 1000, (rec.fails - 5) * 60 * 1000);
        }
        loginFailTracker.set(key, rec);
    }
}

function clearLoginFailures(ip, hwid) {
    if (ip) loginFailTracker.delete(ip);
    if (hwid) loginFailTracker.delete(hwid);
}

let cachedHostHardwareInfo = null;

function getHostMachineHardwareInfo() {
    if (cachedHostHardwareInfo) return cachedHostHardwareInfo;
    try {
        let machineGuid = '';
        if (process.platform === 'win32') {
            try {
                const regOut = execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
                    encoding: 'utf8',
                    timeout: 3000,
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                const m = regOut.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
                if (m) machineGuid = m[1].trim();
            } catch (_) {}
        }

        const cpus = os.cpus() || [];
        const cpuModel = (cpus[0]?.model || 'Generic CPU').replace(/\s+/g, ' ').trim();
        const cores = cpus.length || 4;
        const totalMemGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
        const hostname = os.hostname() || 'WORKSTATION';
        const arch = os.arch();

        const rawSeed = `${machineGuid || hostname}|${cpuModel}|${cores}|${arch}|${totalMemGb}`;
        const sha = crypto.createHash('sha256').update(rawSeed).digest('hex').toUpperCase();
        const formattedHwid = `HWID-${sha.slice(0, 4)}-${sha.slice(4, 8)}-${sha.slice(8, 12)}-${sha.slice(12, 16)}`;

        cachedHostHardwareInfo = {
            hwid: formattedHwid,
            cpuModel,
            cores,
            ramGb: totalMemGb,
            hostname,
            arch,
            source: machineGuid ? 'WINDOWS KERNEL MACHINE-GUID + CPU SHA256' : 'OS HARDWARE SHA256'
        };
        return cachedHostHardwareInfo;
    } catch (_) {
        return {
            hwid: 'HWID-0000-0000-0000-0000',
            cpuModel: 'Unknown CPU',
            cores: 4,
            ramGb: 8,
            hostname: 'HOST',
            arch: 'x64',
            source: 'FALLBACK'
        };
    }
}

function deriveVerifiedHwid(req, clientSpec = {}) {
    const ip = getClientIp(req);
    const isLocalMachine = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';

    if (isLocalMachine) {
        // Real OS Kernel MachineGuid + CPU SHA-256! Identical across Chrome, Edge, Opera, Incognito — impossible to spoof by clearing cache!
        const hostHw = getHostMachineHardwareInfo();
        return {
            hwid: hostHw.hwid,
            cpu: hostHw.cpuModel,
            gpu: String(clientSpec.gpu || 'DirectX / WebGL Adapter').slice(0, 80),
            cores: hostHw.cores,
            ramGb: hostHw.ramGb,
            osName: `Windows (${hostHw.arch}) • ${hostHw.hostname}`,
            source: hostHw.source
        };
    }

    // For remote network clients: deterministic SHA-256 of pure immutable hardware traits (NO random localStorage salt!)
    const gpuClean = String(clientSpec.gpu || 'GPU').trim();
    const screenSpec = String(clientSpec.screen || '1920x1080').trim();
    const cores = Number(clientSpec.cores || 4);
    const ramGb = Number(clientSpec.ram || 8);
    const platform = String(clientSpec.platform || 'Win32').trim();
    const tz = String(clientSpec.tz || 'UTC').trim();
    const canvasSig = String(clientSpec.canvasSig || '').trim();

    const rawHw = [platform, gpuClean, cores, ramGb, screenSpec, tz, canvasSig].join('||');
    const sha = crypto.createHash('sha256').update(rawHw).digest('hex').toUpperCase();
    return {
        hwid: `HWID-${sha.slice(0, 4)}-${sha.slice(4, 8)}-${sha.slice(8, 12)}-${sha.slice(12, 16)}`,
        cpu: `${cores} Çekirdek İşlemci (${platform})`,
        gpu: gpuClean.slice(0, 80),
        cores,
        ramGb,
        osName: `${platform} • ${screenSpec}`,
        source: 'WEBGL UNMASKED GPU + CANVAS SHA256'
    };
}

function generateLicenseString(prefix = 'EARLY') {
    const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${prefix}-${seg()}-${seg()}-${seg()}`;
}

function loadKeysDb() {
    try {
        if (fs.existsSync(KEYS_DB_PATH)) {
            const parsed = JSON.parse(fs.readFileSync(KEYS_DB_PATH, 'utf8'));
            if (parsed && Array.isArray(parsed.keys)) return parsed;
        }
    } catch (_) {}

    const initialOwnerKey = process.env.OWNER_KEY || 'EARLY-OWNER-VACX-2026';
    const defaultDb = {
        requireGate: true,
        announcement: 'EARLY.HOST v3.0 — Tüm tarama motorları ve Vencord paketleri aktif. Destek için: discord.gg/anonim',
        keys: [
            {
                key: initialOwnerKey,
                role: 'OWNER', // OWNER | ADMIN | USER
                label: 'Kurucu Anahtarı (vacx)',
                hwid: null,
                hwidLocked: true,
                maxHwidResets: 999,
                hwidResetCount: 0,
                createdAt: Date.now(),
                expiresAt: null, // Lifetime
                banned: false,
                lastLoginAt: null,
                lastIp: null,
                loginCount: 0,
                createdBy: 'SYSTEM'
            }
        ],
        logs: [
            { ts: Date.now(), type: 'SYSTEM', msg: `Varsayılan Kurucu Anahtarı oluşturuldu: ${initialOwnerKey}` }
        ]
    };
    saveKeysDb(defaultDb);
    return defaultDb;
}

function saveKeysDb(db) {
    try {
        if (Array.isArray(db.logs) && db.logs.length > 150) {
            db.logs = db.logs.slice(0, 150);
        }
        atomicWriteJson(KEYS_DB_PATH, db);
    } catch (_) {}
}

function addAuthLog(db, type, msg) {
    if (!Array.isArray(db.logs)) db.logs = [];
    db.logs.unshift({ ts: Date.now(), type, msg });
}

function getClientIp(req) {
    const cf = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'];
    if (cf) return String(cf).trim();
    const xf = req.headers['x-forwarded-for'];
    if (xf) return String(xf).split(',')[0].trim();
    return String(req.socket?.remoteAddress || '127.0.0.1').replace('::ffff:', '');
}

// ================= VISITOR & ENTRY TELEMETRY ENGINE (OWNER RADAR + WEBHOOK DROP) =================
function loadVisitorsDb() {
    try {
        if (fs.existsSync(VISITORS_DB_PATH)) {
            const parsed = JSON.parse(fs.readFileSync(VISITORS_DB_PATH, 'utf8'));
            if (parsed && Array.isArray(parsed.visitors)) {
                if (!Array.isArray(parsed.blockedHwids)) parsed.blockedHwids = [];
                if (!Array.isArray(parsed.blockedIps)) parsed.blockedIps = [];
                if (!parsed.webhookMode) parsed.webhookMode = 'all';
                return parsed;
            }
        }
    } catch (_) {}
    return {
        webhookUrl: '',
        webhookMode: 'all', // 'all' | 'auth_only'
        blockedHwids: [],
        blockedIps: [],
        visitors: []
    };
}

function saveVisitorsDb(vdb) {
    try {
        if (Array.isArray(vdb.visitors) && vdb.visitors.length > 400) {
            vdb.visitors = vdb.visitors.slice(0, 400);
        }
        atomicWriteJson(VISITORS_DB_PATH, vdb);
    } catch (_) {}
}

function parseUserAgentSummary(uaRaw) {
    const ua = String(uaRaw || '');
    let browser = 'Unknown/0.0';
    const opr = ua.match(/(?:OPR|Opera)\/([\d.]+)/i);
    const edg = ua.match(/Edg\/([\d.]+)/i);
    const chr = ua.match(/Chrome\/([\d.]+)/i);
    const ffx = ua.match(/Firefox\/([\d.]+)/i);
    const saf = ua.match(/Version\/([\d.]+).*Safari/i);

    if (opr) browser = `Opera/${opr[1]}`;
    else if (edg) browser = `Edge/${edg[1]}`;
    else if (chr) browser = `Chrome/${chr[1]}`;
    else if (ffx) browser = `Firefox/${ffx[1]}`;
    else if (saf) browser = `Safari/${saf[1]}`;

    let osLabel = 'Windows';
    if (/Windows/i.test(ua)) osLabel = 'Windows';
    else if (/Android ([\d.]+)/i.test(ua)) osLabel = 'Android ' + ua.match(/Android ([\d.]+)/i)[1];
    else if (/iPhone|iPad|iPod/i.test(ua)) osLabel = 'iOS';
    else if (/Mac OS X/i.test(ua)) osLabel = 'macOS';
    else if (/Linux/i.test(ua)) osLabel = 'Linux';

    let deviceType = 'Masaüstü';
    if (/iPad|Tablet/i.test(ua)) deviceType = 'Tablet';
    else if (/Mobile|Android|iPhone|iPod/i.test(ua)) deviceType = 'Mobil';

    return { browser, osLabel, deviceType, fullUa: ua.slice(0, 240) };
}

function isCleanPublicIpv4(str) {
    const s = String(str || '').trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
    if (s.startsWith('127.') || s.startsWith('10.') || s.startsWith('192.168.') || s === '0.0.0.0') return false;
    return true;
}

async function resolveIpGeo(ip, clientReportedIpv4 = '') {
    let targetIpv4 = '';
    if (isCleanPublicIpv4(clientReportedIpv4)) {
        targetIpv4 = String(clientReportedIpv4).trim();
    } else if (isCleanPublicIpv4(ip)) {
        targetIpv4 = String(ip).trim();
    }

    const cacheKey = targetIpv4 || '__HOST_IPV4__';
    if (ipGeoCache.has(cacheKey)) return ipGeoCache.get(cacheKey);

    try {
        // Strictly resolve IPv4 address if not already a public IPv4 (avoids long IPv6 addresses!)
        if (!targetIpv4) {
            try {
                const ip4Res = await axios.get('https://api4.ipify.org?format=json', { timeout: 3000 });
                if (ip4Res.data?.ip && isCleanPublicIpv4(ip4Res.data.ip)) {
                    targetIpv4 = ip4Res.data.ip.trim();
                }
            } catch (_) {}
        }

        // Primary IPv4 Geo lookup via ip-api.com (100% IPv4 + accurate City & ISP)
        const apiEndpoint = targetIpv4
            ? `http://ip-api.com/json/${encodeURIComponent(targetIpv4)}?fields=status,country,countryCode,regionName,city,isp,query`
            : `http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,isp,query`;

        const r = await axios.get(apiEndpoint, { timeout: 3000 });
        if (r.data && r.data.status === 'success') {
            const finalIp = r.data.query || targetIpv4 || ip;
            const country = r.data.country || 'Bilinmiyor';
            const city = r.data.city || r.data.regionName || '';
            const isp = r.data.isp || '-';
            const info = {
                publicIp: finalIp,
                country: city ? `${country}, ${city}` : country,
                countryCode: r.data.countryCode || '',
                flag: '',
                location: city ? `${country}, ${city}` : country,
                isp
            };
            ipGeoCache.set(cacheKey, info);
            if (isCleanPublicIpv4(finalIp)) ipGeoCache.set(finalIp, info);
            return info;
        }
    } catch (_) {}

    const fallback = {
        publicIp: targetIpv4 || ip || '127.0.0.1',
        country: 'Bilinmiyor',
        countryCode: '',
        flag: '',
        location: 'Bilinmiyor',
        isp: '-'
    };
    return fallback;
}

function formatTrLogDate(ts) {
    const d = new Date(ts || Date.now());
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function sendVisitorWebhookAlert(webhookUrl, entry, isTest = false) {
    if (!webhookUrl || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(webhookUrl)) {
        if (isTest) throw new Error('Geçerli bir Discord Webhook URL girin.');
        return;
    }

    let statusLabel = 'Site Ziyareti';
    if (entry.eventType === 'AUTH_SUCCESS') {
        statusLabel = `Yetkili Giriş (${entry.keyInfo || entry.role || 'Üye'})`;
    } else if (entry.eventType === 'AUTH_REJECT') {
        statusLabel = `Giriş Reddedildi (${entry.note || 'Geçersiz Anahtar / HWID'})`;
    } else if (entry.eventType === 'BLACKLIST_BLOCK') {
        statusLabel = 'Kara Liste Engeli';
    }
    if (isTest) {
        statusLabel = 'Test Kaydı';
    }

    const cleanIp = entry.displayIp || entry.ip || '-';
    const locLine = [entry.country || entry.location, entry.isp && entry.isp !== '-' ? entry.isp : ''].filter(Boolean).join(' • ') || '-';
    const sysBrowser = String(entry.browser || '-').split('/')[0] + (entry.browser?.includes('/') ? ' ' + entry.browser.split('/')[1].split('.')[0] : '');
    const sysLine = `${entry.osLabel || 'Windows'} • ${sysBrowser} (${entry.screenRes || '1920x1080'})`;
    const cpuShort = String(entry.cpu || '').replace(/\s+Processor$/i, '').trim() || `${entry.cores || 4} Çekirdek`;
    const hwLine = `${cpuShort} • ${entry.ramGb || 8} GB RAM`;

    const descLines = [
        `**Durum:** ${statusLabel}`,
        `**IP Adresi:** \`${cleanIp}\``,
        `**Konum:** ${locLine}`,
        `**HWID:** \`${entry.hwid || '-'}\``,
        `**Sistem:** ${sysLine}`,
        `**Donanım:** ${hwLine}`
    ];

    // 0x2B2D31 matches Discord's dark embed card background -> 100% seamless borderless ("çizgisiz") embed!
    await axios.post(webhookUrl, {
        username: 'Early.Host',
        embeds: [{
            author: { name: 'Early.Host • Giriş Kaydı' },
            color: 0x2b2d31,
            description: descLines.join('\n'),
            footer: { text: formatTrLogDate(entry.ts) }
        }]
    }, { timeout: 7000 });
}

function recordVisitorEvent(req, opts = {}) {
    try {
        const vdb = loadVisitorsDb();
        const ip = getClientIp(req);
        const spec = opts.spec || {};
        const hw = opts.hw || deriveVerifiedHwid(req, spec);
        const uaParsed = parseUserAgentSummary(req.headers['user-agent']);
        const eventType = opts.eventType || 'GATE_VISIT'; // GATE_VISIT | AUTH_SUCCESS | AUTH_REJECT | BLACKLIST_BLOCK
        const now = Date.now();

        const rawScreen = String(spec.screenRes || (spec.screen ? String(spec.screen).split('x').slice(0, 2).join('x') : '1920x1080'));

        // Deduplicate rapid repeated GATE_VISIT pings from exact same HWID+IP within 3 minutes
        if (eventType === 'GATE_VISIT') {
            const recent = vdb.visitors.find((v) =>
                v.eventType === 'GATE_VISIT'
                && v.hwid === hw.hwid
                && v.ip === ip
                && (now - (v.lastSeenAt || v.ts)) < 3 * 60 * 1000
            );
            if (recent) {
                recent.lastSeenAt = now;
                recent.hits = (recent.hits || 1) + 1;
                recent.visitCount = Math.max(Number(spec.visitCount || 1), recent.hits);
                recent.browser = uaParsed.browser;
                recent.screenRes = rawScreen;
                if (spec.rawGpu) recent.rawGpu = String(spec.rawGpu).slice(0, 240);
                saveVisitorsDb(vdb);
                return recent;
            }
        }

        const totalVisitsFromHwid = vdb.visitors.filter((v) => v.hwid === hw.hwid).length + 1;

        const entry = {
            id: crypto.randomBytes(6).toString('hex'),
            ts: now,
            lastSeenAt: now,
            hits: 1,
            visitCount: Math.max(Number(spec.visitCount || 1), totalVisitsFromHwid),
            eventType,
            ip,
            displayIp: ip,
            country: 'Çözümleniyor...',
            flag: '🌐',
            location: 'Çözümleniyor...',
            isp: '-',
            deviceType: spec.deviceType || uaParsed.deviceType || 'Masaüstü',
            osLabel: uaParsed.osLabel,
            browser: uaParsed.browser,
            platform: String(spec.platform || 'Win32'),
            screen: String(spec.screen || '1920x1080'),
            screenRes: rawScreen,
            hwid: hw.hwid,
            hwSource: hw.source || 'SHA-256',
            cpu: hw.cpu || '-',
            gpu: hw.gpu || '-',
            rawGpu: String(spec.rawGpu || hw.gpu || '-').slice(0, 240),
            cores: hw.cores || spec.cores || 4,
            ramGb: hw.ramGb || spec.ram || 8,
            lang: String(spec.lang || req.headers['accept-language']?.split(',')[0] || 'tr-TR').slice(0, 24),
            tz: String(spec.tz || 'Europe/Istanbul'),
            netDownlink: spec.netDownlink != null ? String(spec.netDownlink) : 'Bilinmiyor',
            netType: String(spec.netType || '4g'),
            touchscreen: spec.touchscreen || 'Yok',
            cookieEnabled: spec.cookieEnabled || 'Var',
            localStorageEnabled: spec.localStorageEnabled || 'Var',
            cookieSizeKb: spec.cookieSizeKb != null ? String(spec.cookieSizeKb) : '0.00',
            passwordCount: spec.passwordCount != null ? Number(spec.passwordCount) : 1,
            pageUrl: String(spec.pageUrl || `http://${req.headers.host || 'localhost:3000'}/`).slice(0, 300),
            pageTitle: String(spec.pageTitle || 'EARLY.HOST — 3D Proje & Canlı Sistem Merkezi').slice(0, 200),
            referrer: String(spec.referrer || req.headers['referer'] || 'Doğrudan giriş').slice(0, 220),
            onlineStatus: String(spec.onlineStatus || 'Online'),
            role: opts.role || null,
            keyLabel: opts.keyLabel || null,
            keyInfo: opts.keyInfo || null,
            note: opts.note || ''
        };

        vdb.visitors.unshift(entry);
        saveVisitorsDb(vdb);

        // Async Geo-IP enrichment + optional Discord Webhook push (non-blocking)
        (async () => {
            try {
                const geo = await resolveIpGeo(ip, spec.clientIpv4);
                const freshDb = loadVisitorsDb();
                const target = freshDb.visitors.find((x) => x.id === entry.id);
                if (target) {
                    target.displayIp = geo.publicIp || ip;
                    target.country = geo.country;
                    target.flag = geo.flag;
                    target.location = geo.location;
                    target.isp = geo.isp;
                    saveVisitorsDb(freshDb);
                }
                entry.displayIp = geo.publicIp || ip;
                entry.country = geo.country;
                entry.flag = geo.flag;
                entry.location = geo.location;
                entry.isp = geo.isp;

                if (freshDb.webhookUrl) {
                    const shouldSend = freshDb.webhookMode === 'all' || eventType !== 'GATE_VISIT';
                    if (shouldSend) {
                        await sendVisitorWebhookAlert(freshDb.webhookUrl, entry, false).catch(() => {});
                    }
                }
            } catch (_) {}
        })();

        return entry;
    } catch (_) {
        return null;
    }
}

function isClientBlacklisted(ip, hwid) {
    const vdb = loadVisitorsDb();
    if (hwid && vdb.blockedHwids.includes(hwid)) return { blocked: true, reason: `Bu cihazın donanım kimliği (${hwid}) Kurucu tarafından kalıcı kara listeye alındı.` };
    if (ip && vdb.blockedIps.includes(ip)) return { blocked: true, reason: `Bu IP adresi (${ip}) Kurucu tarafından kara listeye alındı.` };
    return { blocked: false };
}

function validateSessionFromReq(req) {
    const db = loadKeysDb();
    const token = String(req.headers['x-earlyhost-session'] || '').trim()
        || (new URL(req.url, 'http://localhost').searchParams.get('session') || '').trim();
    if (!token) return { ok: false, error: 'Oturum bulunamadı. Lütfen Lisans Key ile giriş yapın.', db };

    let sess = activeAuthSessions.get(token);
    if (!sess) {
        // Stateless HMAC-SHA256 fallback so server restarts never kick logged-in users!
        const verified = verifySignedSessionToken(token);
        if (verified) {
            sess = {
                key: verified.key,
                role: verified.role,
                hwid: verified.hwid,
                ip: getClientIp(req),
                createdAt: verified.iat || Date.now()
            };
            activeAuthSessions.set(token, sess);
        }
    }
    if (!sess) return { ok: false, error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.', db };

    const bl = isClientBlacklisted(getClientIp(req), sess.hwid);
    if (bl.blocked) {
        activeAuthSessions.delete(token);
        return { ok: false, error: bl.reason, db };
    }

    const keyObj = db.keys.find((k) => k.key === sess.key);
    if (!keyObj) {
        activeAuthSessions.delete(token);
        return { ok: false, error: 'Anahtar sistemden silinmiş.', db };
    }
    if (keyObj.banned) {
        activeAuthSessions.delete(token);
        return { ok: false, error: 'Bu lisans anahtarı yasaklandı (BAN).', db };
    }
    if (keyObj.expiresAt && Date.now() > keyObj.expiresAt) {
        activeAuthSessions.delete(token);
        return { ok: false, error: 'Lisans anahtarınızın süresi doldu.', db };
    }
    if (keyObj.hwidLocked && keyObj.hwid && sess.hwid && keyObj.hwid !== sess.hwid) {
        activeAuthSessions.delete(token);
        return { ok: false, error: 'HWID uyuşmazlığı tespit edildi!', db };
    }
    if (keyObj.revokedBefore && sess.createdAt && sess.createdAt < keyObj.revokedBefore) {
        activeAuthSessions.delete(token);
        return { ok: false, error: 'Oturum yönetici tarafından sonlandırıldı.', db };
    }

    return { ok: true, keyObj, session: sess, db };
}

function loadDownloadStats() {
    try {
        if (fs.existsSync(STATS_FILE_PATH)) {
            return JSON.parse(fs.readFileSync(STATS_FILE_PATH, 'utf8'));
        }
    } catch (_) {}
    return { 'vacx-fakeyt': 48, 'vacx-yayin': 39, 'selfBadges': 64, 'copyProfile': 31, 'all': 27, 'theme': 19 };
}

function incrementDownloadStat(key) {
    const stats = loadDownloadStats();
    stats[key] = (stats[key] || 0) + 1;
    try {
        fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(stats, null, 2), 'utf8');
    } catch (_) {}
    return stats[key];
}

// Discord Public Flag Decoder
const DISCORD_PUBLIC_FLAGS = [
    { bit: 1 << 0, id: 'staff', name: 'Discord Staff' },
    { bit: 1 << 1, id: 'partner', name: 'Partnered Server Owner' },
    { bit: 1 << 2, id: 'hypesquad_events', name: 'HypeSquad Events' },
    { bit: 1 << 3, id: 'bug_hunter', name: 'Bug Hunter Level 1' },
    { bit: 1 << 6, id: 'bravery', name: 'HypeSquad Bravery' },
    { bit: 1 << 7, id: 'brilliance', name: 'HypeSquad Brilliance' },
    { bit: 1 << 8, id: 'balance', name: 'HypeSquad Balance' },
    { bit: 1 << 9, id: 'early_supporter', name: 'Early Supporter' },
    { bit: 1 << 14, id: 'golden_bug_hunter', name: 'Bug Hunter Level 2 (Gold)' },
    { bit: 1 << 16, id: 'verified_bot', name: 'Verified Bot' },
    { bit: 1 << 17, id: 'early_bot_developer', name: 'Early Verified Bot Developer' },
    { bit: 1 << 18, id: 'moderator', name: 'Certified Moderator' },
    { bit: 1 << 22, id: 'active_developer', name: 'Active Developer' }
];

function decodeDiscordSnowflake(idStr) {
    try {
        const clean = String(idStr || '').replace(/[^\d]/g, '');
        if (clean.length < 16 || clean.length > 21) return null;
        const DISCORD_EPOCH = 1420070400000n;
        const snow = BigInt(clean);
        const timestampMs = Number((snow >> 22n) + DISCORD_EPOCH);
        return {
            timestampMs,
            iso: new Date(timestampMs).toISOString(),
            workerId: Number((snow & 0x3E0000n) >> 17n),
            processId: Number((snow & 0x1F000n) >> 12n)
        };
    } catch (_) {
        return null;
    }
}

const EARLYHOST_OBSIDIAN_THEME_CSS = `/**
 * @name Early.Host Obsidian Pure Black
 * @author Early.Host (discord.gg/anonim)
 * @version 1.0.0
 * @description Discord'u %100 saf OLED siyaha (#000000) ve keskin monokrom cama donusturen ozel Vencord temasi.
 * @website https://discord.gg/anonim
 */

:root,
.theme-dark,
.visual-refresh.theme-dark {
  --background-primary: #000000 !important;
  --background-secondary: #040404 !important;
  --background-secondary-alt: #020202 !important;
  --background-tertiary: #000000 !important;
  --background-floating: #060606 !important;
  --background-modifier-hover: rgba(255, 255, 255, 0.05) !important;
  --background-modifier-active: rgba(255, 255, 255, 0.09) !important;
  --background-modifier-selected: rgba(255, 255, 255, 0.11) !important;
  --channeltextarea-background: #070707 !important;
  --bg-overlay-2: #030303 !important;
  --bg-overlay-3: #060606 !important;
  --bg-base-primary: #000000 !important;
  --bg-base-secondary: #030303 !important;
  --bg-base-tertiary: #000000 !important;
  --bg-surface-overlay: #050505 !important;
  --bg-surface-raised: #070707 !important;
  --chat-background-default: #000000 !important;
  --home-background: #000000 !important;
  --modal-background: #050505 !important;
  --modal-footer-background: #020202 !important;
  --scrollbar-thin-thumb: #1c1c1f !important;
  --scrollbar-auto-thumb: #1c1c1f !important;
  --scrollbar-auto-track: #000000 !important;
}

/* Sharp Obsidian Borders on Panels & Modals */
[class*="sidebar_"],
[class*="panels_"],
[class*="userPopoutOuter_"],
[class*="menu_"] {
  border-color: rgba(255, 255, 255, 0.08) !important;
}
`;

// Pure-Node ZIP Archive Builder (Store Mode - Zero Dependencies)
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZipBuffer(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
        const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
        const crc = crc32(dataBuf);
        const size = dataBuf.length;

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
        localHeader.writeUInt16LE(0, 8);      // Store (no compression)
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(size, 18);
        localHeader.writeUInt32LE(size, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localParts.push(localHeader, nameBuf, dataBuf);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(size, 20);
        centralHeader.writeUInt32LE(size, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);

        centralParts.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + size;
    }

    const centralDirBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

const VENCORD_PLUGINS = [
    {
        id: 'vacx-fakeyt',
        folderName: 'vacx-fakeyt',
        title: 'vacx-fakeyt (Fake Yönetici & Gizli Odalar)',
        version: 'v3.2',
        category: 'ADMIN & OSINT',
        summary: 'İstediğiniz Discord sunucusunda tam Yönetici / Sunucu Sahibi görünümü açar; gizli ve kilitli ses/metin kanallarını izin detaylarıyla birlikte ortaya çıkarır.',
        features: [
            'Sunucu Ayarları, Roller ve Kanal Düzenleme menülerini client-side olarak tam yetkili açar',
            'Normalde görünmeyen kilitli/gizli odaları altın kilit ikonu ve erişim listesiyle gösterir',
            'Üye listesinde ve mesajlarda Sunucu Sahibi tacı (Owner Crown) ile en üst yönetici rol rengini uygular',
            'Sunucu özel davet (Vanity URL) istatistiklerini ve üye yetkilerini tek panelden analiz eder'
        ]
    },
    {
        id: 'vacx-yayin',
        folderName: 'vacx-yayin',
        title: 'vacx-yayin (Fake Mor Yayın Simgesi)',
        version: 'v1.8',
        category: 'STATUS SPOOFER',
        summary: 'OBS veya yayın açmanıza gerek kalmadan profilinizde kutusuz, tertemiz sadece mor "Yayın Yapıyor (Streaming)" simgesi gösterir.',
        features: [
            'Profil kartında büyük "Yayın Yapıyor / İzle" aktivite kutusu oluşturmadan sadece mor durum ikonu yakar',
            'Vencord Toolbox menüsünden tek tıkla anında açılıp kapatılabilir',
            'Hem küçük profil popout penceresinde hem de tam ekran profil görünümünde kusursuz gizleme yapar',
            'Arka planda sıfır CPU/RAM tüketimi ile çalışır'
        ]
    },
    {
        id: 'selfBadges',
        folderName: 'selfBadges',
        title: 'SelfBadges (37 Resmi Rozet Yöneticisi)',
        version: 'v2.6',
        category: 'PROFILE CUSTOMIZER',
        summary: 'Discord\'daki 37 resmi rozetin tamamını (Staff, Early Supporter, Verified Dev, Nitro Opal/Ruby, 24 Ay Boost, Quest, Legacy #) görsel seçici ile profilinize ekler.',
        features: [
            'Discord resmi CDN ikonlarıyla %100 uyumlu 37 rozet ve 2026 Rozet Rehberi (Efsanevi/Destansı) desteği',
            'Canlı önizlemeli Görsel Rozet Seçici ile tek tıkla "37/37 Tümünü Ekle" veya "Nadir Vitrin Seti"',
            'Rozet sıralamasını oklarla değiştirme, sağ tıkla kaldırma ve özel Nitro/Boost tarih yazıları belirleme',
            '%100 güvenli client-side mimari — sunucuya dış veri göndermez'
        ]
    },
    {
        id: 'copyProfile',
        folderName: 'copyProfile',
        title: 'CopyProfile (Tek Tıkla Profil Klonlayıcı)',
        version: 'v1.5',
        category: 'UTILITY & CLONER',
        summary: 'Herhangi bir kullanıcıya sağ tıklayarak Avatar, Görünen Ad, Hakkımda (Bio), Zamirler, Profil Rengi ve Afişini (Banner) tek tıkla kendi hesabınıza kopyalar.',
        features: [
            'Kullanıcı sağ tık menüsünden "Tüm Profili Kopyala" veya "Sadece Profil Fotoğrafını Kopyala" seçenekleri',
            'Kopyalama öncesi mevcut profilinizi otomatik yedekler (Otomatik Backup sistemi)',
            'İstediğiniz an sağ tık menüsündeki "Eski Profilime Geri Dön" butonuyla tek tıkla eski halinize döner',
            'Nitro hesaplarda hareketli GIF avatar ve afişleri yüksek çözünürlükte (1024px) çeker'
        ]
    }
];

function collectDirectoryFiles(dirPath, prefix = '') {
    const out = [];
    if (!fs.existsSync(dirPath)) return out;
    for (const item of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const full = path.join(dirPath, item.name);
        const rel = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.isDirectory()) {
            out.push(...collectDirectoryFiles(full, rel));
        } else if (item.isFile()) {
            out.push({ name: rel, data: fs.readFileSync(full) });
        }
    }
    return out;
}

function buildInstallerBats(pluginFolders) {
    const psScript = [
        '$ErrorActionPreference = "Stop"',
        'Write-Host ""',
        'Write-Host "  ======================================================" -ForegroundColor White',
        'Write-Host "   EARLY.HOST - VENCORD OTOMATIK PLUGIN KURUCU" -ForegroundColor Cyan',
        'Write-Host "   Topluluk: https://discord.gg/anonim" -ForegroundColor DarkGray',
        'Write-Host "  ======================================================" -ForegroundColor White',
        'Write-Host ""',
        '$candidates = @(',
        '  "$env:USERPROFILE\\Documents\\Vencord",',
        '  "$env:USERPROFILE\\Desktop\\Vencord",',
        '  "C:\\Vencord",',
        '  "$env:USERPROFILE\\Vencord"',
        ')',
        '$vencordPath = $null',
        'foreach ($c in $candidates) { if (Test-Path "$c\\src") { $vencordPath = $c; break } }',
        'if (-not $vencordPath) {',
        '  Write-Host "  [!] Vencord kaynak klasoru otomatik bulunamadi." -ForegroundColor Yellow',
        '  $vencordPath = Read-Host "  Lutfen Vencord klasor yolunu yapistirin (Orn: C:\\Users\\Ad\\Documents\\Vencord)"',
        '}',
        'if (-not (Test-Path "$vencordPath\\src")) {',
        '  Write-Host "  [X] Gecersiz Vencord dizini! (Icinde src klasoru olmali).Once git clone ile Vencord kaynak kodunu indirin." -ForegroundColor Red',
        '  Read-Host "  Kapatmak icin Enter\'a basin"',
        '  exit 1',
        '}',
        '$userpluginsDir = Join-Path $vencordPath "src\\userplugins"',
        'if (-not (Test-Path $userpluginsDir)) { New-Item -ItemType Directory -Path $userpluginsDir -Force | Out-Null }',
        `$plugins = @(${pluginFolders.map((f) => `"${f}"`).join(', ')})`,
        'foreach ($p in $plugins) {',
        '  $src = Join-Path $PSScriptRoot $p',
        '  $dst = Join-Path $userpluginsDir $p',
        '  if (Test-Path $src) {',
        '    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }',
        '    Copy-Item -Recurse -Force $src $dst',
        '    Write-Host "  [+] Kuruldu -> src\\userplugins\\$p" -ForegroundColor Green',
        '  }',
        '}',
        'Write-Host ""',
        'Write-Host "  [*] Vencord derleniyor (pnpm build)..." -ForegroundColor Cyan',
        'Push-Location $vencordPath',
        'try {',
        '  cmd /c "pnpm build"',
        '  Write-Host ""',
        '  Write-Host "  [BASARILI] Pluginler derlendi! Discord\'da Ctrl+R yapip Vencord -> Plugins menüsünden aktif edebilirsiniz." -ForegroundColor Green',
        '  $inj = Read-Host "  Vencord\'u Discord\'a simdi enjekte etmek ister misiniz? (E/H)"',
        '  if ($inj -match "^[EeYy]") { cmd /c "pnpm inject" }',
        '} finally { Pop-Location }',
        'Write-Host ""',
        'Read-Host "  Tamamlandi! Cikmak icin Enter\'a basin"'
    ].join('\r\n');

    const batLauncher = [
        '@echo off',
        'chcp 65001 >nul',
        'title EARLY.HOST — Vencord Plugin Kurucu',
        'cd /d "%~dp0"',
        'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"',
        ''
    ].join('\r\n');

    const readmeTxt = [
        '============================================================',
        '  EARLY.HOST — VENCORD USERPLUGINS KURULUM REHBERI',
        '  Resmi Topluluk: https://discord.gg/anonim',
        '============================================================',
        '',
        'OTOMATIK KURULUM (ONERILEN):',
        '1. ZIP dosyasini bir klasore cikartin.',
        '2. Klasordeki "Kurulum_Baslat.bat" dosyasina cift tiklayin.',
        '3. Betik otomatik olarak Vencord\\src\\userplugins klasorune',
        '   eklentileri kopyalayip "pnpm build" komutunu calistiracaktir.',
        '4. Discord\'da Ctrl + R yapip Ayarlar -> Vencord -> Plugins',
        '   menusunden eklentiyi aktif edin!',
        '',
        'MANUEL KURULUM:',
        `1. Klasordeki (${pluginFolders.join(', ')}) dizinini`,
        '   "Documents\\Vencord\\src\\userplugins\\" icine atin.',
        '2. Vencord klasorunde terminal acip "pnpm build" yazin.',
        '3. Discord\'u yeniden baslatin (Ctrl + R).',
        ''
    ].join('\r\n');

    return [
        { name: 'install.ps1', data: Buffer.from('\uFEFF' + psScript, 'utf8') },
        { name: 'Kurulum_Baslat.bat', data: Buffer.from(batLauncher, 'utf8') },
        { name: 'KURULUM_OKU.txt', data: Buffer.from(readmeTxt, 'utf8') }
    ];
}

// Active SSE scan jobs: jobId -> { status, progress, message, result, error, clients: Set }
const scanJobs = new Map();

// Smart TTL Cache for Discord Vanity Invite Checks (prevents Cloudflare 1015 rate-limit bursts)
const vanityCheckCache = new Map();
const VANITY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Managed Python Backend State
let robloxBackendProcess = null;

function checkRobloxBackend() {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${ROBLOX_PORT}/api/presets`, { timeout: 1500 }, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function ensureRobloxBackend() {
    const alive = await checkRobloxBackend();
    if (alive) {
        console.log('  [+] Roblox Value Scanner motoru (Port 8765) zaten aktif.');
        return true;
    }

    if (!fs.existsSync(ROBLOX_APP_PATH)) {
        console.log('  [!] Roblox Value Scanner dosyası bulunamadı:', ROBLOX_APP_PATH);
        return false;
    }

    console.log('  [*] Roblox Value Scanner Python motoru başlatılıyor...');
    try {
        robloxBackendProcess = spawn('python', [ROBLOX_APP_PATH], {
            cwd: path.dirname(ROBLOX_APP_PATH),
            env: { ...process.env, NO_BROWSER: '1', PYTHONIOENCODING: 'utf-8' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        robloxBackendProcess.stdout.on('data', (d) => {
            const msg = d.toString().trim();
            if (msg) console.log(`  [Roblox Engine] ${msg}`);
        });

        robloxBackendProcess.stderr.on('data', (d) => {
            const msg = d.toString().trim();
            if (msg && !msg.includes('GET /api/') && !msg.includes('POST /api/')) {
                // quiet normal http logs
            }
        });

        robloxBackendProcess.on('exit', (code) => {
            console.log(`  [!] Roblox motoru kapandı (kod: ${code})`);
            robloxBackendProcess = null;
        });

        // Wait up to 4 seconds for port 8765 to come online
        for (let i = 0; i < 12; i++) {
            await new Promise((r) => setTimeout(r, 350));
            if (await checkRobloxBackend()) {
                console.log('  [+] Roblox Value Scanner motoru başarıyla bağlandı!');
                return true;
            }
        }
    } catch (err) {
        console.error('  [!] Roblox motoru başlatılamadı:', err.message);
    }
    return false;
}

// Cleanup child process on exit
process.on('SIGINT', () => {
    if (robloxBackendProcess) {
        try { robloxBackendProcess.kill(); } catch (_) {}
    }
    process.exit(0);
});
process.on('SIGTERM', () => {
    if (robloxBackendProcess) {
        try { robloxBackendProcess.kill(); } catch (_) {}
    }
    process.exit(0);
});

// MIME Types
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2'
};

function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function readJsonBody(req) {
    return new Promise((resolve) => {
        let raw = '';
        let aborted = false;
        req.on('data', (chunk) => {
            if (aborted) return;
            raw += chunk;
            if (raw.length > 512 * 1024) {
                aborted = true;
                req.destroy();
                resolve({});
            }
        });
        req.on('end', () => {
            if (aborted) return;
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (_) {
                resolve({});
            }
        });
        req.on('error', () => resolve({}));
    });
}

function serveStaticFile(res, filePath) {
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            sendJson(res, 404, { ok: false, error: 'Dosya bulunamadı' });
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': contentType,
            'Cache-Control': ext === '.png' || ext === '.ico' ? 'public, max-age=3600' : 'no-store, no-cache, must-revalidate'
        });
        fs.createReadStream(filePath).pipe(res);
    });
}

// Proxy requests to Python Roblox Scanner (buffers request body before async backend check!)
async function proxyToRoblox(req, res, targetSubPath) {
    const bodyChunks = [];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        await new Promise((resolve) => {
            req.on('data', (chunk) => {
                bodyChunks.push(chunk);
                if (bodyChunks.length > 500) req.destroy();
            });
            req.on('end', resolve);
            req.on('error', resolve);
        });
    }
    const bodyBuf = Buffer.concat(bodyChunks);

    const alive = await checkRobloxBackend();
    if (!alive) {
        await ensureRobloxBackend();
    }

    const headers = {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Accept': 'application/json'
    };
    if (bodyBuf.length > 0) {
        headers['Content-Length'] = bodyBuf.length;
    }

    const options = {
        hostname: '127.0.0.1',
        port: ROBLOX_PORT,
        path: targetSubPath,
        method: req.method,
        headers,
        timeout: 90000
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
            'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        if (!res.headersSent) {
            sendJson(res, 502, { ok: false, error: `Roblox tarama motoruna ulaşılamadı: ${err.message}` });
        }
    });

    proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) {
            sendJson(res, 504, { ok: false, error: 'Roblox tarama isteği zaman aşımına uğradı.' });
        }
    });

    if (bodyBuf.length > 0) {
        proxyReq.write(bodyBuf);
    }
    proxyReq.end();
}

// Send Discord Scraper Report to Webhook
async function sendDiscordScanToWebhook(webhookUrl, scanResult) {
    if (!webhookUrl || (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && !webhookUrl.startsWith('https://discordapp.com/api/webhooks/'))) {
        throw new Error('Geçerli bir Discord Webhook URL girin.');
    }

    const lines = scanResult.results || [];
    if (lines.length === 0) {
        await axios.post(webhookUrl, {
            embeds: [{
                title: `${scanResult.guildName || 'Sunucu'} — Tarama Raporu`,
                description: 'Bu filtrede nadir rozetli üye bulunamadı.',
                color: 0x111113,
                footer: { text: 'EARLY.HOST • discord.gg/anonim' }
            }]
        });
        return;
    }

    const chunkSize = 15;
    const totalPages = Math.ceil(lines.length / chunkSize);

    for (let p = 0; p < totalPages; p++) {
        const slice = lines.slice(p * chunkSize, (p + 1) * chunkSize);
        const embed = {
            title: `🔍 ${scanResult.guildName || 'Discord Sunucu Raporu'}`,
            description: slice.join('\n'),
            color: 0x09090B,
            footer: {
                text: totalPages > 1
                    ? `EARLY.HOST • discord.gg/anonim • Sayfa ${p + 1}/${totalPages}`
                    : `EARLY.HOST • discord.gg/anonim • Toplam ${lines.length} Hesap`
            }
        };
        if (scanResult.guildIcon) {
            embed.thumbnail = { url: scanResult.guildIcon };
        }

        await axios.post(webhookUrl, { embeds: [embed] }, { timeout: 10000 });
        if (p < totalPages - 1) {
            await new Promise((r) => setTimeout(r, 1100));
        }
    }
}

const server = http.createServer(async (req, res) => {
    try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            ...SECURITY_HEADERS,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-EarlyHost-Session'
        });
        res.end();
        return;
    }

    // LAYER-7 WAF, ANTI-DDOS & ANTI-SCRAPING SHIELD
    const wafCheck = checkWafAndRateLimit(req, pathname);
    if (!wafCheck.allowed) {
        sendJson(res, wafCheck.status || 429, { ok: false, error: wafCheck.error });
        return;
    }

    // HONEYPOT TRAP ENDPOINTS (Auto-blacklists automated scraper/exploit bots!)
    if (pathname === '/api/internal/dump-keys' || pathname === '/wp-admin' || pathname === '/phpmyadmin') {
        const trapIp = getClientIp(req);
        if (trapIp !== '127.0.0.1' && trapIp !== '::1') {
            const vdbTrap = loadVisitorsDb();
            if (!vdbTrap.blockedIps.includes(trapIp)) {
                vdbTrap.blockedIps.push(trapIp);
                saveVisitorsDb(vdbTrap);
            }
        }
        wafBlockedTotalCount++;
        sendJson(res, 403, { ok: false, error: 'WAF Honeypot: Otomatik saldırı tespit edildi ve IP kara listeye alındı.' });
        return;
    }

    // ================= 0. REAL HWID PROBE, STRICT SINGLE-DEVICE KEY LOCK & MULTI-ROLE API =================
    if (pathname === '/api/auth/hwid-probe' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const spec = body.spec || {};
        const hw = deriveVerifiedHwid(req, spec);
        const ip = getClientIp(req);
        const bl = isClientBlacklisted(ip, hw.hwid);
        if (bl.blocked) {
            recordVisitorEvent(req, { eventType: 'BLACKLIST_BLOCK', spec, hw, note: 'Kara listedeki cihaz siteyi açmaya çalıştı.' });
            sendJson(res, 403, { ok: false, blacklisted: true, error: bl.reason, hardware: hw });
            return;
        }
        recordVisitorEvent(req, { eventType: 'GATE_VISIT', spec, hw, note: '3D Giriş Kasası görüntülendi.' });
        sendJson(res, 200, { ok: true, hardware: hw });
        return;
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const spec = body.spec || {};
        const inputKey = String(body.key || '').trim();
        const clientIp = getClientIp(req);

        // Server-verified real hardware HWID
        const hwInfo = deriveVerifiedHwid(req, spec);
        const verifiedHwid = hwInfo.hwid;

        const bl = isClientBlacklisted(clientIp, verifiedHwid);
        if (bl.blocked) {
            recordVisitorEvent(req, { eventType: 'BLACKLIST_BLOCK', spec, hw: hwInfo, keyInfo: inputKey.slice(0, 16), note: bl.reason });
            sendJson(res, 403, { ok: false, error: bl.reason });
            return;
        }

        // Brute-Force Key Guessing Lockout Protection
        const bf = checkLoginBruteForce(clientIp, verifiedHwid);
        if (bf.locked) {
            wafBlockedTotalCount++;
            sendJson(res, 429, { ok: false, error: `Brute-Force Koruması: Çok fazla hatalı anahtar denendi. Lütfen ${bf.waitSec} saniye bekleyin.` });
            return;
        }

        if (!inputKey) {
            sendJson(res, 400, { ok: false, error: 'Lütfen Lisans Anahtarınızı (Key) girin.' });
            return;
        }

        const db = loadKeysDb();
        const keyObj = db.keys.find((k) => k.key === inputKey);

        if (!keyObj) {
            registerLoginFailure(clientIp, verifiedHwid);
            addAuthLog(db, 'FAIL', `Geçersiz key denemesi (${inputKey.slice(0, 12)}...) • HWID: ${verifiedHwid} • IP: ${clientIp}`);
            saveKeysDb(db);
            recordVisitorEvent(req, {
                eventType: 'AUTH_REJECT',
                spec,
                hw: hwInfo,
                keyInfo: `${inputKey.slice(0, 18)} (Geçersiz)`,
                note: 'Sistemde kayıtlı olmayan geçersiz anahtar denendi.'
            });
            sendJson(res, 401, { ok: false, error: 'Geçersiz Lisans Anahtarı! Key almak için discord.gg/anonim sunucusuna ulaşın.' });
            return;
        }

        if (keyObj.banned) {
            addAuthLog(db, 'BAN_BLOCK', `Yasaklı key giriş denemesi (${keyObj.label || keyObj.key}) • HWID: ${verifiedHwid}`);
            saveKeysDb(db);
            recordVisitorEvent(req, {
                eventType: 'AUTH_REJECT',
                spec,
                hw: hwInfo,
                role: keyObj.role,
                keyLabel: keyObj.label,
                keyInfo: `${keyObj.label} (${keyObj.key.slice(0, 12)}...)`,
                note: 'Yasaklanmış (BANLI) anahtar ile giriş denendi.'
            });
            sendJson(res, 403, { ok: false, error: 'Bu Lisans Anahtarı yönetici tarafından yasaklanmıştır (BAN).' });
            return;
        }

        if (keyObj.expiresAt && Date.now() > keyObj.expiresAt) {
            recordVisitorEvent(req, {
                eventType: 'AUTH_REJECT',
                spec,
                hw: hwInfo,
                role: keyObj.role,
                keyLabel: keyObj.label,
                keyInfo: `${keyObj.label}`,
                note: 'Süresi dolmuş anahtar ile giriş denendi.'
            });
            sendJson(res, 403, { ok: false, error: 'Lisans süreniz sona ermiştir. Yenilemek için yöneticiyle iletişime geçin.' });
            return;
        }

        // STRICT SINGLE-HWID ENFORCEMENT: Every key ONLY works on its single bound HWID!
        if (!keyObj.hwid) {
            keyObj.hwid = verifiedHwid;
            keyObj.hwidSpec = `${hwInfo.cpu} | ${hwInfo.gpu}`;
            keyObj.hwidLocked = true;
            addAuthLog(db, 'HWID_BIND', `${keyObj.label || keyObj.key} donanıma mühürlendi -> ${verifiedHwid} (${hwInfo.cpu})`);
        } else if (keyObj.hwid !== verifiedHwid) {
            addAuthLog(db, 'HWID_MISMATCH', `REDDEDİLDİ! ${keyObj.label} başka donanımdan denendi! Kayıtlı: ${keyObj.hwid} ≠ Gelen: ${verifiedHwid}`);
            saveKeysDb(db);
            recordVisitorEvent(req, {
                eventType: 'AUTH_REJECT',
                spec,
                hw: hwInfo,
                role: keyObj.role,
                keyLabel: keyObj.label,
                keyInfo: `${keyObj.label} (${keyObj.role})`,
                note: `FARKLI BİLGİSAYAR ENGELLENDİ! Kayıtlı HWID: ${keyObj.hwid} ≠ Deneyen: ${verifiedHwid}`
            });
            sendJson(res, 403, {
                ok: false,
                error: `DONANIM (HWID) KİLİDİ REDDEDİLDİ! Bu anahtar yalnızca kayıtlı cihaza (${keyObj.hwid}) aittir. Başka hiçbir cihazda çalışmaz!`
            });
            return;
        }

        // Kick any previous stale session of this key so 1 Key = 1 Active Hardware Session
        for (const [oldTok, oldSess] of activeAuthSessions.entries()) {
            if (oldSess.key === keyObj.key && oldSess.hwid !== verifiedHwid) {
                activeAuthSessions.delete(oldTok);
            }
        }

        keyObj.lastLoginAt = Date.now();
        keyObj.lastIp = clientIp;
        keyObj.loginCount = (keyObj.loginCount || 0) + 1;
        keyObj.hwidSpec = `${hwInfo.cpu} | ${hwInfo.gpu}`;
        addAuthLog(db, 'LOGIN', `${keyObj.role} girişi onaylandı: ${keyObj.label || keyObj.key} [${verifiedHwid}]`);
        saveKeysDb(db);

        recordVisitorEvent(req, {
            eventType: 'AUTH_SUCCESS',
            spec,
            hw: hwInfo,
            role: keyObj.role,
            keyLabel: keyObj.label,
            keyInfo: `${keyObj.label} [${keyObj.role}]`,
            note: `Başarılı giriş (#${keyObj.loginCount})`
        });

        clearLoginFailures(clientIp, verifiedHwid);
        const nowTs = Date.now();
        const sessionToken = createSignedSessionToken({
            key: keyObj.key,
            role: keyObj.role,
            hwid: verifiedHwid,
            iat: nowTs,
            nonce: crypto.randomBytes(8).toString('hex')
        });
        activeAuthSessions.set(sessionToken, {
            key: keyObj.key,
            role: keyObj.role,
            hwid: verifiedHwid,
            ip: clientIp,
            createdAt: nowTs
        });

        sendJson(res, 200, {
            ok: true,
            sessionToken,
            announcement: db.announcement || '',
            hardware: hwInfo,
            profile: {
                key: keyObj.key,
                role: keyObj.role,
                label: keyObj.label || 'Kullanıcı',
                hwid: keyObj.hwid,
                hwidSpec: keyObj.hwidSpec || '',
                hwidLocked: true,
                createdAt: keyObj.createdAt,
                expiresAt: keyObj.expiresAt,
                loginCount: keyObj.loginCount
            }
        });
        return;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
        const check = validateSessionFromReq(req);
        if (!check.ok) {
            sendJson(res, 401, { ok: false, requireGate: true, error: check.error });
            return;
        }
        const k = check.keyObj;
        const hwInfo = deriveVerifiedHwid(req, {});
        sendJson(res, 200, {
            ok: true,
            requireGate: true,
            announcement: check.db.announcement || '',
            hardware: hwInfo,
            profile: {
                key: k.key,
                role: k.role,
                label: k.label || 'Kullanıcı',
                hwid: k.hwid || check.session.hwid,
                hwidSpec: k.hwidSpec || `${hwInfo.cpu}`,
                hwidLocked: true,
                createdAt: k.createdAt,
                expiresAt: k.expiresAt,
                loginCount: k.loginCount || 1
            }
        });
        return;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const token = String(req.headers['x-earlyhost-session'] || '').trim();
        if (token) activeAuthSessions.delete(token);
        sendJson(res, 200, { ok: true });
        return;
    }

    // SELF HWID RESET DISABLED FOR USERS — ONLY ADMIN / OWNER CAN UNLOCK OR TRANSFER HWID!
    if (pathname === '/api/auth/self-reset-hwid' && req.method === 'POST') {
        const check = validateSessionFromReq(req);
        if (!check.ok) return sendJson(res, 401, { ok: false, error: check.error });
        const k = check.keyObj;
        if (k.role !== 'OWNER' && k.role !== 'ADMIN') {
            return sendJson(res, 403, {
                ok: false,
                error: 'Güvenlik Politikası: Anahtarlar tek bir HWID donanımına kalıcı mühürlenir. Cihaz değişimi için sadece Kurucu (Owner) veya Admin HWID sıfırlayabilir!'
            });
        }
        k.hwid = null;
        addAuthLog(check.db, 'STAFF_HWID_RESET', `${k.label} (${k.role}) kendi HWID kilidini sıfırladı.`);
        saveKeysDb(check.db);
        sendJson(res, 200, { ok: true, message: 'Yetkili HWID kilidi sıfırlandı.' });
        return;
    }

    // ADMIN & OWNER KEY MANAGEMENT ENDPOINTS
    if (pathname === '/api/admin/keys' && req.method === 'GET') {
        const check = validateSessionFromReq(req);
        if (!check.ok) return sendJson(res, 401, { ok: false, error: check.error });
        const actorRole = check.keyObj.role;
        if (actorRole !== 'OWNER' && actorRole !== 'ADMIN') {
            return sendJson(res, 403, { ok: false, error: 'Bu panele sadece ADMIN ve OWNER yetkisi erişebilir.' });
        }

        const keysList = check.db.keys.map((k) => {
            // ADMIN cannot see OWNER's raw secret key string!
            const maskSecret = actorRole === 'ADMIN' && k.role === 'OWNER';
            return {
                key: maskSecret ? `${k.key.slice(0, 10)}-****-GİZLİ` : k.key,
                isMasked: maskSecret,
                role: k.role,
                label: k.label,
                hwid: k.hwid,
                hwidSpec: k.hwidSpec || '',
                hwidLocked: true,
                createdAt: k.createdAt,
                expiresAt: k.expiresAt,
                banned: Boolean(k.banned),
                lastLoginAt: k.lastLoginAt,
                lastIp: actorRole === 'OWNER' ? k.lastIp : (k.lastIp ? '***.***.***' : null),
                loginCount: k.loginCount || 0,
                createdBy: k.createdBy || 'SYSTEM'
            };
        });

        sendJson(res, 200, {
            ok: true,
            actorRole,
            requireGate: check.db.requireGate !== false,
            announcement: check.db.announcement || '',
            activeSessionsCount: activeAuthSessions.size,
            wafBlockedCount: wafBlockedTotalCount,
            keys: keysList,
            logs: (check.db.logs || []).slice(0, 50)
        });
        return;
    }

    if (pathname === '/api/admin/keys/create' && req.method === 'POST') {
        const check = validateSessionFromReq(req);
        if (!check.ok) return sendJson(res, 401, { ok: false, error: check.error });
        const actor = check.keyObj;
        if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
            return sendJson(res, 403, { ok: false, error: 'Yetkisiz işlem.' });
        }

        const body = await readJsonBody(req);
        let targetRole = String(body.role || 'USER').toUpperCase();
        if (!['USER', 'ADMIN', 'OWNER'].includes(targetRole)) targetRole = 'USER';

        // Strict Hierarchy: Only OWNER can create ADMIN or OWNER keys! ADMIN can only create USER keys!
        if (actor.role !== 'OWNER' && targetRole !== 'USER') {
            return sendJson(res, 403, { ok: false, error: 'Admin yetkisi yalnızca KULLANICI (USER) anahtarı oluşturabilir. Admin/Owner anahtarını sadece Kurucu (OWNER) açabilir.' });
        }

        const label = String(body.label || 'Üye Lisansı').trim().slice(0, 48);
        const customKey = String(body.customKey || '').trim();
        const prebindHwid = String(body.targetHwid || '').trim().toUpperCase();
        const durationDays = Number(body.durationDays || 0); // 0 = Lifetime
        const count = Math.min(10, Math.max(1, Number(body.count) || 1));

        const createdKeys = [];
        for (let i = 0; i < count; i++) {
            const prefix = targetRole === 'OWNER' ? 'OWNER' : (targetRole === 'ADMIN' ? 'ADMIN' : 'EARLY');
            const finalKey = (count === 1 && customKey.length >= 4) ? customKey : generateLicenseString(prefix);
            if (check.db.keys.some((x) => x.key === finalKey)) {
                return sendJson(res, 400, { ok: false, error: `Bu anahtar zaten mevcut: ${finalKey}` });
            }

            const expiresAt = durationDays > 0 ? (Date.now() + durationDays * 86400000) : null;
            const entry = {
                key: finalKey,
                role: targetRole,
                label: count > 1 ? `${label} #${i + 1}` : label,
                hwid: (count === 1 && prebindHwid.length >= 8) ? prebindHwid : null,
                hwidSpec: (count === 1 && prebindHwid.length >= 8) ? 'Önceden HWID Mühürlü' : '',
                hwidLocked: true,
                maxHwidResets: 0,
                hwidResetCount: 0,
                createdAt: Date.now(),
                expiresAt,
                banned: false,
                lastLoginAt: null,
                lastIp: null,
                loginCount: 0,
                createdBy: `${actor.label} (${actor.role})`
            };
            check.db.keys.unshift(entry);
            createdKeys.push(entry);
        }

        addAuthLog(check.db, 'KEY_CREATE', `${actor.label} (${actor.role}) -> ${createdKeys.length} adet ${targetRole} key oluşturdu (${label})`);
        saveKeysDb(check.db);
        sendJson(res, 200, { ok: true, created: createdKeys });
        return;
    }

    if (pathname === '/api/admin/keys/action' && req.method === 'POST') {
        const check = validateSessionFromReq(req);
        if (!check.ok) return sendJson(res, 401, { ok: false, error: check.error });
        const actor = check.keyObj;
        if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
            return sendJson(res, 403, { ok: false, error: 'Yetkisiz işlem.' });
        }

        const body = await readJsonBody(req);
        const action = String(body.action || '');
        const targetKeyStr = String(body.targetKey || '').trim();

        // Global Owner-only actions
        if (action === 'set-announcement') {
            if (actor.role !== 'OWNER') return sendJson(res, 403, { ok: false, error: 'Sistem duyurusunu sadece Kurucu (OWNER) değiştirebilir.' });
            check.db.announcement = String(body.announcement || '').trim().slice(0, 280);
            addAuthLog(check.db, 'ANNOUNCEMENT', `Kurucu sistem duyurusunu güncelledi.`);
            saveKeysDb(check.db);
            return sendJson(res, 200, { ok: true, message: 'Sistem duyurusu güncellendi!' });
        }

        if (action === 'reset-all-user-hwids') {
            if (actor.role !== 'OWNER') return sendJson(res, 403, { ok: false, error: 'Toplu HWID sıfırlamayı sadece Kurucu (OWNER) yapabilir.' });
            let cnt = 0;
            check.db.keys.forEach((k) => {
                if (k.hwid) { k.hwid = null; cnt++; }
            });
            addAuthLog(check.db, 'GLOBAL_HWID_RESET', `Kurucu tüm anahtarların (${cnt}) HWID kilidini sıfırladı.`);
            saveKeysDb(check.db);
            return sendJson(res, 200, { ok: true, message: `${cnt} anahtarın HWID kilidi sıfırlandı!` });
        }

        const target = check.db.keys.find((k) => k.key === targetKeyStr);
        if (!target) return sendJson(res, 404, { ok: false, error: 'Hedef anahtar bulunamadı.' });

        // Hierarchy Protection: ADMIN cannot touch OWNER or other ADMIN keys!
        if (actor.role === 'ADMIN' && target.role !== 'USER') {
            return sendJson(res, 403, { ok: false, error: 'Admin yetkisi yalnızca USER anahtarları üzerinde işlem yapabilir!' });
        }

        // Prevent deleting your own active OWNER key if it's the last OWNER key
        if (target.key === actor.key && (action === 'delete' || action === 'ban')) {
            return sendJson(res, 400, { ok: false, error: 'Şu an giriş yaptığınız kendi Kurucu anahtarınızı silemez veya yasaklayamazsınız!' });
        }

        if (action === 'reset-hwid') {
            target.hwid = null;
            target.revokedBefore = Date.now();
            for (const [tok, s] of activeAuthSessions.entries()) {
                if (s.key === target.key) activeAuthSessions.delete(tok);
            }
            addAuthLog(check.db, 'HWID_RESET', `${actor.label} -> ${target.label} (${target.key.slice(0, 10)}...) HWID sıfırladı.`);
            saveKeysDb(check.db);
            return sendJson(res, 200, { ok: true, message: 'Kullanıcının HWID kilidi başarıyla sıfırlandı!' });
        }

        if (action === 'toggle-ban') {
            target.banned = !target.banned;
            if (target.banned) {
                target.revokedBefore = Date.now();
                // Kick active sessions of banned key
                for (const [tok, s] of activeAuthSessions.entries()) {
                    if (s.key === target.key) activeAuthSessions.delete(tok);
                }
            }
            addAuthLog(check.db, target.banned ? 'BAN' : 'UNBAN', `${actor.label} -> ${target.label} durumunu ${target.banned ? 'BANLI' : 'AKTİF'} yaptı.`);
            saveKeysDb(check.db);
            return sendJson(res, 200, { ok: true, message: target.banned ? 'Anahtar yasaklandı ve oturumu düşürüldü!' : 'Anahtar yasağı kaldırıldı!' });
        }

        if (action === 'add-days') {
            const days = Number(body.days || 30);
            const base = (target.expiresAt && target.expiresAt > Date.now()) ? target.expiresAt : Date.now();
            target.expiresAt = days === 0 ? null : (base + days * 86400000);
            addAuthLog(check.db, 'EXTEND', `${actor.label} -> ${target.label} süresini güncelledi (${days === 0 ? 'Sınırsız' : '+' + days + ' gün'}).`);
            saveKeysDb(check.db);
            return sendJson(res, 200, { ok: true, message: days === 0 ? 'Anahtar SINIRSIZ (Lifetime) yapıldı!' : `+${days} gün süre eklendi!` });
        }

        if (action === 'delete') {
            check.db.keys = check.db.keys.filter((k) => k.key !== target.key);
            for (const [tok, s] of activeAuthSessions.entries()) {
                if (s.key === target.key) activeAuthSessions.delete(tok);
            }
            addAuthLog(check.db, 'DELETE', `${actor.label} -> ${target.label} (${target.role}) anahtarını sildi.`);
            saveKeysDb(check.db);
            return sendJson(res, 200, { ok: true, message: 'Lisans anahtarı kalıcı olarak silindi.' });
        }

        return sendJson(res, 400, { ok: false, error: 'Bilinmeyen işlem.' });
    }

    // OWNER-EXCLUSIVE VISITOR RADAR & FULL GELİŞMİŞ LOG API
    if (pathname === '/api/owner/visitors' && req.method === 'GET') {
        const check = validateSessionFromReq(req);
        if (!check.ok) return sendJson(res, 401, { ok: false, error: check.error });
        if (check.keyObj.role !== 'OWNER') {
            return sendJson(res, 403, { ok: false, error: 'Ziyaretçi istihbarat kayıtlarına yalnızca Kurucu (OWNER) erişebilir.' });
        }

        const vdb = loadVisitorsDb();
        const list = vdb.visitors || [];
        const uniqueHwids = new Set(list.map((v) => v.hwid).filter(Boolean)).size;
        const authCount = list.filter((v) => v.eventType === 'AUTH_SUCCESS').length;
        const rejectCount = list.filter((v) => v.eventType === 'AUTH_REJECT' || v.eventType === 'BLACKLIST_BLOCK').length;

        sendJson(res, 200, {
            ok: true,
            webhookUrl: vdb.webhookUrl || '',
            webhookMode: vdb.webhookMode || 'all',
            blockedHwids: vdb.blockedHwids || [],
            blockedIps: vdb.blockedIps || [],
            stats: {
                totalRecords: list.length,
                uniqueHwids,
                authCount,
                rejectCount,
                blacklistedCount: (vdb.blockedHwids?.length || 0) + (vdb.blockedIps?.length || 0)
            },
            visitors: list.slice(0, 200)
        });
        return;
    }

    if (pathname === '/api/owner/visitors/action' && req.method === 'POST') {
        const check = validateSessionFromReq(req);
        if (!check.ok) return sendJson(res, 401, { ok: false, error: check.error });
        if (check.keyObj.role !== 'OWNER') {
            return sendJson(res, 403, { ok: false, error: 'Bu işlem yalnızca Kurucu (OWNER) içindir.' });
        }

        const body = await readJsonBody(req);
        const action = String(body.action || '');
        const vdb = loadVisitorsDb();

        if (action === 'save-webhook') {
            vdb.webhookUrl = String(body.webhookUrl || '').trim();
            vdb.webhookMode = body.webhookMode === 'auth_only' ? 'auth_only' : 'all';
            saveVisitorsDb(vdb);
            return sendJson(res, 200, { ok: true, message: vdb.webhookUrl ? 'Ziyaretçi Log Webhook adresi kaydedildi ve aktif edildi!' : 'Webhook bildirimi kapatıldı.' });
        }

        if (action === 'test-webhook') {
            const url = String(body.webhookUrl || vdb.webhookUrl || '').trim();
            const sample = vdb.visitors[0] || recordVisitorEvent(req, { eventType: 'GATE_VISIT', spec: body.spec || {}, note: 'Test' });
            const geo = await resolveIpGeo(getClientIp(req), body.spec?.clientIpv4);
            const enriched = {
                ...(sample || {}),
                displayIp: geo.publicIp,
                country: geo.country,
                isp: geo.isp,
                ts: Date.now()
            };
            try {
                await sendVisitorWebhookAlert(url, enriched, true);
                return sendJson(res, 200, { ok: true, message: 'Sade ve çizgisiz giriş kaydı Discord kanalına gönderildi!' });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: `Webhook gönderilemedi: ${err.message}` });
            }
        }

        if (action === 'toggle-block-hwid') {
            const targetHwid = String(body.hwid || '').trim();
            if (!targetHwid) return sendJson(res, 400, { ok: false, error: 'Geçersiz HWID.' });
            if (targetHwid === check.keyObj.hwid) {
                return sendJson(res, 400, { ok: false, error: 'Kendi Kurucu cihazınızın HWID kimliğini kara listeye alamazsınız!' });
            }
            const idx = vdb.blockedHwids.indexOf(targetHwid);
            if (idx >= 0) {
                vdb.blockedHwids.splice(idx, 1);
                saveVisitorsDb(vdb);
                return sendJson(res, 200, { ok: true, message: `${targetHwid} kara listeden çıkarıldı.` });
            } else {
                vdb.blockedHwids.push(targetHwid);
                for (const [tok, s] of activeAuthSessions.entries()) {
                    if (s.hwid === targetHwid) activeAuthSessions.delete(tok);
                }
                saveVisitorsDb(vdb);
                return sendJson(res, 200, { ok: true, message: `${targetHwid} kalıcı kara listeye alındı ve oturumu kapatıldı!` });
            }
        }

        if (action === 'toggle-block-ip') {
            const targetIp = String(body.ip || '').trim();
            if (!targetIp || targetIp === '127.0.0.1' || targetIp === '::1') {
                return sendJson(res, 400, { ok: false, error: 'Yerel sunucu IP adresi engellenemez.' });
            }
            const idx = vdb.blockedIps.indexOf(targetIp);
            if (idx >= 0) {
                vdb.blockedIps.splice(idx, 1);
                saveVisitorsDb(vdb);
                return sendJson(res, 200, { ok: true, message: `${targetIp} IP engeli kaldırıldı.` });
            } else {
                vdb.blockedIps.push(targetIp);
                saveVisitorsDb(vdb);
                return sendJson(res, 200, { ok: true, message: `${targetIp} IP adresi WAF kara listesine alındı!` });
            }
        }

        if (action === 'clear-visitors') {
            vdb.visitors = [];
            saveVisitorsDb(vdb);
            return sendJson(res, 200, { ok: true, message: 'Tüm ziyaretçi log geçmişi temizlendi.' });
        }

        if (action === 'send-single-webhook') {
            const entry = vdb.visitors.find((x) => x.id === String(body.id || ''));
            if (!entry) return sendJson(res, 404, { ok: false, error: 'Kayıt bulunamadı.' });
            const url = String(vdb.webhookUrl || '').trim();
            if (!url) return sendJson(res, 400, { ok: false, error: 'Önce yukarıdan Discord Webhook URL kaydedin.' });
            try {
                await sendVisitorWebhookAlert(url, entry, false);
                return sendJson(res, 200, { ok: true, message: 'Ziyaretçi logu Discord kanalına gönderildi!' });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: err.message });
            }
        }

        return sendJson(res, 400, { ok: false, error: 'Bilinmeyen işlem.' });
    }

    // ENFORCE LICENSE GATE ON ALL LIVE TOOL & DOWNLOAD API ROUTES
    let activeSessionInfo = null;
    if (pathname.startsWith('/api/') && pathname !== '/api/status') {
        const dbNow = loadKeysDb();
        if (dbNow.requireGate !== false) {
            const check = validateSessionFromReq(req);
            if (!check.ok) {
                sendJson(res, 401, { ok: false, authRequired: true, error: check.error });
                return;
            }
            activeSessionInfo = check;
        }
    }

    // 1. SYSTEM STATUS API
    if (pathname === '/api/status' && req.method === 'GET') {
        const robloxAlive = await checkRobloxBackend();
        const hasEnvToken = Boolean(process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN.trim().length > 10);
        const hasEnvWebhook = Boolean(process.env.WEBHOOK_URL && process.env.WEBHOOK_URL.startsWith('http'));
        sendJson(res, 200, {
            ok: true,
            brand: 'EARLY.HOST',
            discordInvite: 'https://discord.gg/anonim',
            engines: {
                discordScraper: true,
                robloxScanner: robloxAlive
            },
            defaults: {
                hasEnvToken,
                webhookUrl: hasEnvWebhook ? process.env.WEBHOOK_URL : ''
            }
        });
        return;
    }

    // 2A. NATIVE DISCORD GUILD -> LINKED ROBLOX ACCOUNTS SCANNER (SSE JOB)
    if (pathname === '/api/roblox/guild-scan' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const token = (body.token || process.env.DISCORD_TOKEN || '').trim();
        const guildId = String(body.guildId || '').replace(/[^\d]/g, '').trim();
        const scanLimit = Number(body.scanLimit ?? 300);
        const minValue = Number(body.minValue ?? 0);
        const includeNicknames = body.includeNicknames !== false;
        const webhookUrl = String(body.webhookUrl || '').trim();
        const autoWebhook = Boolean(body.autoWebhook);

        if (!token) {
            sendJson(res, 400, { ok: false, error: 'Lütfen Discord Hesap Tokeninizi girin.' });
            return;
        }
        if (!guildId || guildId.length < 15) {
            sendJson(res, 400, { ok: false, error: 'Lütfen geçerli bir Discord Sunucu ID (Guild ID) girin veya listeden sunucu seçin.' });
            return;
        }

        const actorHwid = activeSessionInfo?.session?.hwid || getClientIp(req);
        if ((activeScanCountByHwid.get(actorHwid) || 0) >= 2) {
            sendJson(res, 429, { ok: false, error: 'Aynı anda en fazla 2 canlı sunucu taraması çalıştırabilirsiniz. Lütfen mevcut taramanın bitmesini bekleyin.' });
            return;
        }
        activeScanCountByHwid.set(actorHwid, (activeScanCountByHwid.get(actorHwid) || 0) + 1);

        const jobId = `rbx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const job = {
            id: jobId,
            status: 'running',
            progress: 4,
            message: 'Discord sunucusuna bağlanılıyor...',
            result: null,
            error: null,
            clients: new Set()
        };
        scanJobs.set(jobId, job);

        const broadcast = (payload) => {
            const msg = `data: ${JSON.stringify(payload)}\n\n`;
            for (const clientRes of job.clients) {
                try { clientRes.write(msg); } catch (_) {}
            }
        };

        (async () => {
            try {
                const resData = await runGuildRobloxScanner({
                    token,
                    guildId,
                    scanLimit,
                    minValue,
                    includeNicknames,
                    onProgress: async (msgText, pct) => {
                        job.message = String(msgText || '').replace(/\*\*/g, '');
                        job.progress = pct || job.progress;
                        broadcast({ status: 'running', progress: job.progress, message: job.message });
                    }
                });

                if (!resData.success) {
                    job.status = 'error';
                    job.error = resData.error || 'Sunucu taraması başarısız oldu.';
                    broadcast({ status: 'error', error: job.error });
                } else {
                    if (autoWebhook && webhookUrl && resData.accounts?.length > 0) {
                        try {
                            const lines = resData.accounts.slice(0, 20).map((a, idx) => {
                                const valStr = a.totalValue > 0 ? ` — \`${a.totalValue.toLocaleString('tr-TR')} R$\`` : '';
                                const badgesStr = a.matchedBadges?.length ? ` [${a.matchedBadges.join(', ')}]` : '';
                                return `\`${idx + 1}.\` **@${a.username}**${valStr}${badgesStr} ↔ <@${a.discordId}> (\`@${a.discordUsername}\`)`;
                            });
                            await axios.post(webhookUrl, {
                                username: 'Early.Host',
                                embeds: [{
                                    author: { name: `${resData.guildName} • Bağlı Roblox Hesapları (${resData.accounts.length})` },
                                    color: 0x2b2d31,
                                    description: lines.join('\n').slice(0, 3900),
                                    footer: { text: `Taranan Üye: ${resData.scannedMembers} • Early.Host` }
                                }]
                            }, { timeout: 8000 });
                            resData.webhookSent = true;
                        } catch (_) {}
                    }
                    job.status = 'done';
                    job.progress = 100;
                    job.message = 'Tarama tamamlandı!';
                    job.result = resData;
                    broadcast({ status: 'done', progress: 100, message: job.message, result: resData });
                }
            } catch (err) {
                job.status = 'error';
                job.error = err.message || 'Beklenmeyen hata oluştu.';
                broadcast({ status: 'error', error: job.error });
            } finally {
                activeScanCountByHwid.set(actorHwid, Math.max(0, (activeScanCountByHwid.get(actorHwid) || 1) - 1));
                for (const clientRes of job.clients) {
                    try { clientRes.end(); } catch (_) {}
                }
                job.clients.clear();
                setTimeout(() => scanJobs.delete(jobId), 5 * 60 * 1000);
            }
        })();

        sendJson(res, 200, { ok: true, jobId });
        return;
    }

    if (pathname === '/api/roblox/lookup-direct' && req.method === 'POST') {
        const body = await readJsonBody(req);
        try {
            const out = await lookupRobloxUsersDirect(body.usernames || '');
            sendJson(res, 200, out);
        } catch (err) {
            sendJson(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    const isDiscordWebhookUrl = (u) => /^https:\/\/((ptb|canary)\.)?(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(String(u || '').trim());

    if (pathname === '/api/roblox/test-webhook' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const webhookUrl = String(body.webhookUrl || '').trim();
        if (!isDiscordWebhookUrl(webhookUrl)) {
            sendJson(res, 400, { ok: false, error: 'Geçerli bir Discord Webhook URL girin.' });
            return;
        }
        try {
            await axios.post(webhookUrl, {
                username: 'Early.Host',
                embeds: [{
                    author: { name: 'Early.Host • Webhook Bağlantı Testi' },
                    color: 0x2b2d31,
                    description: 'Webhook bağlantısı doğrulandı. Bulunan bağlı **Roblox ↔ Discord** hesapları bu kanala sade ve çizgisiz olarak iletilecektir.'
                }]
            }, { timeout: 8000 });
            sendJson(res, 200, { ok: true });
        } catch (err) {
            sendJson(res, 400, { ok: false, error: `Webhook gönderilemedi: ${err.message}` });
        }
        return;
    }

    if ((pathname === '/api/roblox/send-webhook-clean' || pathname === '/api/roblox/send-webhook') && req.method === 'POST') {
        const body = await readJsonBody(req);
        const webhookUrl = String(body.webhookUrl || '').trim();
        const a = body.account || {};
        if (!isDiscordWebhookUrl(webhookUrl)) {
            sendJson(res, 400, { ok: false, error: 'Geçerli bir Discord Webhook URL girin.' });
            return;
        }
        try {
            const itemsStr = (a.topItems || []).slice(0, 5).map((i) => `${i.name} (\`${Number(i.value || 0).toLocaleString('tr-TR')} R$\`)`).join(', ') || 'Standart Envanter';
            const dcLine = a.discordId
                ? `**@${a.discordUsername}** • \`${a.discordId}\` (<@${a.discordId}>)`
                : (a.discordUsername ? `**@${a.discordUsername}**` : 'Belirtilmemiş');

            const desc = [
                `**Roblox:** [@${a.username}](${a.profileUrl || `https://www.roblox.com/users/${a.userId}/profile`}) (\`${a.userId}\`)`,
                `**Discord:** ${dcLine}`,
                `**Toplam Değer:** \`${Number(a.totalValue || 0).toLocaleString('tr-TR')} R$\`${a.matchedBadges?.length ? ` • ${a.matchedBadges.join(', ')}` : ''}`,
                `**Eşyalar:** ${itemsStr}`
            ].join('\n');

            await axios.post(webhookUrl, {
                username: 'Early.Host',
                embeds: [{
                    author: { name: 'Early.Host • Roblox & Discord Eşleşmesi' },
                    color: 0x2b2d31,
                    thumbnail: a.avatarUrl ? { url: a.avatarUrl } : undefined,
                    description: desc
                }]
            }, { timeout: 8000 });
            sendJson(res, 200, { ok: true });
        } catch (err) {
            sendJson(res, 400, { ok: false, error: err.message });
        }
        return;
    }

    // 2B. ROBLOX SCANNER PROXY (/api/roblox/* -> http://127.0.0.1:8765/api/*)
    if (pathname.startsWith('/api/roblox/')) {
        const subPath = '/api/' + pathname.slice('/api/roblox/'.length) + parsedUrl.search;
        await proxyToRoblox(req, res, subPath);
        return;
    }

    // 3. DISCORD SCRAPER: FETCH USER GUILDS FROM TOKEN
    if (pathname === '/api/discord/guilds' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const token = (body.token || process.env.DISCORD_TOKEN || '').trim();
        if (!token) {
            sendJson(res, 400, { ok: false, error: 'Lütfen önce Discord Hesap Tokeninizi girin.' });
            return;
        }

        const client = new Client({ checkUpdate: false });
        try {
            await Promise.race([
                client.login(token),
                new Promise((_, rej) => setTimeout(() => rej(new Error('Giriş zaman aşımına uğradı (12sn)')), 12000))
            ]);

            // Short wait for cache hydration
            if (client.guilds.cache.size === 0) {
                await new Promise((r) => setTimeout(r, 1200));
            }

            const guilds = client.guilds.cache.map((g) => ({
                id: g.id,
                name: g.name,
                memberCount: g.memberCount || 0,
                icon: g.iconURL ? g.iconURL({ dynamic: true, size: 64 }) : null
            })).sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));

            const userTag = client.user ? client.user.username : 'Bilinmiyor';
            const userAvatar = client.user?.displayAvatarURL ? client.user.displayAvatarURL({ size: 64 }) : null;

            sendJson(res, 200, {
                ok: true,
                account: { username: userTag, id: client.user?.id, avatar: userAvatar },
                guilds
            });
        } catch (err) {
            sendJson(res, 401, { ok: false, error: `Token doğrulanamadı: ${err.message || 'Geçersiz token'}` });
        } finally {
            try { client.destroy(); } catch (_) {}
        }
        return;
    }

    // 4. DISCORD SCRAPER: START LIVE SCAN JOB
    if (pathname === '/api/discord/scan' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const token = (body.token || process.env.DISCORD_TOKEN || '').trim();
        const guildId = String(body.guildId || '').replace(/[^\d]/g, '').trim();
        const filterBadge = (body.filterBadge || 'all').trim();
        const webhookUrl = (body.webhookUrl || '').trim();
        const autoWebhook = Boolean(body.autoWebhook);

        if (!token) {
            sendJson(res, 400, { ok: false, error: 'Discord Token gerekli.' });
            return;
        }
        if (!guildId || guildId.length < 15) {
            sendJson(res, 400, { ok: false, error: 'Geçerli bir Discord Sunucu ID (Guild ID) girin.' });
            return;
        }

        const actorHwidDc = activeSessionInfo?.session?.hwid || getClientIp(req);
        if ((activeScanCountByHwid.get(actorHwidDc) || 0) >= 2) {
            sendJson(res, 429, { ok: false, error: 'Aynı anda en fazla 2 canlı sunucu taraması çalıştırabilirsiniz. Lütfen mevcut taramanın bitmesini bekleyin.' });
            return;
        }
        activeScanCountByHwid.set(actorHwidDc, (activeScanCountByHwid.get(actorHwidDc) || 0) + 1);

        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const job = {
            id: jobId,
            status: 'running',
            progress: 2,
            message: 'Tarama motoru başlatılıyor...',
            result: null,
            error: null,
            clients: new Set()
        };
        scanJobs.set(jobId, job);

        const broadcast = (payload) => {
            const msg = `data: ${JSON.stringify(payload)}\n\n`;
            for (const clientRes of job.clients) {
                try { clientRes.write(msg); } catch (_) {}
            }
        };

        // Execute scan asynchronously
        (async () => {
            try {
                const resData = await runScanner({
                    token,
                    guildId,
                    filterBadge,
                    onProgress: async (msgText, pct) => {
                        job.message = msgText.replace(/\*\*/g, '');
                        job.progress = pct || job.progress;
                        broadcast({ status: 'running', progress: job.progress, message: job.message });
                    }
                });

                if (!resData.success) {
                    job.status = 'error';
                    job.error = resData.error || 'Tarama başarısız oldu.';
                    broadcast({ status: 'error', error: job.error });
                } else {
                    if (autoWebhook && webhookUrl) {
                        try {
                            broadcast({ status: 'running', progress: 98, message: 'Sonuçlar Discord Webhook adresine gönderiliyor...' });
                            await sendDiscordScanToWebhook(webhookUrl, resData);
                            resData.webhookSent = true;
                        } catch (whErr) {
                            resData.webhookError = whErr.message;
                        }
                    }
                    job.status = 'done';
                    job.progress = 100;
                    job.message = 'Tarama tamamlandı!';
                    job.result = resData;
                    broadcast({ status: 'done', progress: 100, message: job.message, result: resData });
                }
            } catch (err) {
                job.status = 'error';
                job.error = err.message || 'Beklenmeyen hata oluştu.';
                broadcast({ status: 'error', error: job.error });
            } finally {
                activeScanCountByHwid.set(actorHwidDc, Math.max(0, (activeScanCountByHwid.get(actorHwidDc) || 1) - 1));
                for (const clientRes of job.clients) {
                    try { clientRes.end(); } catch (_) {}
                }
                job.clients.clear();
                // Keep job in memory for 5 minutes for polling fallback
                setTimeout(() => scanJobs.delete(jobId), 5 * 60 * 1000);
            }
        })();

        sendJson(res, 200, { ok: true, jobId });
        return;
    }

    // 5. DISCORD SCRAPER: SSE STREAM FOR LIVE PROGRESS
    if (pathname === '/api/discord/stream' && req.method === 'GET') {
        const jobId = parsedUrl.searchParams.get('jobId') || '';
        const job = scanJobs.get(jobId);

        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        if (!job) {
            res.write(`data: ${JSON.stringify({ status: 'error', error: 'Tarama oturumu bulunamadı.' })}\n\n`);
            res.end();
            return;
        }

        if (job.status === 'done') {
            res.write(`data: ${JSON.stringify({ status: 'done', progress: 100, message: job.message, result: job.result })}\n\n`);
            res.end();
            return;
        }

        if (job.status === 'error') {
            res.write(`data: ${JSON.stringify({ status: 'error', error: job.error })}\n\n`);
            res.end();
            return;
        }

        // Send current progress immediately
        res.write(`data: ${JSON.stringify({ status: 'running', progress: job.progress, message: job.message })}\n\n`);
        job.clients.add(res);

        req.on('close', () => {
            job.clients.delete(res);
        });
        return;
    }

    // 6. DISCORD SCRAPER: SEND RESULTS TO WEBHOOK MANUALLY
    if (pathname === '/api/discord/webhook' && req.method === 'POST') {
        const body = await readJsonBody(req);
        try {
            await sendDiscordScanToWebhook(body.webhookUrl, body.scanResult || {});
            sendJson(res, 200, { ok: true });
        } catch (err) {
            sendJson(res, 400, { ok: false, error: err.message });
        }
        return;
    }

    // 7. DOWNLOAD STANDALONE EXE OR SOURCE INFO
    if (pathname === '/api/download/discord-exe' && req.method === 'GET') {
        const exePath = path.join(__dirname, 'EarlyHost.exe');
        if (fs.existsSync(exePath)) {
            const stat = fs.statSync(exePath);
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="EarlyHost.exe"',
                'Content-Length': stat.size
            });
            fs.createReadStream(exePath).pipe(res);
        } else {
            sendJson(res, 404, { ok: false, error: 'EarlyHost.exe bulunamadı.' });
        }
        return;
    }

    // 7B. VENCORD PLUGINS METADATA LIST + DOWNLOAD STATS
    if (pathname === '/api/vencord/plugins' && req.method === 'GET') {
        const stats = loadDownloadStats();
        const list = VENCORD_PLUGINS.map((p) => {
            const pDir = path.join(VENCORD_USERPLUGINS_DIR, p.folderName);
            const files = collectDirectoryFiles(pDir);
            const totalBytes = files.reduce((acc, f) => acc + f.data.length, 0);
            return {
                ...p,
                available: files.length > 0,
                fileCount: files.length,
                fileNames: files.map((f) => f.name),
                sizeKb: Math.max(1, Math.round(totalBytes / 1024)),
                downloads: stats[p.id] || 0
            };
        });
        sendJson(res, 200, { ok: true, plugins: list, bundleDownloads: stats.all || 0, themeDownloads: stats.theme || 0 });
        return;
    }

    // 7B-THEME. DOWNLOAD / SERVE EARLY.HOST OBSIDIAN VENCORD THEME
    if (pathname === '/api/vencord/theme' && req.method === 'GET') {
        incrementDownloadStat('theme');
        const isRaw = parsedUrl.searchParams.get('raw') === '1';
        res.writeHead(200, {
            'Content-Type': 'text/css; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            ...(isRaw ? {} : { 'Content-Disposition': 'attachment; filename="EarlyHostObsidian.theme.css"' })
        });
        res.end(EARLYHOST_OBSIDIAN_THEME_CSS);
        return;
    }

    // 7C. VENCORD PLUGIN SOURCE PREVIEW
    if (pathname === '/api/vencord/source' && req.method === 'GET') {
        const id = parsedUrl.searchParams.get('id') || '';
        const meta = VENCORD_PLUGINS.find((p) => p.id === id);
        if (!meta) {
            sendJson(res, 404, { ok: false, error: 'Plugin bulunamadı.' });
            return;
        }
        const pDir = path.join(VENCORD_USERPLUGINS_DIR, meta.folderName);
        const files = collectDirectoryFiles(pDir).map((f) => ({
            name: f.name,
            size: f.data.length,
            content: f.data.toString('utf8').slice(0, 18000)
        }));
        sendJson(res, 200, { ok: true, plugin: meta, files });
        return;
    }

    // 7D. VENCORD READY-TO-INSTALL ZIP DOWNLOAD (SINGLE OR ALL BUNDLE)
    if (pathname === '/api/vencord/download' && req.method === 'GET') {
        const id = parsedUrl.searchParams.get('id') || 'all';

        if (id === 'all') {
            incrementDownloadStat('all');
            const allEntries = [];
            const includedFolders = [];
            for (const p of VENCORD_PLUGINS) {
                const pDir = path.join(VENCORD_USERPLUGINS_DIR, p.folderName);
                const files = collectDirectoryFiles(pDir, p.folderName);
                if (files.length > 0) {
                    allEntries.push(...files);
                    includedFolders.push(p.folderName);
                }
            }
            if (!allEntries.length) {
                sendJson(res, 404, { ok: false, error: 'Plugin dosyaları bulunamadı.' });
                return;
            }
            allEntries.push(...buildInstallerBats(includedFolders));
            const zipBuf = buildZipBuffer(allEntries);
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="EarlyHost_Vencord_Tum_Pluginler.zip"',
                'Content-Length': zipBuf.length
            });
            res.end(zipBuf);
            return;
        }

        const meta = VENCORD_PLUGINS.find((p) => p.id === id);
        if (!meta) {
            sendJson(res, 404, { ok: false, error: 'Plugin bulunamadı.' });
            return;
        }

        const pDir = path.join(VENCORD_USERPLUGINS_DIR, meta.folderName);
        const files = collectDirectoryFiles(pDir, meta.folderName);
        if (!files.length) {
            sendJson(res, 404, { ok: false, error: `${meta.folderName} klasörü bulunamadı.` });
            return;
        }

        incrementDownloadStat(meta.id);
        const entries = [...files, ...buildInstallerBats([meta.folderName])];
        const zipBuf = buildZipBuffer(entries);
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="EarlyHost_${meta.folderName}_Kurulum.zip"`,
            'Content-Length': zipBuf.length
        });
        res.end(zipBuf);
        return;
    }

    // 7E. TOKENSIZ OSINT TOOLKIT: DISCORD USER ID & INVITE ANALYZER
    if (pathname === '/api/tools/osint-discord' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const query = String(body.query || '').trim();
        if (!query) {
            sendJson(res, 400, { ok: false, error: 'Lütfen bir Discord Kullanıcı ID veya Davet Kodu/Linki girin.' });
            return;
        }

        // Case 1: Numeric Snowflake ID -> User Lookup
        const onlyDigits = query.replace(/[^\d]/g, '');
        if (/^\d{16,21}$/.test(query) || (onlyDigits.length >= 17 && !query.includes('/') && !query.includes('.'))) {
            const userId = onlyDigits;
            const snow = decodeDiscordSnowflake(userId);
            const botToken = (process.env.BOT_TOKEN || '').trim();

            if (!botToken) {
                sendJson(res, 200, {
                    ok: true,
                    kind: 'user',
                    user: {
                        id: userId,
                        username: 'Snowflake Çözümlendi',
                        globalName: null,
                        avatarUrl: `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`,
                        bannerUrl: null,
                        accentHex: null,
                        bot: false,
                        createdAt: snow?.timestampMs || null,
                        badges: []
                    }
                });
                return;
            }

            try {
                const resUser = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
                    headers: { Authorization: `Bot ${botToken}` },
                    timeout: 8000
                });
                const u = resUser.data;
                const flagsNum = Number(u.public_flags || u.flags || 0);
                const badges = DISCORD_PUBLIC_FLAGS.filter((f) => (flagsNum & f.bit) !== 0);

                const avatarExt = u.avatar && u.avatar.startsWith('a_') ? 'gif' : 'png';
                const avatarUrl = u.avatar
                    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${avatarExt}?size=512`
                    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) >> 22n) % 6}.png`;

                const bannerExt = u.banner && u.banner.startsWith('a_') ? 'gif' : 'png';
                const bannerUrl = u.banner
                    ? `https://cdn.discordapp.com/banners/${u.id}/${u.banner}.${bannerExt}?size=1024`
                    : null;

                const accentHex = u.accent_color != null
                    ? '#' + Number(u.accent_color).toString(16).padStart(6, '0')
                    : null;

                sendJson(res, 200, {
                    ok: true,
                    kind: 'user',
                    user: {
                        id: u.id,
                        username: u.username,
                        globalName: u.global_name || u.username,
                        avatarUrl,
                        bannerUrl,
                        accentHex,
                        bot: Boolean(u.bot),
                        createdAt: snow?.timestampMs || null,
                        badges
                    }
                });
            } catch (err) {
                const status = err.response?.status;
                if (status === 404) {
                    sendJson(res, 404, { ok: false, error: 'Bu ID ile eşleşen bir Discord kullanıcısı bulunamadı.' });
                } else {
                    sendJson(res, 400, { ok: false, error: `Sorgu hatası: ${err.message}` });
                }
            }
            return;
        }

        // Case 2: Discord Invite Code / URL Lookup
        const codeMatch = query.match(/(?:discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/|^)([a-zA-Z0-9\-]{2,32})/);
        const code = codeMatch ? codeMatch[1] : query;

        try {
            const invRes = await axios.get(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`, {
                timeout: 8000
            });
            const inv = invRes.data;
            const g = inv.guild || {};
            const gSnow = g.id ? decodeDiscordSnowflake(g.id) : null;

            const iconUrl = g.icon
                ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=512`
                : null;
            const bannerUrl = g.banner
                ? `https://cdn.discordapp.com/banners/${g.id}/${g.banner}.${g.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`
                : (g.splash ? `https://cdn.discordapp.com/splashes/${g.id}/${g.splash}.png?size=1024` : null);

            sendJson(res, 200, {
                ok: true,
                kind: 'invite',
                invite: {
                    code: inv.code,
                    guildId: g.id,
                    guildName: g.name || 'Bilinmeyen Sunucu',
                    description: g.description || '',
                    iconUrl,
                    bannerUrl,
                    memberCount: inv.approximate_member_count || 0,
                    onlineCount: inv.approximate_presence_count || 0,
                    boostCount: g.premium_subscription_count || 0,
                    verificationLevel: g.verification_level ?? 0,
                    vanityCode: g.vanity_url_code || null,
                    features: g.features || [],
                    createdAt: gSnow?.timestampMs || null,
                    inviter: inv.inviter ? `@${inv.inviter.username} (${inv.inviter.id})` : null
                }
            });
        } catch (err) {
            sendJson(res, 404, { ok: false, error: 'Geçersiz veya süresi dolmuş Discord davet bağlantısı.' });
        }
        return;
    }

    // 7F. RARE SHORT USERNAME (2L / 2C / 3L / 3C / 4L / 4C / OG) SNIPER — GUARANTEED UNUSED DISCOVERY
    if (pathname === '/api/tools/username-check' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const mode = String(body.mode || '3c').toLowerCase(); // 2l, 2c, 3l, 3c, 4l, 4c, 5l, og
        const platform = String(body.platform || 'auto').toLowerCase(); // auto, discord, roblox, github, steam
        const onlyAvailable = body.onlyAvailable !== false; // default TRUE: only return UNUSED names!
        const targetCount = Math.min(16, Math.max(6, Number(body.count) || 12));

        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const rareLetters = 'qwxzjvkyfghbmpd';
        const vowels = 'aeiou';
        const consonants = 'bcdfghjklmnprstvwxyz';
        const digits = '0123456789';

        const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];

        function generateByMode(m) {
            if (m === '2l') return pick(rareLetters) + pick(rareLetters);
            if (m === '2c') {
                return Math.random() < 0.6
                    ? pick(rareLetters) + pick(digits)
                    : pick(digits) + pick(rareLetters);
            }
            if (m === '3l') {
                return Math.random() < 0.45
                    ? pick(consonants) + pick(vowels) + pick(rareLetters)
                    : pick(rareLetters) + pick(letters) + pick(rareLetters);
            }
            if (m === '3c') {
                const r = Math.random();
                if (r < 0.4) return pick(letters) + pick(digits) + pick(letters);
                if (r < 0.75) return pick(letters) + pick(digits) + pick(digits);
                return pick(rareLetters) + '_' + pick(letters);
            }
            if (m === '4l') {
                return Math.random() < 0.55
                    ? pick(consonants) + pick(vowels) + pick(consonants) + pick(vowels)
                    : pick(rareLetters) + pick(letters) + pick(rareLetters) + pick(letters);
            }
            if (m === '4c') {
                const r = Math.random();
                if (r < 0.4) return pick(letters) + pick(digits) + pick(letters) + pick(digits);
                if (r < 0.75) return pick(letters) + '_' + pick(letters) + pick(digits);
                return pick(letters) + pick(letters) + pick(digits) + pick(digits);
            }
            if (m === 'og') {
                const len = Math.random() < 0.5 ? 5 : 6;
                let w = '';
                for (let i = 0; i < len; i++) w += i % 2 === 0 ? pick(consonants) : pick(vowels);
                return w;
            }
            // fallback 5l
            let w = '';
            for (let i = 0; i < 5; i++) w += i % 2 === 0 ? pick(consonants) : pick(vowels);
            return w;
        }

        async function checkSingleCandidate(name) {
            const clean = name.toLowerCase();
            const hasUnderscore = clean.includes('_');

            // 1. If platform is explicitly roblox (or >=5 chars and auto)
            if (platform === 'roblox' || (platform === 'auto' && clean.length >= 5)) {
                if (clean.length < 3) {
                    return { username: clean, available: false, status: 'KISITLI (MİN 3)', platform: 'ROBLOX' };
                }
                try {
                    const r = await axios.get(`https://auth.roblox.com/v1/usernames/validate?Username=${encodeURIComponent(clean)}&Birthday=2000-01-01T00:00:00.000Z&Context=Signup`, { timeout: 4500 });
                    const code = r.data?.code;
                    if (code === 0) return { username: clean, available: true, status: 'BOŞTA / KULLANILMIYOR', platform: 'ROBLOX' };
                    return { username: clean, available: false, status: code === 1 ? 'ALINMIŞ' : 'KISITLI', platform: 'ROBLOX' };
                } catch (_) {}
            }

            // 2. Discord check (.gg/ & Short Handle Radar)
            if ((platform === 'discord' || platform === 'auto') && !hasUnderscore) {
                try {
                    const rDc = await axios.get(`https://discord.com/api/v10/invites/${encodeURIComponent(clean)}`, {
                        validateStatus: () => true,
                        timeout: 3800
                    });
                    if (rDc.status === 404) {
                        return { username: clean, available: true, status: 'BOŞTA / KULLANILMIYOR', platform: 'DISCORD' };
                    }
                    if (platform === 'discord' && rDc.status === 200) {
                        return { username: clean, available: false, status: 'KULLANIMDA', platform: 'DISCORD' };
                    }
                } catch (_) {}
            }

            // 3. Steam Custom ID check (great for 2L, 2C, 3L, 3C, 4L, 4C including underscores)
            if (platform === 'steam' || platform === 'auto' || (platform === 'discord' && hasUnderscore)) {
                try {
                    const rSt = await axios.get(`https://steamcommunity.com/id/${encodeURIComponent(clean)}?xml=1`, {
                        validateStatus: () => true,
                        timeout: 4200
                    });
                    if (typeof rSt.data === 'string' && rSt.data.includes('The specified profile could not be found')) {
                        return { username: clean, available: true, status: 'BOŞTA / KULLANILMIYOR', platform: 'STEAM ID' };
                    }
                    if (platform === 'steam') {
                        return { username: clean, available: false, status: 'KULLANIMDA', platform: 'STEAM ID' };
                    }
                } catch (_) {}
            }

            // 4. GitHub Handle check (supports 2C, 3L, 3C, 4L, 4C without underscores)
            if (!hasUnderscore && (platform === 'github' || platform === 'auto')) {
                try {
                    const rGh = await axios.head(`https://github.com/${encodeURIComponent(clean)}`, {
                        validateStatus: () => true,
                        timeout: 4000
                    });
                    if (rGh.status === 404) {
                        return { username: clean, available: true, status: 'BOŞTA / KULLANILMIYOR', platform: 'GITHUB' };
                    }
                } catch (_) {}
            }

            // 5. Fallback Roblox check for 3C/3L/4C/4L if still not matched
            if (clean.length >= 3) {
                try {
                    const r = await axios.get(`https://auth.roblox.com/v1/usernames/validate?Username=${encodeURIComponent(clean)}&Birthday=2000-01-01T00:00:00.000Z&Context=Signup`, { timeout: 4000 });
                    if (r.data?.code === 0) {
                        return { username: clean, available: true, status: 'BOŞTA / KULLANILMIYOR', platform: 'ROBLOX' };
                    }
                } catch (_) {}
            }

            return { username: clean, available: false, status: 'ALINMIŞ', platform: platform.toUpperCase() };
        }

        // Custom user-provided list check
        if (Array.isArray(body.usernames) && body.usernames.length > 0) {
            const customClean = Array.from(new Set(
                body.usernames.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[a-z0-9_.]{2,20}$/.test(x))
            )).slice(0, 20);

            const checked = await Promise.all(customClean.map((n) => checkSingleCandidate(n)));
            const filtered = onlyAvailable ? checked.filter((x) => x.available) : checked;
            filtered.sort((a, b) => (a.available === b.available ? 0 : (a.available ? -1 : 1)));
            sendJson(res, 200, {
                ok: true,
                mode: 'CUSTOM',
                scannedTotal: checked.length,
                availableCount: checked.filter((x) => x.available).length,
                results: filtered.map((x) => ({ ...x, length: x.username.length, tag: `${x.username.length}C` }))
            });
            return;
        }

        // AUTO-HUNT LOOP: Keep scanning batches until we collect enough UNUSED (available) names!
        const foundAvailable = [];
        const allTested = [];
        const triedSet = new Set();
        const maxRounds = 5;
        const startTime = Date.now();

        for (let round = 0; round < maxRounds; round++) {
            if (foundAvailable.length >= targetCount) break;
            if (Date.now() - startTime > 7500) break; // fast response cap

            const batch = [];
            let guard = 0;
            while (batch.length < 18 && guard < 200) {
                guard++;
                const cand = generateByMode(mode);
                if (!triedSet.has(cand)) {
                    triedSet.add(cand);
                    batch.push(cand);
                }
            }
            if (!batch.length) break;

            const batchRes = await Promise.all(batch.map((c) => checkSingleCandidate(c)));
            for (const item of batchRes) {
                const enriched = {
                    ...item,
                    length: item.username.length,
                    tag: mode.toUpperCase()
                };
                allTested.push(enriched);
                if (enriched.available && foundAvailable.length < targetCount) {
                    foundAvailable.push(enriched);
                }
            }
        }

        const finalList = onlyAvailable ? foundAvailable : allTested.slice(0, 20);
        finalList.sort((a, b) => (a.available === b.available ? 0 : (a.available ? -1 : 1)));

        sendJson(res, 200, {
            ok: true,
            mode: mode.toUpperCase(),
            scannedTotal: triedSet.size,
            availableCount: foundAvailable.length,
            results: finalList
        });
        return;
    }

    // 7G. WEBHOOK COMMANDER (INSPECT, SEND CUSTOM EMBED, DELETE SPAM WEBHOOK)
    if (pathname === '/api/tools/webhook-action' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const webhookUrl = String(body.webhookUrl || '').trim();
        const action = body.action || 'inspect';

        if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
            sendJson(res, 400, { ok: false, error: 'Geçerli bir Discord Webhook URL girin.' });
            return;
        }

        try {
            if (action === 'inspect') {
                const r = await axios.get(webhookUrl, { timeout: 8000 });
                const d = r.data;
                const avatarUrl = d.avatar
                    ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=256`
                    : 'https://cdn.discordapp.com/embed/avatars/0.png';
                sendJson(res, 200, {
                    ok: true,
                    webhook: {
                        id: d.id,
                        name: d.name || 'İsimsiz Webhook',
                        channelId: d.channel_id || '-',
                        guildId: d.guild_id || '-',
                        avatarUrl,
                        applicationId: d.application_id || null
                    }
                });
                return;
            }

            if (action === 'send') {
                const payload = {};
                if (body.username) payload.username = String(body.username).slice(0, 80);
                if (body.avatarUrl) payload.avatar_url = String(body.avatarUrl);
                if (body.content) payload.content = String(body.content).slice(0, 1900);

                if (body.embedTitle || body.embedDescription) {
                    let colorInt = 0x09090B;
                    if (body.embedColor) {
                        const parsed = parseInt(String(body.embedColor).replace('#', ''), 16);
                        if (!Number.isNaN(parsed)) colorInt = parsed;
                    }
                    const embed = {
                        title: body.embedTitle ? String(body.embedTitle).slice(0, 250) : undefined,
                        description: body.embedDescription ? String(body.embedDescription).slice(0, 3800) : undefined,
                        color: colorInt,
                        footer: { text: body.embedFooter ? String(body.embedFooter) : 'EARLY.HOST • discord.gg/anonim' }
                    };
                    if (body.embedImage) embed.image = { url: String(body.embedImage) };
                    payload.embeds = [embed];
                }

                if (!payload.content && !payload.embeds) {
                    sendJson(res, 400, { ok: false, error: 'Gönderilecek bir mesaj veya Embed başlığı/açıklaması girin.' });
                    return;
                }

                await axios.post(webhookUrl, payload, { timeout: 8000 });
                sendJson(res, 200, { ok: true, message: 'Mesaj başarıyla Webhook kanalına gönderildi!' });
                return;
            }

            if (action === 'delete') {
                await axios.delete(webhookUrl, { timeout: 8000 });
                sendJson(res, 200, { ok: true, message: 'Webhook kalıcı olarak imha edildi (silindi)!' });
                return;
            }

            sendJson(res, 400, { ok: false, error: 'Geçersiz işlem.' });
        } catch (err) {
            const st = err.response?.status;
            if (st === 404) {
                sendJson(res, 404, { ok: false, error: 'Bu Webhook zaten silinmiş veya geçersiz (404 Not Found).' });
            } else {
                sendJson(res, 400, { ok: false, error: `Webhook hatası: ${err.message}` });
            }
        }
        return;
    }

    // 7H. DISCORD MULTI-TOKEN CHECKER & ACCOUNT INSPECTOR
    if (pathname === '/api/tools/token-check' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const rawTokens = Array.isArray(body.tokens) ? body.tokens : String(body.tokens || '').split(/[\r\n,;]+/);
        const tokens = Array.from(new Set(rawTokens.map((t) => String(t).trim().replace(/^["']|["']$/g, '')).filter((t) => t.length >= 25))).slice(0, 20);

        if (!tokens.length) {
            sendJson(res, 400, { ok: false, error: 'Kontrol edilecek en az bir Discord Token girin.' });
            return;
        }

        const results = await Promise.all(tokens.map(async (tok) => {
            const masked = tok.length > 18 ? `${tok.slice(0, 12)}...${tok.slice(-5)}` : tok;
            const tryAuth = async (authHeader, isBot) => {
                const r = await axios.get('https://discord.com/api/v10/users/@me', {
                    headers: { Authorization: authHeader },
                    timeout: 7000
                });
                const u = r.data;
                let guildCount = null;
                if (!isBot) {
                    try {
                        const gRes = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
                            headers: { Authorization: authHeader },
                            timeout: 6000
                        });
                        if (Array.isArray(gRes.data)) guildCount = gRes.data.length;
                    } catch (_) {}
                }

                const flagsNum = Number(u.public_flags || u.flags || 0);
                const badges = DISCORD_PUBLIC_FLAGS.filter((f) => (flagsNum & f.bit) !== 0);
                const premiumMap = { 0: 'Yok', 1: 'Nitro Classic', 2: 'Nitro Boost', 3: 'Nitro Basic' };
                const snow = decodeDiscordSnowflake(u.id);
                const avatarUrl = u.avatar
                    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
                    : 'https://cdn.discordapp.com/embed/avatars/0.png';

                return {
                    token: tok,
                    masked,
                    valid: true,
                    accountType: isBot ? 'BOT' : 'USER',
                    id: u.id,
                    username: u.username,
                    globalName: u.global_name || u.username,
                    avatarUrl,
                    email: u.email || null,
                    phone: u.phone || null,
                    verified: Boolean(u.verified),
                    mfaEnabled: Boolean(u.mfa_enabled),
                    nitro: premiumMap[u.premium_type || 0] || 'Var',
                    hasNitro: Boolean(u.premium_type && u.premium_type > 0),
                    guildCount,
                    badges,
                    createdAt: snow?.timestampMs || null
                };
            };

            try {
                if (tok.toLowerCase().startsWith('bot ')) {
                    return await tryAuth(tok, true);
                }
                return await tryAuth(tok, false);
            } catch (err1) {
                if (!tok.toLowerCase().startsWith('bot ')) {
                    try {
                        return await tryAuth(`Bot ${tok}`, true);
                    } catch (_) {}
                }
                const code = err1.response?.status;
                return {
                    token: tok,
                    masked,
                    valid: false,
                    reason: code === 401 ? 'Geçersiz / Patlamış Token' : (code === 403 ? 'Telefon / Kilitli (403)' : 'Bağlantı Hatası')
                };
            }
        }));

        results.sort((a, b) => (a.valid === b.valid ? 0 : (a.valid ? -1 : 1)));
        sendJson(res, 200, {
            ok: true,
            total: results.length,
            validCount: results.filter((x) => x.valid).length,
            nitroCount: results.filter((x) => x.hasNitro).length,
            results
        });
        return;
    }

    // 7I. DISCORD GUILD VANITY URL (3-CHAR / YEAR 19xx / 3N / 4L / BANNED DETECTOR) SNIPER & CHECKER
    if (pathname === '/api/tools/vanity-check' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const mode = String(body.mode || '3c').toLowerCase(); // 3c, 3l, 3n, years, 4l, 4c, 2c
        const filterMode = String(body.filterMode || (body.onlyAvailable === false ? 'all' : 'claimable')).toLowerCase(); // claimable, banned, all
        const targetCount = Math.min(12, Math.max(4, Number(body.count) || 8));

        // Reserved / System / Blacklisted words & substrings that Discord blocks on PATCH /vanity-url even if 404 on /invites
        const DISCORD_RESERVED_EXACT = new Set([
            'discord', 'admin', 'mod', 'moderator', 'staff', 'support', 'help', 'api', 'cdn',
            'login', 'register', 'nitro', 'gifts', 'gift', 'billing', 'privacy', 'terms', 'tos',
            'guidelines', 'security', 'status', 'jobs', 'careers', 'blog', 'developers', 'dev',
            'partner', 'partners', 'hypesquad', 'safety', 'trust', 'download', 'app', 'me',
            'users', 'channels', 'guilds', 'invite', 'invites', 'new', 'null', 'undefined',
            'system', 'official', 'verify', 'verification', 'wumpus', 'clyde', 'nelly', 'store',
            'shop', 'merch', 'press', 'branding', 'college', 'open', 'template', 'templates',
            'discover', 'discovery', 'quests', 'orbs', 'fbi', 'cia', 'nsa', 'dea', 'interpol',
            'police', 'swat', 'dox', 'doxx', 'ddos', 'raid', 'nuke', 'gore', 'nsfw', 'porn',
            'xxx', 'sex', 'isis', 'nazi', 'kkk', 'hitler', 'ped', 'pedo', 'cp', 'rape', 'kill',
            'suicide', 'selfharm', 'carding', 'fraud', 'scam', 'phish', 'token', 'stealer', 'rat'
        ]);

        const DISCORD_BANNED_SUBSTRINGS = [
            'discord', 'nitro', 'wumpus', 'doxx', 'ddos', 'nazi', 'hitler', 'pedo', 'porn', 'rape', 'carding'
        ];

        function getDiscordVanityBanReason(code) {
            if (!/^[a-z0-9\-]+$/.test(code) || code.startsWith('-') || code.endsWith('-') || code.includes('--')) {
                return 'Geçersiz Karakter / Tire Kuralı (Alınamaz)';
            }
            if (code.length < 2) {
                return 'Çok Kısa (<2 Hane)';
            }
            if (code.length > 25) {
                return 'Çok Uzun (>25 Hane Sınırı)';
            }
            if (DISCORD_RESERVED_EXACT.has(code)) {
                return 'Boşta Ama Discord Kara Listede / Rezerve';
            }
            for (const sub of DISCORD_BANNED_SUBSTRINGS) {
                if (code.includes(sub)) {
                    return `Yasaklı Kelime İçeriyor ("${sub}")`;
                }
            }
            return null;
        }

        const letters = 'abcdefghijklmnopqrstuvwxyz';
        const rareLetters = 'abcdefghjkmnpqrstuvwxyz';
        const vowels = 'aeiou';
        const consonants = 'bcdfghjklmnprstvwxyz';
        const digits = '0123456789';
        const pick = (p) => p[Math.floor(Math.random() * p.length)];

        function generateVanityCandidate(m) {
            if (m === '2c') {
                // 2 Hane Sayı + Harf Karışık (c2, a2, 8m, x9, 4k tarzı)
                return Math.random() < 0.6
                    ? pick(rareLetters) + pick(digits)
                    : pick(digits) + pick(rareLetters);
            }
            if (m === '2n') {
                // 2 Hane Sadece Sayı (12, 29, 74, 89 tarzı)
                return pick('123456789') + pick(digits);
            }
            if (m === '2l') {
                // 2 Hane Sadece Harf (ab, qx, vy tarzı)
                return pick(rareLetters) + pick(rareLetters);
            }
            if (m === '3c') {
                // 9dx, c2x, a29, 7kz style
                const r = Math.random();
                if (r < 0.36) return pick(digits) + pick(rareLetters) + pick(rareLetters); // 9dx
                if (r < 0.72) return pick(rareLetters) + pick(digits) + pick(rareLetters); // c2x
                return pick(rareLetters) + pick(digits) + pick(digits); // a29
            }
            if (m === '3l') {
                return pick(rareLetters) + pick(letters) + pick(rareLetters);
            }
            if (m === '3n') {
                return pick('123456789') + pick(digits) + pick(digits);
            }
            if (m === 'years') {
                const y = 1881 + Math.floor(Math.random() * 149);
                return String(y);
            }
            if (m === '4l') {
                return pick(consonants) + pick(vowels) + pick(consonants) + pick(vowels);
            }
            if (m === '4c') {
                return Math.random() < 0.5
                    ? pick(rareLetters) + pick(digits) + pick(rareLetters) + pick(digits)
                    : pick(rareLetters) + '-' + pick(rareLetters) + pick(digits);
            }
            return pick(digits) + pick(rareLetters) + pick(rareLetters);
        }

        async function checkDiscordVanityCode(code) {
            const cached = vanityCheckCache.get(code);
            if (cached && (Date.now() - cached.ts) < VANITY_CACHE_TTL_MS) {
                return cached.val;
            }

            try {
                const r = await axios.get(`https://discord.gg/${encodeURIComponent(code)}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
                        'Accept': 'text/html'
                    },
                    validateStatus: () => true,
                    timeout: 6500
                });

                const html = String(r.data || '');
                if (r.status === 429) {
                    return {
                        code,
                        available: false,
                        banned: false,
                        rateLimited: true,
                        status: 'HIZ LİMİTİ',
                        reason: 'Geçici hız sınırı',
                        guildName: null,
                        memberCount: 0
                    };
                }

                // 1. Friend invite or System AppClip (e.g. discord.gg/discord) -> Locked/Banned
                if (html.includes('InviteAppClip') || html.includes('friend request on Discord')) {
                    const lockedVal = {
                        code,
                        available: false,
                        banned: true,
                        emptyButBanned: true,
                        status: 'BOŞTA AMA BANLI',
                        reason: 'Discord Sistem Rezerve / Kilitli URL',
                        guildName: null,
                        memberCount: 0
                    };
                    vanityCheckCache.set(code, { ts: Date.now(), val: lockedVal });
                    return lockedVal;
                }

                // 2. Check ANY indication that an active server holds this invite!
                const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/i)
                    || html.match(/content="([^"]+)"\s+property="og:title"/i)
                    || html.match(/name="twitter:title"\s+content="([^"]+)"/i);
                const ogTitle = ogTitleMatch ? ogTitleMatch[1] : '';

                const ogDescMatch = html.match(/property="og:description"\s+content="([^"]+)"/i)
                    || html.match(/name="description"\s+content="([^"]+)"/i);
                const ogDesc = ogDescMatch ? ogDescMatch[1] : '';

                const isDefaultHome = html.includes('og_img_discord_home')
                    || ogTitle.includes('Group Chat That')
                    || ogDesc.includes('Discord is great for playing games');

                // If NOT default Discord home page (or explicitly has canonical / icons / splashes / Join) -> IT IS TAKEN!
                if (!isDefaultHome || html.includes('rel="canonical" href="https://discord.com/invite/') || html.includes('cdn.discordapp.com/icons/') || html.includes('cdn.discordapp.com/splashes/')) {
                    const gName = ogTitle
                        .replace(/^(Join the| Join)\s+/i, '')
                        .replace(/\s+Discord Server!?$/i, '')
                        .replace(/&#39;/g, "'")
                        .replace(/&amp;/g, '&')
                        .trim() || 'Aktif Sunucu';
                    const memMatch = ogDesc.match(/([\d,\.]+)\s+members/i);
                    const memCount = memMatch ? parseInt(memMatch[1].replace(/[,\.]/g, ''), 10) || 0 : 0;

                    const takenVal = {
                        code,
                        available: false,
                        banned: false,
                        emptyButBanned: false,
                        status: 'DOLU (SUNUCUDA)',
                        reason: `${gName}${memCount ? ` (${memCount.toLocaleString('tr-TR')} üye)` : ''}`,
                        guildName: gName,
                        memberCount: memCount
                    };
                    vanityCheckCache.set(code, { ts: Date.now(), val: takenVal });
                    return takenVal;
                }

                // 3. No server holds this URL right now! Now check if Discord BANS / BLOCKS claiming it!
                const banReason = getDiscordVanityBanReason(code);
                if (banReason) {
                    const bannedEmptyVal = {
                        code,
                        available: false,
                        banned: true,
                        emptyButBanned: true,
                        status: 'BOŞTA AMA BANLI',
                        reason: banReason,
                        guildName: null,
                        memberCount: 0
                    };
                    vanityCheckCache.set(code, { ts: Date.now(), val: bannedEmptyVal });
                    return bannedEmptyVal;
                }

                // 4. Check if 2-char (often T&S banned when empty) vs 3+ char
                const isTwoChar = code.length === 2;
                const cleanVal = {
                    code,
                    available: true,
                    banned: false,
                    twoCharWarning: isTwoChar,
                    emptyButBanned: false,
                    status: isTwoChar ? 'BOŞTA (2H · T&S RİSKİ)' : 'ALINABİLİR (TEMİZ)',
                    reason: isTwoChar
                        ? 'Hiçbir sunucuda yok (Eski sunucudan banlı değilse alınır)'
                        : 'Seviye 3 sunucuya hemen koyulabilir',
                    guildName: null,
                    memberCount: 0
                };
                vanityCheckCache.set(code, { ts: Date.now(), val: cleanVal });
                return cleanVal;
            } catch (_) {
                return {
                    code,
                    available: false,
                    banned: false,
                    status: 'BELİRSİZ',
                    reason: 'Bağlantı zaman aşımı',
                    guildName: null,
                    memberCount: 0
                };
            }
        }

        const applyFilterAndSort = (arr) => {
            let filtered = arr;
            if (filterMode === 'claimable') {
                filtered = arr.filter((x) => x.available && !x.banned);
            } else if (filterMode === 'banned') {
                filtered = arr.filter((x) => x.available || x.banned); // shows Claimable + Empty-But-Banned!
            }
            return filtered.sort((a, b) => {
                const score = (it) => (it.available ? 0 : (it.emptyButBanned ? 1 : 2));
                return score(a) - score(b);
            });
        };

        // Manual custom codes check (e.g. "74, c2, 1929, 1989, 9dx, gore, discord")
        const rawCodesStr = Array.isArray(body.codes) ? body.codes.join(',') : String(body.codes || '').trim();
        if (rawCodesStr.length > 0) {
            const manualCodes = Array.from(new Set(
                rawCodesStr.split(/[\s,;]+/)
                    .map((c) => String(c).trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?(discord\.gg\/|discord\.com\/invite\/)/i, '').replace(/[^a-z0-9\-]/g, ''))
                    .filter((c) => c.length >= 1 && c.length <= 32)
            )).slice(0, 24);

            const checked = [];
            for (let i = 0; i < manualCodes.length; i += 6) {
                const slice = manualCodes.slice(i, i + 6);
                const batchRes = await Promise.all(slice.map((c) => checkDiscordVanityCode(c)));
                checked.push(...batchRes.filter((x) => !x.rateLimited));
                if (i + 6 < manualCodes.length) await new Promise((r) => setTimeout(r, 100));
            }

            // When user types specific codes manually, show all of them sorted (Claimable -> Empty-Banned -> Taken) unless strict filter requested
            const finalManual = body.strictManualFilter ? applyFilterAndSort(checked) : checked.sort((a, b) => {
                const score = (it) => (it.available ? 0 : (it.emptyButBanned ? 1 : 2));
                return score(a) - score(b);
            });

            sendJson(res, 200, {
                ok: true,
                mode: 'ÖZEL LİSTE',
                scannedTotal: checked.length,
                availableCount: checked.filter((x) => x.available).length,
                bannedCount: checked.filter((x) => x.banned).length,
                takenCount: checked.filter((x) => !x.available && !x.banned).length,
                results: finalManual.map((x) => ({ ...x, tag: `${x.code.length}H` }))
            });
            return;
        }

        // AUTO-HUNT GENERATOR MODE
        const safeTarget = Math.min(12, targetCount);
        const foundClean = [];
        const allChecked = [];
        const seen = new Set();
        const startTs = Date.now();
        const effectiveFilter = filterMode;

        while (foundClean.length < safeTarget && seen.size < 54 && (Date.now() - startTs) < 8800) {
            const slice = [];
            let guard = 0;
            while (slice.length < 6 && guard < 160) {
                guard++;
                const cand = generateVanityCandidate(mode);
                if (!seen.has(cand)) {
                    seen.add(cand);
                    slice.push(cand);
                }
            }
            if (!slice.length) break;

            const batchRes = await Promise.all(slice.map((c) => checkDiscordVanityCode(c)));

            for (const item of batchRes) {
                if (item.rateLimited) continue;
                const enriched = { ...item, tag: mode.toUpperCase() };
                allChecked.push(enriched);
                if (enriched.available && !enriched.banned && foundClean.length < safeTarget) {
                    foundClean.push(enriched);
                }
            }

            if (foundClean.length < safeTarget) {
                await new Promise((r) => setTimeout(r, 100));
            }
        }

        let outList = allChecked;
        if (effectiveFilter === 'claimable') outList = foundClean;
        else if (effectiveFilter === 'banned') outList = allChecked.filter((x) => x.available || x.banned);

        outList.sort((a, b) => {
            const score = (it) => (it.available ? 0 : (it.emptyButBanned ? 1 : 2));
            return score(a) - score(b);
        });

        sendJson(res, 200, {
            ok: true,
            mode: mode.toUpperCase(),
            scannedTotal: allChecked.length,
            availableCount: allChecked.filter((x) => x.available).length,
            bannedCount: allChecked.filter((x) => x.banned).length,
            takenCount: allChecked.filter((x) => !x.available && !x.banned).length,
            results: outList.slice(0, 16)
        });
        return;
    }

    // 7J. DISCORD GUILD ASSET & EMOJI / STICKER EXTRACTOR (SERVER CLONER / STEALER)
    if (pathname === '/api/tools/guild-assets' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const rawTarget = String(body.target || '').trim();
        const userToken = String(body.token || process.env.DISCORD_TOKEN || '').trim();
        const botToken = String(process.env.BOT_TOKEN || '').trim();

        if (!rawTarget) {
            sendJson(res, 400, { ok: false, error: 'Lütfen bir Sunucu ID veya discord.gg/... davet bağlantısı girin.' });
            return;
        }

        let guildId = '';
        let inviteSummary = null;

        // Check if target is numeric Guild ID or Invite link/code
        const cleanDigits = rawTarget.replace(/[^\d]/g, '');
        if (/^\d{16,21}$/.test(rawTarget) || (cleanDigits.length >= 17 && !rawTarget.includes('/') && !rawTarget.includes('.'))) {
            guildId = cleanDigits;
        } else {
            const m = rawTarget.match(/(?:discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/|^)([a-zA-Z0-9\-]{2,32})/);
            const code = m ? m[1] : rawTarget;
            try {
                const invRes = await axios.get(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, { timeout: 7500 });
                const g = invRes.data?.guild || {};
                guildId = g.id || '';
                inviteSummary = {
                    name: g.name || 'Sunucu',
                    id: g.id || '',
                    description: g.description || '',
                    memberCount: invRes.data?.approximate_member_count || 0,
                    onlineCount: invRes.data?.approximate_presence_count || 0,
                    boostCount: g.premium_subscription_count || 0,
                    iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=1024` : null,
                    bannerUrl: g.banner ? `https://cdn.discordapp.com/banners/${g.id}/${g.banner}.${g.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024` : null,
                    splashUrl: g.splash ? `https://cdn.discordapp.com/splashes/${g.id}/${g.splash}.png?size=1024` : null
                };
            } catch (_) {
                sendJson(res, 404, { ok: false, error: 'Davet bağlantısı çözümlenemedi veya süresi dolmuş.' });
                return;
            }
        }

        // Try fetching full guild emojis/stickers via User Token, Bot Token, or Public Widget/Preview
        let guildData = null;
        let emojis = [];
        let stickers = [];

        const authCandidates = [];
        if (userToken) authCandidates.push(userToken.toLowerCase().startsWith('bot ') ? userToken : userToken);
        if (botToken) authCandidates.push(`Bot ${botToken}`);

        for (const auth of authCandidates) {
            try {
                const gRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
                    headers: { Authorization: auth },
                    timeout: 7500
                });
                guildData = gRes.data;
                break;
            } catch (_) {}
        }

        // Fallback to public guild preview if discoverable
        if (!guildData && guildId) {
            try {
                const prevRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/preview`, {
                    headers: botToken ? { Authorization: `Bot ${botToken}` } : {},
                    timeout: 7000
                });
                guildData = prevRes.data;
            } catch (_) {}
        }

        if (!guildData && !inviteSummary) {
            sendJson(res, 404, {
                ok: false,
                error: 'Sunucu verilerine erişilemedi. Sunucu herkese açık değilse üyesi olduğunuz bir Token ile sorgulayın veya geçerli davet kodu girin.'
            });
            return;
        }

        const gObj = guildData || {};
        const finalId = gObj.id || inviteSummary?.id || guildId;
        const finalName = gObj.name || inviteSummary?.name || 'Sunucu';

        const iconUrl = gObj.icon
            ? `https://cdn.discordapp.com/icons/${finalId}/${gObj.icon}.${gObj.icon.startsWith('a_') ? 'gif' : 'png'}?size=1024`
            : (inviteSummary?.iconUrl || null);
        const bannerUrl = gObj.banner
            ? `https://cdn.discordapp.com/banners/${finalId}/${gObj.banner}.${gObj.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`
            : (inviteSummary?.bannerUrl || null);
        const splashUrl = gObj.splash
            ? `https://cdn.discordapp.com/splashes/${finalId}/${gObj.splash}.png?size=1024`
            : (inviteSummary?.splashUrl || null);

        if (Array.isArray(gObj.emojis)) {
            emojis = gObj.emojis.map((e) => ({
                id: e.id,
                name: e.name || 'emoji',
                animated: Boolean(e.animated),
                ext: e.animated ? 'gif' : 'png',
                url: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=128&quality=lossless`
            }));
        }

        if (Array.isArray(gObj.stickers)) {
            stickers = gObj.stickers
                .filter((s) => s.format_type !== 3) // skip Lottie JSON if no PNG
                .map((s) => {
                    const ext = s.format_type === 4 ? 'gif' : 'png';
                    return {
                        id: s.id,
                        name: s.name || 'sticker',
                        ext,
                        url: `https://media.discordapp.net/stickers/${s.id}.${ext}?size=320`
                    };
                });
        }

        sendJson(res, 200, {
            ok: true,
            guild: {
                id: finalId,
                name: finalName,
                description: gObj.description || inviteSummary?.description || '',
                iconUrl,
                bannerUrl,
                splashUrl,
                emojiCount: emojis.length,
                stickerCount: stickers.length,
                hasFullAccess: Boolean(guildData)
            },
            emojis,
            stickers
        });
        return;
    }

    // 7K. DOWNLOAD GUILD ASSETS & EMOJIS AS A READY ZIP ARCHIVE
    if (pathname === '/api/tools/guild-assets-zip' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const guildNameSafe = String(body.guildName || 'Sunucu').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 32) || 'Sunucu';
        const items = [];

        if (body.iconUrl) items.push({ folder: 'Varliklar', name: `icon.${body.iconUrl.includes('.gif') ? 'gif' : 'png'}`, url: body.iconUrl });
        if (body.bannerUrl) items.push({ folder: 'Varliklar', name: `banner.${body.bannerUrl.includes('.gif') ? 'gif' : 'png'}`, url: body.bannerUrl });
        if (body.splashUrl) items.push({ folder: 'Varliklar', name: 'splash.png', url: body.splashUrl });

        const emojiList = Array.isArray(body.emojis) ? body.emojis.slice(0, 80) : [];
        for (const e of emojiList) {
            if (e.url && e.name) {
                const safe = String(e.name).replace(/[^a-zA-Z0-9_]/g, '') || e.id;
                items.push({ folder: 'Emojiler', name: `${safe}_${String(e.id).slice(-4)}.${e.ext || 'png'}`, url: e.url });
            }
        }

        const stickerList = Array.isArray(body.stickers) ? body.stickers.slice(0, 30) : [];
        for (const s of stickerList) {
            if (s.url && s.name) {
                const safe = String(s.name).replace(/[^a-zA-Z0-9_]/g, '_') || s.id;
                items.push({ folder: 'Stickerlar', name: `${safe}_${String(s.id).slice(-4)}.${s.ext || 'png'}`, url: s.url });
            }
        }

        if (!items.length) {
            sendJson(res, 400, { ok: false, error: 'İndirilecek emoji veya görsel bulunamadı.' });
            return;
        }

        const zipEntries = [];
        const batchSize = 10;
        for (let i = 0; i < items.length; i += batchSize) {
            const slice = items.slice(i, i + batchSize);
            const fetched = await Promise.all(slice.map(async (it) => {
                try {
                    const r = await axios.get(it.url, { responseType: 'arraybuffer', timeout: 8000 });
                    return { name: `${it.folder}/${it.name}`, data: Buffer.from(r.data) };
                } catch (_) {
                    return null;
                }
            }));
            for (const f of fetched) {
                if (f) zipEntries.push(f);
            }
        }

        if (!zipEntries.length) {
            sendJson(res, 500, { ok: false, error: 'Görseller CDN üzerinden çekilemedi.' });
            return;
        }

        const zipBuf = buildZipBuffer(zipEntries);
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="EarlyHost_${guildNameSafe}_Assets.zip"`,
            'Content-Length': zipBuf.length
        });
        res.end(zipBuf);
        return;
    }

    // 8. SERVE BADGE ASSETS (/badges/* -> assets/badges/*)
    if (pathname.startsWith('/badges/')) {
        const safeName = path.basename(pathname);
        const badgePath = path.join(ASSETS_DIR, 'badges', safeName);
        serveStaticFile(res, badgePath);
        return;
    }

    // 9. SERVE STATIC FRONTEND FILES
    let reqFile = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const safePath = path.normalize(path.join(PUBLIC_DIR, reqFile));
    if (!safePath.startsWith(PUBLIC_DIR)) {
        sendJson(res, 403, { ok: false, error: 'Erişim reddedildi' });
        return;
    }

    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        serveStaticFile(res, safePath);
    } else {
        serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
    } catch (unhandledErr) {
        if (!res.headersSent) {
            sendJson(res, 500, { ok: false, error: 'Sunucu içi beklenmeyen hata koruma kalkanı tarafından yakalandı.' });
        }
    }
});

server.headersTimeout = 15000;
server.requestTimeout = 95000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 60;

process.on('uncaughtException', (err) => {
    console.error('  [WAF Crash Guard] Yakalanan Hata:', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
    console.error('  [WAF Promise Guard] Yakalanan Red:', reason?.message || reason);
});

async function startServer() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    }
    await ensureRobloxBackend();

    server.listen(PORT, '127.0.0.1', () => {
        console.log('\n  ══════════════════════════════════════════════════════════');
        console.log('   ⚡ EARLY.HOST — 3D WEB PLATFORMU & CANLI ARAÇ SUNUCUSU');
        console.log(`   🌐 Adres   : http://localhost:${PORT}`);
        console.log('   💬 Discord : https://discord.gg/anonim');
        console.log('   🙌 Thanks to hta');
        console.log('  ══════════════════════════════════════════════════════════\n');
    });
}

startServer();

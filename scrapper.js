const { Client, MessageEmbed } = require('discord.js-selfbot-v13');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// ANSI Renk Kodları
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GRAY = '\x1b[90m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';

// Hata yakalayıcılar
process.on('uncaughtException', (err) => {
    console.error(`  ${RED}[Hata] Beklenmeyen hata:${RESET}`, err?.message || err);
});

process.on('unhandledRejection', (reason) => {
    console.error(`  ${RED}[Hata] Promise:${RESET}`, reason?.message || reason);
});

// Canlı tutucu
setInterval(() => {}, 1000 * 60 * 60);

// Dizin belirleme
const baseDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const envPath = path.join(baseDir, '.env');

// .env yükleme
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
} else {
    require('dotenv').config();
}

function promptQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

function getClipboardText() {
    try {
        const text = require('child_process').execSync('powershell -NoProfile -Command "Get-Clipboard"', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: 3000
        });
        return text ? text.replace(/\r?\n/g, '').trim() : '';
    } catch {
        return '';
    }
}

async function promptWithClipboard(alanAdi) {
    const panoMetni = getClipboardText();
    const panodaUygunVeriVar = panoMetni && panoMetni.length > 5;

    if (panodaUygunVeriVar) {
        const gorunum = panoMetni.length > 35 
            ? `${panoMetni.slice(0, 15)}...${panoMetni.slice(-10)}` 
            : panoMetni;
        console.log(`  ${CYAN}[Pano]${RESET} ${WHITE}${gorunum}${RESET} ${GRAY}(Yapıştırmak için Enter'a basın)${RESET}`);
    }

    let cevap = await promptQuestion(`  ${alanAdi} > `);

    if ((!cevap || cevap.toLowerCase() === 'p' || cevap.toLowerCase() === 'yapistir') && panodaUygunVeriVar) {
        cevap = panoMetni;
        console.log(`  ${GREEN}[+] Panodan yapıştırıldı.${RESET}\n`);
    } else {
        console.log('');
    }

    return cevap;
}

async function bekletVeCikis(mesaj = '\n  Kapatmak için Enter tuşuna basın...') {
    await promptQuestion(mesaj);
    process.exit(1);
}

// 🎯 HEDEF NADİR VE DEĞERLİ ROZETLER (SADECE BU 8 ROZETTEN EN AZ BİRİNE SAHİP HESAPLAR LİSTELENİR)
const NADIR_HEDEF_ROZETLER = [
    {
        id: 'discord_staff',
        name: 'Discord Staff',
        flag: 'DISCORD_EMPLOYEE',
        emoji: '<:DiscordStaff:1563576035646374000>',
        consoleEmoji: '🛡️',
        order: 1
    },
    {
        id: 'golden_bug_hunter',
        name: 'Bug Hunter Seviye 2 (Altın)',
        flag: 'BUGHUNTER_LEVEL_2',
        emoji: '<:GoldenBugHunter:1563576037433020566>',
        consoleEmoji: '🐛',
        order: 2
    },
    {
        id: 'moderator_alumni',
        name: 'Discord Certified Moderator',
        flag: 'DISCORD_CERTIFIED_MODERATOR',
        emoji: '<:ModeratorProgramsAlumni:1563576038804426832>',
        consoleEmoji: '⚖️',
        order: 3
    },
    {
        id: 'hypesquad_events',
        name: 'HypeSquad Events',
        flag: 'HYPESQUAD_EVENTS',
        emoji: '<:HypeSquadEvents:1563576041027403798>',
        consoleEmoji: '🏆',
        order: 4
    },
    {
        id: 'early_bot_developer',
        name: 'Early Verified Bot Developer',
        flag: 'EARLY_VERIFIED_BOT_DEVELOPER',
        emoji: '<:EarlyVerifiedBotDeveloper:1563576043971944479>',
        consoleEmoji: '🤖',
        order: 5
    },
    {
        id: 'early_supporter',
        name: 'Early Supporter',
        flag: 'EARLY_SUPPORTER',
        emoji: '<:EarlySupporter:1563576045779558422>',
        consoleEmoji: '🌟',
        order: 6
    },
    {
        id: 'bug_hunter',
        name: 'Bug Hunter Seviye 1 (Yeşil)',
        flag: 'BUGHUNTER_LEVEL_1',
        emoji: '<:BugHunter:1563576048011182233>',
        consoleEmoji: '🦗',
        order: 7
    },
    {
        id: 'partnered_server_owner',
        name: 'Partnered Server Owner',
        flag: 'PARTNERED_SERVER_OWNER',
        emoji: '<:PartneredServerOwner:1563576049751826483>',
        consoleEmoji: '🤝',
        order: 8
    }
];

// Kullanıcıda hedef nadir rozet var mı tespit etme (Sıfır API Çağrısı, Bayrak Kontrolü)
function kullaniciHedefRozetleri(member) {
    if (!member || !member.user) return [];
    const user = member.user;
    const flags = user.flags?.toArray() || [];
    const bulunanlar = [];

    for (const r of NADIR_HEDEF_ROZETLER) {
        if (r.flag && flags.includes(r.flag)) {
            if (!bulunanlar.some(b => b.id === r.id)) {
                bulunanlar.push(r);
            }
        }
    }

    return bulunanlar;
}

// Sunucu takviyesi süresine göre Booster rozetini belirleme
function boosterAyaGoreRozet(diffMonths) {
    if (diffMonths >= 24) return { name: 'Booster (24+ Ay)', emoji: '<:Booster24m:1563576073323548753>', order: 30 };
    if (diffMonths >= 18) return { name: 'Booster (18 Ay)', emoji: '<:Booster18m:1563576074627973242>', order: 30 };
    if (diffMonths >= 15) return { name: 'Booster (15 Ay)', emoji: '<:Booster15m:1563576077065003054>', order: 30 };
    if (diffMonths >= 12) return { name: 'Booster (12 Ay)', emoji: '<:Booster12m:1563576078751105056>', order: 30 };
    if (diffMonths >= 9) return { name: 'Booster (9 Ay)', emoji: '<:Booster9m:1563576080596729917>', order: 30 };
    if (diffMonths >= 6) return { name: 'Booster (6 Ay)', emoji: '<:Booster6m:1563576082324787270>', order: 30 };
    if (diffMonths >= 3) return { name: 'Booster (3 Ay)', emoji: '<:Booster3m:1563576084078002230>', order: 30 };
    if (diffMonths >= 2) return { name: 'Booster (2 Ay)', emoji: '<:Booster2m:1563576085931892836>', order: 30 };
    return { name: 'Booster (1 Ay)', emoji: '<:Booster1m:1563576087802548288>', order: 30 };
}

// Profildeki rozet objesini parse edip isim, emoji ve sıralama sırasını döndürme
function parseBadgeItem(badge, profileData) {
    if (!badge) return null;
    const id = (badge.id || '').toLowerCase();
    const desc = (badge.description || '').toLowerCase();

    // 1. Nadir Rozetler (En Ön Sıra: 1-8)
    if (id.includes('staff')) return { name: 'Discord Staff', emoji: '<:DiscordStaff:1563576035646374000>', order: 1 };
    if (id.includes('bug_hunter_level_2')) return { name: 'Bug Hunter Seviye 2 (Altın)', emoji: '<:GoldenBugHunter:1563576037433020566>', order: 2 };
    if (id.includes('moderator') || id.includes('alumni') || id.includes('certified_moderator')) return { name: 'Discord Certified Moderator', emoji: '<:ModeratorProgramsAlumni:1563576038804426832>', order: 3 };
    if (id === 'hypesquad' || id.includes('hypesquad_events')) return { name: 'HypeSquad Events', emoji: '<:HypeSquadEvents:1563576041027403798>', order: 4 };
    if (id.includes('verified_developer') || id.includes('early_verified_bot_developer') || id.includes('early_bot_developer')) return { name: 'Early Verified Bot Developer', emoji: '<:EarlyVerifiedBotDeveloper:1563576043971944479>', order: 5 };
    if (id.includes('early_supporter')) return { name: 'Early Supporter', emoji: '<:EarlySupporter:1563576045779558422>', order: 6 };
    if (id.includes('bug_hunter_level_1') || (id.includes('bug_hunter') && !id.includes('level_2'))) return { name: 'Bug Hunter Seviye 1 (Yeşil)', emoji: '<:BugHunter:1563576048011182233>', order: 7 };
    if (id.includes('partner')) return { name: 'Partnered Server Owner', emoji: '<:PartneredServerOwner:1563576049751826483>', order: 8 };

    // 2. Nitro (Süreli / Evolving Tenure / Basic / Standart: 20)
    if (id.includes('tenure') || id.includes('month') || id === 'premium' || id.includes('nitro')) {
        if (id.includes('72') || desc.includes('opal') || id.includes('opal')) return { name: 'Nitro Opal (6y+)', emoji: '<:Opal:1563576051664429096>', order: 20 };
        if (id.includes('60') || id.includes('ruby') || desc.includes('yakut') || desc.includes('ruby')) return { name: 'Nitro Ruby (5y)', emoji: '<:rubyyakut:1563576053207797791>', order: 20 };
        if (id.includes('36') || id.includes('emerald') || desc.includes('zümrüt') || desc.includes('emerald')) return { name: 'Nitro Emerald (3y)', emoji: '<:Emeraldzmrt:1563576054671745185>', order: 20 };
        if (id.includes('24') || id.includes('diamond') || desc.includes('elmas') || desc.includes('diamond')) return { name: 'Nitro Diamond (2y)', emoji: '<:Diamondelmas:1563576061730488421>', order: 20 };
        if (id.includes('12') || id.includes('platinum') || desc.includes('platin') || desc.includes('platinum')) return { name: 'Nitro Platinum (1y)', emoji: '<:Platinumplat:1563576064259653753>', order: 20 };
        if (id.includes('6_month') || desc.includes('altın') || desc.includes('gold')) return { name: 'Nitro Gold (6m)', emoji: '<:NitroGold:1563576065564221460>', order: 20 };
        if (id.includes('3_month') || desc.includes('gümüş') || desc.includes('silver')) return { name: 'Nitro Silver (3m)', emoji: '<:NitroSilver:1563576066554069065>', order: 20 };
        if (id.includes('1_month') || desc.includes('bronz') || desc.includes('bronze')) return { name: 'Nitro Bronze (1m)', emoji: '<:NitroBronze:1563576069284692060>', order: 20 };

        if (id.includes('basic') || profileData?.premium_type === 1 || profileData?.premium_type === 3) {
            return { name: 'Nitro Basic', emoji: '<:NitroBasic:1563576071805210684>', order: 20 };
        }

        // Eğer rozet ID'sinde süre yoksa ama profileData.premium_since varsa süresine göre belirle
        if (profileData?.premium_since) {
            const months = (Date.now() - new Date(profileData.premium_since).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
            if (months >= 72) return { name: 'Nitro Opal (6y+)', emoji: '<:Opal:1563576051664429096>', order: 20 };
            if (months >= 60) return { name: 'Nitro Ruby (5y)', emoji: '<:rubyyakut:1563576053207797791>', order: 20 };
            if (months >= 36) return { name: 'Nitro Emerald (3y)', emoji: '<:Emeraldzmrt:1563576054671745185>', order: 20 };
            if (months >= 24) return { name: 'Nitro Diamond (2y)', emoji: '<:Diamondelmas:1563576061730488421>', order: 20 };
            if (months >= 12) return { name: 'Nitro Platinum (1y)', emoji: '<:Platinumplat:1563576064259653753>', order: 20 };
            if (months >= 6) return { name: 'Nitro Gold (6m)', emoji: '<:NitroGold:1563576065564221460>', order: 20 };
            if (months >= 3) return { name: 'Nitro Silver (3m)', emoji: '<:NitroSilver:1563576066554069065>', order: 20 };
            if (months >= 1) return { name: 'Nitro Bronze (1m)', emoji: '<:NitroBronze:1563576069284692060>', order: 20 };
        }

        return { name: 'Nitro', emoji: '<:NitroGold:1563576065564221460>', order: 20 };
    }

    // 3. Sunucu Takviyesi (Guild Booster - 9 Kademe: 30)
    if (id.includes('guild_booster')) {
        if (id.includes('lvl9') || desc.includes('24 ay') || desc.includes('2 yıl')) return { name: 'Booster (24+ Ay)', emoji: '<:Booster24m:1563576073323548753>', order: 30 };
        if (id.includes('lvl8') || desc.includes('18 ay')) return { name: 'Booster (18 Ay)', emoji: '<:Booster18m:1563576074627973242>', order: 30 };
        if (id.includes('lvl7') || desc.includes('15 ay')) return { name: 'Booster (15 Ay)', emoji: '<:Booster15m:1563576077065003054>', order: 30 };
        if (id.includes('lvl6') || desc.includes('12 ay') || desc.includes('1 yıl')) return { name: 'Booster (12 Ay)', emoji: '<:Booster12m:1563576078751105056>', order: 30 };
        if (id.includes('lvl5') || desc.includes('9 ay')) return { name: 'Booster (9 Ay)', emoji: '<:Booster9m:1563576080596729917>', order: 30 };
        if (id.includes('lvl4') || desc.includes('6 ay')) return { name: 'Booster (6 Ay)', emoji: '<:Booster6m:1563576082324787270>', order: 30 };
        if (id.includes('lvl3') || desc.includes('3 ay')) return { name: 'Booster (3 Ay)', emoji: '<:Booster3m:1563576084078002230>', order: 30 };
        if (id.includes('lvl2') || desc.includes('2 ay')) return { name: 'Booster (2 Ay)', emoji: '<:Booster2m:1563576085931892836>', order: 30 };
        return { name: 'Booster (1 Ay)', emoji: '<:Booster1m:1563576087802548288>', order: 30 };
    }

    // 4. Görevler (Quest: 40)
    if (id.includes('quest')) return { name: 'Quest Completed', emoji: '<:QuestCompleted:1563576090100764672>', order: 40 };

    // 5. HypeSquad Evleri (50)
    if (id.includes('house_1') || id.includes('bravery') || desc.includes('cesaret')) return { name: 'HypeSquad Bravery', emoji: '<:HypeBravery:1559275944823361586>', order: 50 };
    if (id.includes('house_2') || id.includes('brilliance') || desc.includes('güzellik') || desc.includes('parlaklık')) return { name: 'HypeSquad Brilliance', emoji: '<:HypeBrilliance:1559275947495268593>', order: 50 };
    if (id.includes('house_3') || id.includes('balance') || desc.includes('denge')) return { name: 'HypeSquad Balance', emoji: '<:HypeBalance:1559272045785776198>', order: 50 };

    // 6. Eski Kullanıcı Adı (Legacy Username: 60)
    if (id.includes('legacy') || desc.includes('önceden')) return { name: 'Legacy Name', emoji: '<:LegacyName:1559275948942033046>', order: 60 };

    // 7. Eğlence / Özel Etkinlik Rozetleri (70+)
    if (id.includes('april_fools') || desc.includes('seviyesine')) return { name: 'April Fools Leaf', emoji: '<:AprilFoolsLeaf:1559272047203590294>', order: 70 };
    if (id.includes('orb')) return { name: 'Orb Badge', emoji: '<:OrbBadge:1559272048608542770>', order: 71 };

    return null;
}

const BANNER_PATH = path.join(baseDir, 'assets', 'banner.png');

// Güvenli Webhook Gönderici (Ratelimit Korumalı)
async function guvenliWebhookGonder(webhookUrl, icerik, embedler, ekDosyaVar = false) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return;
    try {
        const payload = {
            content: icerik,
            embeds: embedler.map(e => e.toJSON())
        };

        if (ekDosyaVar && fs.existsSync(BANNER_PATH)) {
            const form = new FormData();
            form.append('payload_json', JSON.stringify(payload));
            const fileBuffer = fs.readFileSync(BANNER_PATH);
            form.append('files[0]', new Blob([fileBuffer], { type: 'image/png' }), 'banner.png');
            await axios.post(webhookUrl, form, { timeout: 15000 });
        } else {
            await axios.post(webhookUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });
        }
    } catch (err) {
        console.error(`  ${RED}[Webhook Hatası]:${RESET}`, err.response?.data?.message || err.message);
    }
}

// Güvenli ve Ratelimit Korumalı Profil Çekici (Discord İstemci API'si - Cloudflare Korumasına Takılmaz)
async function guvenliProfilCek(client, userId, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (client?.api) {
                const data = await client.api.users(userId).profile.get({
                    query: { with_mutual_guilds: false }
                });
                return data;
            }
            const res = await axios.get(`https://discord.com/api/v9/users/${userId}/profile?with_mutual_guilds=false`, {
                headers: { Authorization: client.token || process.env.DISCORD_TOKEN },
                timeout: 5000
            });
            return res.data;
        } catch (err) {
            const status = err.httpStatus || err.response?.status;
            if (status === 429) {
                const retryAfter = Number(err.response?.data?.retry_after || 
                                          err.response?.headers?.['retry-after'] || 
                                          err.data?.retry_after ||
                                          1.5);
                const waitMs = Math.min(Math.ceil(retryAfter * 1000) + 300, 3000);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }
            if (attempt === maxRetries) return null;
            await new Promise(r => setTimeout(r, 200));
        }
    }
    return null;
}

// %100 GÜVENLİ VE SIFIR-BAN SUNUCU TARAYICI (OPCODE 8 VE MASS SCRAPING KULLANMAZ)
async function sunucuyuGuvenleTara(client, guildId, webhookUrl) {
    const temizId = guildId.replace(/[^\d]/g, '').trim();
    if (!temizId) {
        console.log(`\n  ${RED}[!] Geçersiz Sunucu ID'si.${RESET}\n`);
        return;
    }

    let guild = client.guilds.cache.get(temizId);
    if (!guild) {
        try {
            guild = await client.guilds.fetch(temizId).catch(() => null);
        } catch (_) {}
    }

    if (!guild) {
        console.log(`\n  ${RED}[!] Sunucu bulunamadı: '${temizId}'${RESET}`);
        console.log(`  ${GRAY}Hesabın bu sunucuda olduğundan emin olun.${RESET}\n`);
        return;
    }

    const uyeSayisi = guild.memberCount ? Number(guild.memberCount).toLocaleString('tr-TR') : 'Bilinmiyor';
    console.log(`\n  ${CYAN}[>]${RESET} Sunucu: ${BOLD}${WHITE}${guild.name}${RESET} ${GRAY}(${uyeSayisi} üye)${RESET}`);
    console.log(`  ${GRAY}[*] Üyeler taranıyor...${RESET}`);

    let toplananUyeler = new Map();

    // 1. Sunucu üyelerini güvenli yöntemle çek (Yeterli süre tanıyarak tüm parçaları eksiksiz toplar)
    try {
        const fetched = await guild.members.fetchByMemberSafety(25000).catch(() => null);
        if (fetched && fetched.size > 0) {
            fetched.forEach(m => toplananUyeler.set(m.id, m));
        }
    } catch (_) {}

    // 2. Önbellekteki ve ses kanallarındaki üyeleri de dahil et
    guild.members.cache.forEach(m => toplananUyeler.set(m.id, m));
    guild.channels.cache.filter(c => c.isVoice()).forEach(k => {
        k.members.forEach(m => toplananUyeler.set(m.id, m));
    });

    const bulunanRozetliler = [];

    for (const member of toplananUyeler.values()) {
        const rozetler = kullaniciHedefRozetleri(member);
        if (rozetler.length > 0) {
            bulunanRozetliler.push({
                member,
                rozetler,
                user: member.user
            });
        }
    }

    const aktifSayi = Number(toplananUyeler.size).toLocaleString('tr-TR');
    console.log(`  ${GREEN}[+]${RESET} ${aktifSayi} üye incelendi — ${GREEN}${BOLD}${bulunanRozetliler.length}${RESET} hedef rozetli bulundu.`);

    if (bulunanRozetliler.length === 0) {
        console.log(`  ${YELLOW}[!] Hedef rozetli kullanıcı bulunamadı.${RESET}\n`);

        const bosEmbed = new MessageEmbed()
            .setColor('#2B2D31')
            .setTitle(guild.name)
            .setDescription('Hedef rozetli kullanıcı bulunamadı.')
            .setImage('attachment://banner.png')
            .setFooter({ text: 'by @vacx' });

        await guvenliWebhookGonder(webhookUrl, '', [bosEmbed], true);
        console.log(`  ${GRAY}──────────────────────────────────────────────────${RESET}\n`);
        return;
    }

    // Bulunan hedef kullanıcıların detaylı profil rozetlerini güvenli şekilde çek
    const token = client.token || process.env.DISCORD_TOKEN;

    for (let i = 0; i < bulunanRozetliler.length; i++) {
        const item = bulunanRozetliler[i];
        const yuzde = Math.round(((i + 1) / bulunanRozetliler.length) * 100);
        process.stdout.write(`\r  ${CYAN}[*]${RESET} Profiller inceleniyor: ${i + 1}/${bulunanRozetliler.length} (%${yuzde}) ${GRAY}@${item.user.username}${RESET}     `);

        const rozetListesi = [];
        let profileData = null;
        try {
            profileData = await guvenliProfilCek(client, item.user.id);
        } catch (_) {}

        // 1. Profil API'sinden gelen tüm rozetleri ekle
        if (profileData && Array.isArray(profileData.badges)) {
            for (const b of profileData.badges) {
                try {
                    const parsed = parseBadgeItem(b, profileData);
                    if (parsed && !rozetListesi.some(x => x.emoji === parsed.emoji)) {
                        rozetListesi.push(parsed);
                    }
                } catch (_) {}
            }
        }

        // 2. Eğer profilde booster rozeti yoksa ama profileData.premium_guild_since veya sunucu boostu varsa ekle
        const hasBooster = rozetListesi.some(x => x.order === 30 || x.emoji.includes('Booster'));
        if (!hasBooster) {
            try {
                if (profileData?.premium_guild_since) {
                    const diffMonths = (Date.now() - new Date(profileData.premium_guild_since).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
                    const booster = boosterAyaGoreRozet(diffMonths);
                    if (booster && !rozetListesi.some(x => x.emoji === booster.emoji)) {
                        rozetListesi.push(booster);
                    }
                } else if (item.member?.premiumSince) {
                    const boostDate = item.member.premiumSince instanceof Date ? item.member.premiumSince : new Date(item.member.premiumSince);
                    const diffMonths = (Date.now() - boostDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
                    const booster = boosterAyaGoreRozet(diffMonths);
                    if (booster && !rozetListesi.some(x => x.emoji === booster.emoji)) {
                        rozetListesi.push(booster);
                    }
                }
            } catch (_) {}
        }

        // 3. Kullanıcının tespit edilen nadir rozetlerinden (bayraklardan) eksik olan varsa ekle
        for (const r of item.rozetler) {
            if (!rozetListesi.some(x => x.emoji === r.emoji)) {
                rozetListesi.push({
                    name: r.name,
                    emoji: r.emoji,
                    order: r.order || 5
                });
            }
        }

        // 4. Rozetleri standart öncelik sırasına göre sırala
        rozetListesi.sort((a, b) => (a.order || 99) - (b.order || 99));

        item.parsedRozetler = rozetListesi;

        // Güvenli istek aralığı (Ratelimit koruması)
        await new Promise(r => setTimeout(r, 200));
    }
    process.stdout.write(`\r  ${GREEN}[+]${RESET} Profil analizleri tamamlandı.                                    \n\n`);

    // Konsola ve Discord'a alt alta sıralı yazdırma
    const siraliSatirlar = [];
    bulunanRozetliler.forEach((item, index) => {
        const rozetler = (item.parsedRozetler && item.parsedRozetler.length > 0)
            ? item.parsedRozetler
            : item.rozetler;

        const rozetMetniKonsol = rozetler.map(r => r.name).join(', ');
        const num = String(index + 1).padStart(2, '0');

        console.log(`  ${GRAY}[${num}]${RESET} ${WHITE}@${item.user.username}${RESET} ${GRAY}(${item.member.displayName})${RESET} ${DIM}->${RESET} ${CYAN}${rozetMetniKonsol}${RESET}`);

        // Tıklanınca doğrudan profil açan şık bağlantı (ID gözükmez, her zaman @kullaniciadi görünür)
        const emojiGrubu = rozetler.map(r => r.emoji).join(' ');
        const satirDiscord = `\`${index + 1}.\` [**@${item.user.username}**](https://discord.com/users/${item.user.id}) ${emojiGrubu}`;

        siraliSatirlar.push(satirDiscord);
    });

    // Embed Parçaları (Discord sınırlarına göre bölerek gönder - her parça 15 kişi)
    const parcaBoyutu = 15;
    const embedParcalari = [];

    for (let i = 0; i < siraliSatirlar.length; i += parcaBoyutu) {
        const parca = siraliSatirlar.slice(i, i + parcaBoyutu);
        const sayfa = Math.floor(i / parcaBoyutu) + 1;
        const toplamSayfa = Math.ceil(siraliSatirlar.length / parcaBoyutu);

        const embed = new MessageEmbed()
            .setColor('#2B2D31')
            .setTitle(guild.name)
            .setDescription(parca.join('\n'))
            .setFooter({ text: toplamSayfa > 1 ? `by @vacx • Sayfa ${sayfa}/${toplamSayfa}` : 'by @vacx' });

        if (sayfa === toplamSayfa) {
            embed.setImage('attachment://banner.png');
        }

        embedParcalari.push(embed);
    }

    // Webhook'a raporu tek tek gönder
    for (let i = 0; i < embedParcalari.length; i++) {
        const embed = embedParcalari[i];
        await guvenliWebhookGonder(
            webhookUrl,
            '',
            [embed],
            i === embedParcalari.length - 1
        );
        if (i < embedParcalari.length - 1) {
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    console.log(`\n  ${GREEN}[+]${RESET} Webhook raporu iletildi.`);
    console.log(`  ${GRAY}──────────────────────────────────────────────────${RESET}\n`);
}

function headerYazdir(tag = null, sunucuSayisi = 0) {
    console.clear();
    console.log(`\n${CYAN}${BOLD}  EARLY.HOST SCRAPPER${RESET} ${GRAY}•${RESET} ${CYAN}thanks to hta${RESET}`);
    console.log(`  ${GRAY}──────────────────────────────────────────────────${RESET}`);
    if (tag) {
        console.log(`  ${GRAY}Hesap   :${RESET} ${WHITE}${tag}${RESET} ${GRAY}(${sunucuSayisi} Sunucu)${RESET}`);
        console.log(`  ${GRAY}Kullanım:${RESET} ${DIM}Discord'da .<id> veya konsola ID girin${RESET}`);
    } else {
        console.log(`  ${GRAY}Durum   :${RESET} ${YELLOW}Giriş yapılıyor...${RESET}`);
    }
    console.log(`  ${GRAY}──────────────────────────────────────────────────${RESET}\n`);
}

async function baslat() {
    headerYazdir();

    let token = process.env.DISCORD_TOKEN;
    let webhookUrl = process.env.WEBHOOK_URL;

    const gecersizToken = !token || token === 'your_discord_token' || token.trim() === '';
    const gecersizWebhook = !webhookUrl || webhookUrl === 'your_webhook_url' || webhookUrl.trim() === '';

    if (gecersizToken || gecersizWebhook) {
        console.log(`  ${YELLOW}[!] .env ayarları eksik. Lütfen bilgileri girin:${RESET}\n`);

        if (gecersizToken) {
            token = await promptWithClipboard('Discord Token');
        }
        if (gecersizWebhook) {
            webhookUrl = await promptWithClipboard('Webhook URL');
        }

        const envIcerik = `# Discord Hesap Tokeniniz\nDISCORD_TOKEN=${token}\n\n# Discord Webhook URL\nWEBHOOK_URL=${webhookUrl}\n`;
        fs.writeFileSync(envPath, envIcerik, 'utf-8');
        console.log(`  ${GREEN}[+] Ayarlar kaydedildi.${RESET}\n`);
    }

    if (!token) {
        console.log(`  ${RED}[!] Discord tokeni boş bırakılamaz.${RESET}`);
        await bekletVeCikis();
        return;
    }

    // Güvenli istemci yapılandırması
    const client = new Client({
        checkUpdate: false
    });

    client.on('error', (err) => console.error(`  ${RED}[Hata]${RESET}`, err?.message || err));
    client.on('shardError', (err) => console.error(`  ${RED}[Ağ Hatası]${RESET}`, err?.message || err));
    client.on('shardDisconnect', () => console.log(`  ${YELLOW}[Bilgi] Bağlantı kesildi, yeniden bağlanılıyor...${RESET}`));
    client.on('shardReconnecting', () => console.log(`  ${YELLOW}[Bilgi] Discord'a yeniden bağlanılıyor...${RESET}`));
    client.on('shardResume', () => console.log(`  ${GREEN}[+] Bağlantı devam ettirildi.${RESET}`));

    client.on('ready', () => {
        headerYazdir(client.user.tag, client.guilds.cache.size);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const promptInput = () => {
            process.stdout.write(`  ${CYAN}ID > ${RESET}`);
        };

        promptInput();

        rl.on('line', async (line) => {
            try {
                let girdi = line.trim();

                // Eğer kullanıcı hiçbir şey yazmadan Enter'a bastıysa veya 'v' / 'p' yazdıysa panodaki ID'yi al
                if (!girdi || girdi.toLowerCase() === 'v' || girdi.toLowerCase() === 'p' || girdi.toLowerCase() === 'yapistir') {
                    const pano = getClipboardText();
                    const panoId = pano ? pano.replace(/[^\d]/g, '') : '';
                    if (panoId && panoId.length >= 17) {
                        girdi = panoId;
                        console.log(`  ${GRAY}-> Panodan yapıştırıldı: ${girdi}${RESET}`);
                    } else if (!girdi) {
                        console.log(`  ${YELLOW}[!] Panoda geçerli ID bulunamadı.${RESET}`);
                        promptInput();
                        return;
                    }
                }

                if (girdi) {
                    await sunucuyuGuvenleTara(client, girdi, webhookUrl);
                }
                promptInput();
            } catch (err) {
                console.error(`  ${RED}[Hata] Tarama hatası:${RESET}`, err?.message || err);
                promptInput();
            }
        });
    });

    // 📩 Discord Sohbet Komut Dinleyicisi (PASİF DİNLEME - HESAPTAN MESAJ ATMAZ)
    client.on('messageCreate', async (message) => {
        try {
            // Sadece kendi hesabınızın yazdığı komutları dinle
            if (message.author.id !== client.user.id) return;

            const metin = message.content.trim();
            const kucukMetin = metin.toLowerCase();
            let hedefSunucuId = null;

            // Format 1: Sadece ".tara" veya ".sunucuid" yazıldıysa ve bir sunucu kanalındaysa
            if ((kucukMetin === '.tara' || kucukMetin === '.sunucu' || kucukMetin === '.sunucuid') && message.guild) {
                hedefSunucuId = message.guild.id;
            }
            // Format 2: ".tara <id>", ".sunucuid <id>", ".sunucu <id>"
            else if (kucukMetin.startsWith('.tara') || kucukMetin.startsWith('.sunucuid') || kucukMetin.startsWith('.sunucu')) {
                const parcalar = metin.split(/\s+/);
                if (parcalar[1]) {
                    hedefSunucuId = parcalar[1].replace(/[^\d]/g, '');
                } else if (message.guild) {
                    hedefSunucuId = message.guild.id;
                }
            }
            // Format 3: ".[id]" (Örn: .1015060230222131221)
            else {
                const dogrudanIdRegex = /^\.(\d{17,21})$/;
                const idEslesme = metin.match(dogrudanIdRegex);
                if (idEslesme) {
                    hedefSunucuId = idEslesme[1];
                }
            }

            if (hedefSunucuId) {
                await sunucuyuGuvenleTara(client, hedefSunucuId, webhookUrl);
                process.stdout.write(`  ${CYAN}ID > ${RESET}`);
            }
        } catch (_) {}
    });

    try {
        await client.login(token);
    } catch (girisHatasi) {
        console.log(`\n  ${RED}[!] Discord giriş hatası: ${girisHatasi.message}${RESET}`);
        await bekletVeCikis();
    }
}

baslat().catch(async (err) => {
    console.error(`  ${RED}[Kritik Hata]:${RESET}`, err?.message || err);
    await bekletVeCikis();
});

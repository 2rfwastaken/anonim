const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const KORBLOX_ASSETS = new Set([139607570, 139607625, 139607673, 139607718, 139607770, 139610147]);
const HEADLESS_ASSETS = new Set([134082453, 134082473, 134082507, 134082533, 134082557, 131592085, 15093053680, 134082579]);
const VALKYRIE_ASSETS = new Set([1365767, 1402432199, 124730194, 4390891467]);
const DOMINUS_ASSETS = new Set([21070012, 48545806, 6340227, 96103379, 138932314, 162067148, 250395631, 527365852, 2337185154, 4255053867, 151784320]);
const SSHF_STITCH_ASSETS = new Set([494291269, 8329679, 494290547, 7074786, 2409285794]);

const NICK_STOPWORDS = new Set([
    'afk', 'vip', 'mod', 'admin', 'staff', 'kurucu', 'owner', 'booster', 'ceo', 'dev', 'bot',
    'turk', 'tr', 'eng', 'eu', 'usa', 'pro', 'king', 'queen', 'real', 'official', 'yt', 'ttv',
    'mute', 'muted', 'ban', 'jail', 'kayıtsız', 'uye', 'member', 'ekip', 'yetkili'
]);

let rolimonsCache = { ts: 0, items: {} };
const catalogPriceCache = new Map(); // assetId -> { name, price, isLimited }
let robloxCsrfToken = '';

async function getRolimonsItems() {
    if (rolimonsCache.items && Object.keys(rolimonsCache.items).length > 0 && (Date.now() - rolimonsCache.ts) < 600000) {
        return rolimonsCache.items;
    }
    const urls = [
        'https://api.rolimons.com/items/v1/itemdetails',
        'https://www.rolimons.com/itemapi/itemdetails'
    ];
    for (const url of urls) {
        try {
            const r = await axios.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 9000 });
            if (r.data && r.data.success && r.data.items) {
                rolimonsCache = { ts: Date.now(), items: r.data.items };
                return rolimonsCache.items;
            }
        } catch (_) {}
    }
    return rolimonsCache.items || {};
}

async function fetchCatalogAssetPrices(assetIds) {
    const missing = assetIds.filter((id) => id && !catalogPriceCache.has(Number(id)));
    for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100).map((id) => Number(id));
        const payload = { items: chunk.map((id) => ({ itemType: 'Asset', id })) };
        let resData = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const headers = { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' };
                if (robloxCsrfToken) headers['x-csrf-token'] = robloxCsrfToken;
                const r = await axios.post('https://catalog.roblox.com/v1/catalog/items/details', payload, { headers, timeout: 8000 });
                resData = r.data;
                break;
            } catch (err) {
                const newToken = err.response?.headers?.['x-csrf-token'];
                if (newToken && attempt === 0) {
                    robloxCsrfToken = newToken;
                    continue;
                }
                break;
            }
        }

        const seen = new Set();
        for (const item of (resData?.data || [])) {
            const iid = Number(item.id);
            seen.add(iid);
            const price = Math.max(Number(item.lowestResalePrice || 0), Number(item.lowestPrice || 0), Number(item.price || 0));
            const restrictions = item.itemRestrictions || [];
            const isLimited = restrictions.includes('Limited') || restrictions.includes('LimitedUnique') || restrictions.includes('Collectible');
            catalogPriceCache.set(iid, { name: item.name || `Asset #${iid}`, price, isLimited });
        }
        for (const id of chunk) {
            if (!seen.has(id) && !catalogPriceCache.has(id)) {
                catalogPriceCache.set(id, { name: `Asset #${id}`, price: 0, isLimited: false });
            }
        }
    }
}

async function fetchDiscordProfileSafe(selfClient, userId) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            if (selfClient?.api) {
                const p = selfClient.api.users(userId).profile.get({ query: { with_mutual_guilds: false } });
                const t = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 4000));
                return await Promise.race([p, t]);
            }
            const r = await axios.get(`https://discord.com/api/v9/users/${userId}/profile?with_mutual_guilds=false`, {
                headers: { Authorization: selfClient.token },
                timeout: 4000
            });
            return r.data;
        } catch (err) {
            const status = err.httpStatus || err.response?.status;
            if (status === 429) {
                const retryMs = Math.min(3000, Math.ceil((err.retry_after || err.response?.data?.retry_after || 1) * 1000));
                await new Promise((r) => setTimeout(r, retryMs));
                continue;
            }
            return null;
        }
    }
    return null;
}

function extractRobloxFromDiscordProfile(member, profileData, includeNicknames = true) {
    // 1. Official Connected Accounts (100% Verified OAuth Link)
    const connected = profileData?.connected_accounts || [];
    const rbxConn = connected.find((c) => String(c.type || '').toLowerCase() === 'roblox');
    if (rbxConn) {
        const rawId = String(rbxConn.id || '').trim();
        const rawName = String(rbxConn.name || '').trim();
        return {
            robloxId: /^\d+$/.test(rawId) ? Number(rawId) : null,
            robloxUsername: rawName || (!/^\d+$/.test(rawId) ? rawId : ''),
            verified: Boolean(rbxConn.verified !== false),
            linkSource: 'Discord Bağlı Hesap'
        };
    }

    // 2. Discord Bio / Server Member Bio (roblox.com/users/... or explicit roblox: handle)
    const fullBio = [
        profileData?.user_profile?.bio || '',
        profileData?.guild_member_profile?.bio || ''
    ].join('\n');

    const urlMatch = fullBio.match(/roblox\.com\/users\/(\d{3,15})/i);
    if (urlMatch) {
        return {
            robloxId: Number(urlMatch[1]),
            robloxUsername: '',
            verified: false,
            linkSource: 'Discord Bio Linki'
        };
    }

    const handleBioMatch = fullBio.match(/(?:roblox|rblx)\s*(?:user|id|adım|adim|hesabım|nick)?\s*[:=\->]+\s*@?([a-zA-Z0-9_]{3,20})/i);
    if (handleBioMatch && !NICK_STOPWORDS.has(handleBioMatch[1].toLowerCase())) {
        return {
            robloxId: null,
            robloxUsername: handleBioMatch[1],
            verified: false,
            linkSource: 'Discord Bio'
        };
    }

    // 3. Bloxlink / RoVer Verified Guild Nickname Pattern: e.g. "Ahmet (@RobloxUser)" or "Display (RobloxUser)"
    if (includeNicknames && member?.nickname) {
        const nick = String(member.nickname).trim();
        const parenMatch = nick.match(/\(@?([a-zA-Z0-9_]{3,20})\)\s*$/);
        if (parenMatch) {
            const candidate = parenMatch[1];
            const cleanLower = candidate.toLowerCase();
            if (!NICK_STOPWORDS.has(cleanLower) && cleanLower !== member.user?.username?.toLowerCase()) {
                return {
                    robloxId: null,
                    robloxUsername: candidate,
                    verified: false,
                    linkSource: 'Sunucu Doğrulama İsmi'
                };
            }
        }
    }

    return null;
}

async function enrichRobloxAccountsBatch(linkedEntries, onProgress = null) {
    if (!linkedEntries.length) return [];

    // 1. Resolve any username-only entries to numeric Roblox User IDs
    const missingNames = [...new Set(
        linkedEntries
            .filter((e) => !e.robloxId && e.robloxUsername)
            .map((e) => e.robloxUsername)
    )];

    const nameToUserMap = new Map();
    for (let i = 0; i < missingNames.length; i += 80) {
        const chunk = missingNames.slice(i, i + 80);
        try {
            const r = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: chunk,
                excludeBannedUsers: false
            }, { headers: { 'User-Agent': USER_AGENT }, timeout: 8000 });
            for (const u of (r.data?.data || [])) {
                if (u.requestedUsername) nameToUserMap.set(u.requestedUsername.toLowerCase(), u);
                if (u.name) nameToUserMap.set(u.name.toLowerCase(), u);
            }
        } catch (_) {}
    }

    const validEntries = [];
    for (const entry of linkedEntries) {
        if (entry.robloxId) {
            validEntries.push(entry);
        } else if (entry.robloxUsername) {
            const resolved = nameToUserMap.get(entry.robloxUsername.toLowerCase());
            if (resolved && resolved.id) {
                entry.robloxId = Number(resolved.id);
                entry.robloxUsername = resolved.name || entry.robloxUsername;
                entry.robloxDisplayName = resolved.displayName || resolved.name;
                validEntries.push(entry);
            }
        }
    }

    if (!validEntries.length) return [];

    const allRobloxIds = [...new Set(validEntries.map((e) => e.robloxId))];
    const roliItems = await getRolimonsItems();

    // 2. Batch Headshot Thumbnails
    const thumbMap = new Map();
    for (let i = 0; i < allRobloxIds.length; i += 80) {
        const chunk = allRobloxIds.slice(i, i + 80);
        try {
            const r = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(',')}&size=150x150&format=Png&isCircular=false`, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 8000
            });
            for (const item of (r.data?.data || [])) {
                if (item.imageUrl) thumbMap.set(Number(item.targetId), item.imageUrl);
            }
        } catch (_) {}
    }

    // 3. Batch Presences
    const presenceMap = new Map();
    for (let i = 0; i < allRobloxIds.length; i += 80) {
        const chunk = allRobloxIds.slice(i, i + 80);
        try {
            const r = await axios.post('https://presence.roblox.com/v1/presence/users', { userIds: chunk }, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 7000
            });
            for (const p of (r.data?.userPresences || [])) {
                presenceMap.set(Number(p.userId), p);
            }
        } catch (_) {}
    }

    // 4. Fetch User Info + Worn Avatar Assets + Limited Collectibles in Parallel Batches
    const rawUserMap = new Map();
    const unknownCatalogIds = new Set();

    const CONCURRENCY = 8;
    for (let i = 0; i < allRobloxIds.length; i += CONCURRENCY) {
        const chunk = allRobloxIds.slice(i, i + CONCURRENCY);
        if (onProgress) {
            const pct = 75 + Math.round(((i + chunk.length) / allRobloxIds.length) * 20);
            await onProgress(`Roblox envanter ve Robux değerleri hesaplanıyor (${Math.min(i + chunk.length, allRobloxIds.length)}/${allRobloxIds.length})...`, Math.min(96, pct));
        }

        await Promise.all(chunk.map(async (uid) => {
            const [uInfo, avatarRes, collRes] = await Promise.all([
                axios.get(`https://users.roblox.com/v1/users/${uid}`, { headers: { 'User-Agent': USER_AGENT }, timeout: 6000 }).then((r) => r.data).catch(() => null),
                axios.get(`https://avatar.roblox.com/v1/users/${uid}/avatar`, { headers: { 'User-Agent': USER_AGENT }, timeout: 6000 }).then((r) => r.data).catch(() => null),
                axios.get(`https://inventory.roblox.com/v1/users/${uid}/assets/collectibles?limit=100&sortOrder=Desc`, { headers: { 'User-Agent': USER_AGENT }, timeout: 6000 }).then((r) => r.data).catch(() => null)
            ]);

            const wornAssets = avatarRes?.assets || [];
            const collectibles = collRes?.data || [];
            const invPublic = collRes !== null;

            for (const a of wornAssets) {
                const aid = Number(a.id);
                if (
                    aid &&
                    !roliItems[String(aid)] &&
                    !KORBLOX_ASSETS.has(aid) &&
                    !HEADLESS_ASSETS.has(aid) &&
                    aid !== 1402432199
                ) {
                    unknownCatalogIds.add(aid);
                }
            }

            rawUserMap.set(uid, { uInfo, wornAssets, collectibles, invPublic });
        }));
    }

    if (unknownCatalogIds.size > 0) {
        await fetchCatalogAssetPrices([...unknownCatalogIds]);
    }

    // 5. Compute Exact Robux Value & Special Item Badges for Each Linked Account
    const finalResults = [];
    for (const entry of validEntries) {
        const uid = entry.robloxId;
        const raw = rawUserMap.get(uid);
        if (!raw) continue;

        const { uInfo, wornAssets, collectibles, invPublic } = raw;
        const username = uInfo?.name || entry.robloxUsername || `User_${uid}`;
        const displayName = uInfo?.displayName || entry.robloxDisplayName || username;
        const createdIso = uInfo?.created || null;
        const createdYear = createdIso ? new Date(createdIso).getFullYear() : null;

        const itemsMap = new Map();
        const wornIds = new Set();
        const allIds = new Set();
        const seenBundles = new Set();

        for (const a of wornAssets) {
            const aid = Number(a.id);
            if (!aid) continue;
            wornIds.add(aid);
            allIds.add(aid);

            if (KORBLOX_ASSETS.has(aid)) {
                if (!seenBundles.has('Korblox')) {
                    seenBundles.add('Korblox');
                    itemsMap.set('bundle_korblox', { id: aid, name: 'Korblox Deathspeaker', value: 17000, category: 'Paket' });
                }
            } else if (HEADLESS_ASSETS.has(aid)) {
                if (!seenBundles.has('Headless')) {
                    seenBundles.add('Headless');
                    itemsMap.set('bundle_headless', { id: aid, name: 'Headless Horseman', value: 31000, category: 'Paket' });
                }
            } else if (aid === 1402432199) {
                if (!seenBundles.has('VioletValk')) {
                    seenBundles.add('VioletValk');
                    itemsMap.set('bundle_vvalk', { id: aid, name: 'Violet Valkyrie', value: 50000, category: 'Paket' });
                }
            } else if (roliItems[String(aid)]) {
                const ri = roliItems[String(aid)];
                const val = Number(ri[4]) > 0 ? Number(ri[4]) : Number(ri[2] || 0);
                itemsMap.set(`asset_${aid}`, { id: aid, name: ri[0] || a.name || `Item #${aid}`, value: val, category: 'Limited' });
            } else if (catalogPriceCache.has(aid)) {
                const cp = catalogPriceCache.get(aid);
                if (cp.price > 0) {
                    itemsMap.set(`asset_${aid}`, { id: aid, name: cp.name || a.name, value: cp.price, category: cp.isLimited ? 'UGC Limited' : 'Aksesuar' });
                }
            }
        }

        let limitedRap = 0;
        for (const col of collectibles) {
            const aid = Number(col.assetId);
            const uaid = col.userAssetId || aid;
            if (aid) allIds.add(aid);
            const rap = Number(col.recentAveragePrice || 0);
            limitedRap += rap;
            let val = rap;
            if (roliItems[String(aid)]) {
                const ri = roliItems[String(aid)];
                val = Number(ri[4]) > 0 ? Number(ri[4]) : Math.max(Number(ri[2] || 0), rap);
            }
            itemsMap.delete(`asset_${aid}`);
            itemsMap.set(`uasset_${uaid}`, { id: aid, name: col.name || `Limited #${aid}`, value: val, category: 'Limited' });
        }

        const itemList = [...itemsMap.values()].sort((a, b) => b.value - a.value);
        const totalValue = itemList.reduce((acc, x) => acc + (x.value || 0), 0);

        const matchedBadges = [];
        if ([...wornIds].some((x) => KORBLOX_ASSETS.has(x))) matchedBadges.push('Korblox');
        if ([...wornIds].some((x) => HEADLESS_ASSETS.has(x))) matchedBadges.push('Headless');
        if ([...allIds].some((x) => VALKYRIE_ASSETS.has(x)) || itemList.some((x) => /valkyrie/i.test(x.name))) matchedBadges.push('Valkyrie');
        if ([...allIds].some((x) => DOMINUS_ASSETS.has(x)) || itemList.some((x) => /dominus/i.test(x.name))) matchedBadges.push('Dominus');
        if ([...allIds].some((x) => SSHF_STITCH_ASSETS.has(x)) || itemList.some((x) => /super super happy|stitchface|playful vampire/i.test(x.name))) matchedBadges.push('SSHF / Stitchface');
        if (collectibles.length > 0) matchedBadges.push(`${collectibles.length} Limited`);

        const pres = presenceMap.get(uid);
        const ptype = pres?.userPresenceType || 0;
        const statusLabel = ptype === 2
            ? (pres.lastLocation ? `Oyunda: ${pres.lastLocation}` : 'Şu An Oyunda')
            : (ptype === 1 ? 'Çevrimiçi' : 'Çevrimdışı');

        finalResults.push({
            userId: uid,
            username,
            displayName,
            createdYear,
            isBanned: Boolean(uInfo?.isBanned),
            avatarUrl: thumbMap.get(uid) || '',
            profileUrl: `https://www.roblox.com/users/${uid}/profile`,
            rolimonsUrl: `https://www.rolimons.com/player/${uid}`,
            totalValue,
            limitedRap,
            inventoryPublic: invPublic,
            presenceType: ptype,
            statusLabel,
            matchedBadges,
            topItems: itemList.slice(0, 5),
            // Linked Discord Identity
            discordId: entry.discordId || '',
            discordUsername: entry.discordUsername || '',
            discordDisplayName: entry.discordDisplayName || '',
            discordAvatarUrl: entry.discordAvatarUrl || '',
            discordProfileUrl: entry.discordId ? `https://discord.com/users/${entry.discordId}` : '',
            linkSource: entry.linkSource || 'Bağlı Hesap',
            verifiedLink: Boolean(entry.verified)
        });
    }

    finalResults.sort((a, b) => {
        if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
        return (b.verifiedLink ? 1 : 0) - (a.verifiedLink ? 1 : 0);
    });

    return finalResults;
}

async function runGuildRobloxScanner({
    token,
    guildId,
    scanLimit = 300,
    minValue = 0,
    includeNicknames = true,
    onProgress = async () => {}
}) {
    const cleanGuildId = String(guildId || '').replace(/[^\d]/g, '').trim();
    if (!cleanGuildId) {
        return { success: false, error: 'Geçerli bir Discord Sunucu ID girin.' };
    }

    const selfClient = new Client({ checkUpdate: false });
    try {
        await onProgress('Discord hesabına bağlanılıyor...', 6);
        await selfClient.login(token);
    } catch (err) {
        try { selfClient.destroy(); } catch (_) {}
        return { success: false, error: `Discord tokeni ile giriş yapılamadı: ${err.message || 'Geçersiz token'}` };
    }

    try {
        await onProgress('Hedef Discord sunucusu aranıyor...', 12);
        let guild = selfClient.guilds.cache.get(cleanGuildId);
        if (!guild && selfClient.guilds.cache.size === 0) {
            await new Promise((r) => setTimeout(r, 1400));
            guild = selfClient.guilds.cache.get(cleanGuildId);
        }
        if (!guild) {
            guild = await Promise.race([
                selfClient.guilds.fetch(cleanGuildId).catch(() => null),
                new Promise((resolve) => setTimeout(() => resolve(null), 4000))
            ]);
        }

        if (!guild) {
            return {
                success: false,
                error: `Sunucu bulunamadı (${cleanGuildId}). Tokenin bu sunucuda üye olduğundan ve ID'nin doğru olduğundan emin olun.`
            };
        }

        await onProgress(`${guild.name} sunucusundaki üyeler çekiliyor...`, 20);

        const memberMap = new Map();
        try {
            const fetched = await Promise.race([
                guild.members.fetchByMemberSafety(22000).catch(() => null),
                new Promise((resolve) => setTimeout(() => resolve(null), 22000))
            ]);
            if (fetched && fetched.size > 0) {
                fetched.forEach((m) => { if (!m.user?.bot) memberMap.set(m.id, m); });
            }
        } catch (_) {}

        guild.members.cache.forEach((m) => { if (!m.user?.bot) memberMap.set(m.id, m); });
        guild.channels.cache.filter((c) => c.isVoice && c.isVoice()).forEach((vc) => {
            vc.members?.forEach((m) => { if (!m.user?.bot) memberMap.set(m.id, m); });
        });

        const allMembers = [...memberMap.values()];
        // Sort so members actively playing Roblox, having Bloxlink nicknames, or online come first
        allMembers.sort((a, b) => {
            const aPlayingRbx = a.presence?.activities?.some((ac) => /roblox/i.test(ac.name || '')) ? 1 : 0;
            const bPlayingRbx = b.presence?.activities?.some((ac) => /roblox/i.test(ac.name || '')) ? 1 : 0;
            if (aPlayingRbx !== bPlayingRbx) return bPlayingRbx - aPlayingRbx;

            const aNickParen = /\(@?[a-zA-Z0-9_]{3,20}\)\s*$/.test(a.nickname || '') ? 1 : 0;
            const bNickParen = /\(@?[a-zA-Z0-9_]{3,20}\)\s*$/.test(b.nickname || '') ? 1 : 0;
            if (aNickParen !== bNickParen) return bNickParen - aNickParen;

            const aOnline = a.presence?.status && a.presence.status !== 'offline' ? 1 : 0;
            const bOnline = b.presence?.status && b.presence.status !== 'offline' ? 1 : 0;
            return bOnline - aOnline;
        });

        const limitNum = Number(scanLimit) > 0 ? Math.min(allMembers.length, Number(scanLimit)) : allMembers.length;
        const targetMembers = allMembers.slice(0, limitNum);

        await onProgress(`${targetMembers.length} üyenin Discord profil bağlantıları taranıyor...`, 28);

        const linkedEntries = [];
        const seenPairKey = new Set();
        const BATCH_SIZE = 6;

        for (let i = 0; i < targetMembers.length; i += BATCH_SIZE) {
            const slice = targetMembers.slice(i, i + BATCH_SIZE);
            const doneCount = Math.min(i + BATCH_SIZE, targetMembers.length);
            const pct = 28 + Math.round((doneCount / Math.max(1, targetMembers.length)) * 45);

            await onProgress(
                `Profiller taranıyor: ${doneCount}/${targetMembers.length} • Bağlı Roblox bulunan: ${linkedEntries.length}`,
                pct
            );

            await Promise.all(slice.map(async (member) => {
                const profileData = await fetchDiscordProfileSafe(selfClient, member.id);
                const rbxLink = extractRobloxFromDiscordProfile(member, profileData, includeNicknames);
                if (!rbxLink) return;

                const dedupeKey = `${member.id}:${rbxLink.robloxId || rbxLink.robloxUsername.toLowerCase()}`;
                if (seenPairKey.has(dedupeKey)) return;
                seenPairKey.add(dedupeKey);

                let dcAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
                try {
                    dcAvatar = member.user.displayAvatarURL
                        ? member.user.displayAvatarURL({ dynamic: true, size: 128 })
                        : (member.user.avatar
                            ? `https://cdn.discordapp.com/avatars/${member.id}/${member.user.avatar}.png?size=128`
                            : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(member.id) >> 22n) % 6}.png`);
                } catch (_) {}

                linkedEntries.push({
                    discordId: member.id,
                    discordUsername: member.user.username,
                    discordDisplayName: member.displayName || member.user.globalName || member.user.username,
                    discordAvatarUrl: dcAvatar,
                    robloxId: rbxLink.robloxId,
                    robloxUsername: rbxLink.robloxUsername,
                    verified: rbxLink.verified,
                    linkSource: rbxLink.linkSource
                });
            }));

            await new Promise((r) => setTimeout(r, 210));
        }

        let guildIcon = null;
        try { guildIcon = guild.iconURL ? guild.iconURL({ dynamic: true, size: 128 }) : null; } catch (_) {}

        if (linkedEntries.length === 0) {
            return {
                success: true,
                guildId: guild.id,
                guildName: guild.name,
                guildIcon,
                scannedMembers: targetMembers.length,
                totalGuildMembers: allMembers.length,
                linkedCount: 0,
                accounts: []
            };
        }

        const enriched = await enrichRobloxAccountsBatch(linkedEntries, onProgress);
        const minValNum = Number(minValue || 0);
        const filtered = minValNum > 0 ? enriched.filter((a) => a.totalValue >= minValNum) : enriched;

        await onProgress(`Tamamlandı! ${filtered.length} bağlı Roblox & Discord hesabı listelendi.`, 100);

        return {
            success: true,
            guildId: guild.id,
            guildName: guild.name,
            guildIcon,
            scannedMembers: targetMembers.length,
            totalGuildMembers: allMembers.length,
            linkedCount: enriched.length,
            accounts: filtered
        };
    } finally {
        try { selfClient.destroy(); } catch (_) {}
    }
}

async function lookupRobloxUsersDirect(usernamesRaw) {
    const tokens = String(usernamesRaw || '')
        .split(/[\s,;]+/)
        .map((s) => s.trim().replace(/^@/, ''))
        .filter(Boolean)
        .slice(0, 60);

    const fakeEntries = tokens.map((tok) => ({
        discordId: '',
        discordUsername: '',
        discordDisplayName: '',
        discordAvatarUrl: '',
        robloxId: /^\d+$/.test(tok) ? Number(tok) : null,
        robloxUsername: /^\d+$/.test(tok) ? '' : tok,
        verified: false,
        linkSource: 'Doğrudan Sorgu'
    }));

    const accounts = await enrichRobloxAccountsBatch(fakeEntries, null);
    return { ok: true, matched: accounts };
}

module.exports = {
    runGuildRobloxScanner,
    lookupRobloxUsersDirect
};

const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

// 🎯 HEDEF NADİR VE DEĞERLİ ROZETLER
const NADIR_HEDEF_ROZETLER = [
    {
        id: 'discord_staff',
        name: 'Discord Staff',
        flag: 'DISCORD_EMPLOYEE',
        emoji: '<:DiscordStaff:1563576035646374000>',
        order: 1
    },
    {
        id: 'golden_bug_hunter',
        name: 'Bug Hunter Seviye 2 (Altın)',
        flag: 'BUGHUNTER_LEVEL_2',
        emoji: '<:GoldenBugHunter:1563576037433020566>',
        order: 2
    },
    {
        id: 'moderator_alumni',
        name: 'Discord Certified Moderator',
        flag: 'DISCORD_CERTIFIED_MODERATOR',
        emoji: '<:ModeratorProgramsAlumni:1563576038804426832>',
        order: 3
    },
    {
        id: 'hypesquad_events',
        name: 'HypeSquad Events',
        flag: 'HYPESQUAD_EVENTS',
        emoji: '<:HypeSquadEvents:1563576041027403798>',
        order: 4
    },
    {
        id: 'early_bot_developer',
        name: 'Early Verified Bot Developer',
        flag: 'EARLY_VERIFIED_BOT_DEVELOPER',
        emoji: '<:EarlyVerifiedBotDeveloper:1563576043971944479>',
        order: 5
    },
    {
        id: 'early_supporter',
        name: 'Early Supporter',
        flag: 'EARLY_SUPPORTER',
        emoji: '<:EarlySupporter:1563576045779558422>',
        order: 6
    },
    {
        id: 'bug_hunter',
        name: 'Bug Hunter Seviye 1 (Yeşil)',
        flag: 'BUGHUNTER_LEVEL_1',
        emoji: '<:BugHunter:1563576048011182233>',
        order: 7
    },
    {
        id: 'partnered_server_owner',
        name: 'Partnered Server Owner',
        flag: 'PARTNERED_SERVER_OWNER',
        emoji: '<:PartneredServerOwner:1563576049751826483>',
        order: 8
    }
];

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

function boosterAyaGoreRozet(diffMonths) {
    if (diffMonths >= 24) return { id: 'guild_booster_lvl9', name: 'Booster (24+ Ay)', emoji: '<:Booster24m:1563576073323548753>', order: 30 };
    if (diffMonths >= 18) return { id: 'guild_booster_lvl8', name: 'Booster (18 Ay)', emoji: '<:Booster18m:1563576074627973242>', order: 30 };
    if (diffMonths >= 15) return { id: 'guild_booster_lvl7', name: 'Booster (15 Ay)', emoji: '<:Booster15m:1563576077065003054>', order: 30 };
    if (diffMonths >= 12) return { id: 'guild_booster_lvl6', name: 'Booster (12 Ay)', emoji: '<:Booster12m:1563576078751105056>', order: 30 };
    if (diffMonths >= 9) return { id: 'guild_booster_lvl5', name: 'Booster (9 Ay)', emoji: '<:Booster9m:1563576080596729917>', order: 30 };
    if (diffMonths >= 6) return { id: 'guild_booster_lvl4', name: 'Booster (6 Ay)', emoji: '<:Booster6m:1563576082324787270>', order: 30 };
    if (diffMonths >= 3) return { id: 'guild_booster_lvl3', name: 'Booster (3 Ay)', emoji: '<:Booster3m:1563576084078002230>', order: 30 };
    if (diffMonths >= 2) return { id: 'guild_booster_lvl2', name: 'Booster (2 Ay)', emoji: '<:Booster2m:1563576085931892836>', order: 30 };
    return { id: 'guild_booster_lvl1', name: 'Booster (1 Ay)', emoji: '<:Booster1m:1563576087802548288>', order: 30 };
}

function parseBadgeItem(badge, profileData) {
    if (!badge) return null;
    const id = (badge.id || '').toLowerCase();
    const desc = (badge.description || '').toLowerCase();

    // 1. Nadir Rozetler (En Ön Sıra: 1-8)
    if (id.includes('staff')) return { id: 'staff', name: 'Discord Staff', emoji: '<:DiscordStaff:1563576035646374000>', order: 1 };
    if (id.includes('bug_hunter_level_2')) return { id: 'bug_hunter_level_2', name: 'Bug Hunter Seviye 2 (Altın)', emoji: '<:GoldenBugHunter:1563576037433020566>', order: 2 };
    if (id.includes('moderator') || id.includes('alumni') || id.includes('certified_moderator')) return { id: 'moderator', name: 'Discord Certified Moderator', emoji: '<:ModeratorProgramsAlumni:1563576038804426832>', order: 3 };
    if (id === 'hypesquad' || id.includes('hypesquad_events')) return { id: 'hypesquad', name: 'HypeSquad Events', emoji: '<:HypeSquadEvents:1563576041027403798>', order: 4 };
    if (id.includes('verified_developer') || id.includes('early_verified_bot_developer') || id.includes('early_bot_developer')) return { id: 'developer', name: 'Early Verified Bot Developer', emoji: '<:EarlyVerifiedBotDeveloper:1563576043971944479>', order: 5 };
    if (id.includes('early_supporter')) return { id: 'early_supporter', name: 'Early Supporter', emoji: '<:EarlySupporter:1563576045779558422>', order: 6 };
    if (id.includes('bug_hunter_level_1') || (id.includes('bug_hunter') && !id.includes('level_2'))) return { id: 'bug_hunter_level_1', name: 'Bug Hunter Seviye 1 (Yeşil)', emoji: '<:BugHunter:1563576048011182233>', order: 7 };
    if (id.includes('partner')) return { id: 'partner', name: 'Partnered Server Owner', emoji: '<:PartneredServerOwner:1563576049751826483>', order: 8 };

    // 2. Nitro ve Nitro Tenure Rozetleri
    if (id.includes('tenure') || id.includes('month') || id === 'premium' || id.includes('nitro') || id.includes('ruby') || id.includes('opal') || id.includes('emerald') || id.includes('diamond') || id.includes('platinum')) {
        if (id.includes('72') || desc.includes('opal') || id.includes('opal')) return { id: 'opal', name: 'Nitro Opal (6y+)', emoji: '<:Opal:1563576051664429096>', order: 20 };
        if (id.includes('60') || id.includes('ruby') || desc.includes('yakut') || desc.includes('ruby')) return { id: 'ruby', name: 'Nitro Ruby (5y)', emoji: '<:rubyyakut:1563576053207797791>', order: 20 };
        if (id.includes('36') || id.includes('emerald') || desc.includes('zümrüt') || desc.includes('emerald')) return { id: 'emerald', name: 'Nitro Emerald (3y)', emoji: '<:Emeraldzmrt:1563576054671745185>', order: 20 };
        if (id.includes('24') || id.includes('diamond') || desc.includes('elmas') || desc.includes('diamond')) return { id: 'diamond', name: 'Nitro Diamond (2y)', emoji: '<:Diamondelmas:1563576061730488421>', order: 20 };
        if (id.includes('12') || id.includes('platinum') || desc.includes('platin') || desc.includes('platinum')) return { id: 'platinum', name: 'Nitro Platinum (1y)', emoji: '<:Platinumplat:1563576064259653753>', order: 20 };
        if (id.includes('6_month') || desc.includes('altın') || desc.includes('gold')) return { id: 'nitro_gold', name: 'Nitro Gold (6m)', emoji: '<:NitroGold:1563576065564221460>', order: 20 };
        if (id.includes('3_month') || desc.includes('gümüş') || desc.includes('silver')) return { id: 'nitro_silver', name: 'Nitro Silver (3m)', emoji: '<:NitroSilver:1563576066554069065>', order: 20 };
        if (id.includes('1_month') || desc.includes('bronz') || desc.includes('bronze')) return { id: 'nitro_bronze', name: 'Nitro Bronze (1m)', emoji: '<:NitroBronze:1563576069284692060>', order: 20 };

        if (id.includes('basic') || profileData?.premium_type === 1 || profileData?.premium_type === 3) {
            return { id: 'nitro_basic', name: 'Nitro Basic', emoji: '<:NitroBasic:1563576071805210684>', order: 20 };
        }

        if (profileData?.premium_since) {
            const months = (Date.now() - new Date(profileData.premium_since).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
            if (months >= 72) return { id: 'opal', name: 'Nitro Opal (6y+)', emoji: '<:Opal:1563576051664429096>', order: 20 };
            if (months >= 60) return { id: 'ruby', name: 'Nitro Ruby (5y)', emoji: '<:rubyyakut:1563576053207797791>', order: 20 };
            if (months >= 36) return { id: 'emerald', name: 'Nitro Emerald (3y)', emoji: '<:Emeraldzmrt:1563576054671745185>', order: 20 };
            if (months >= 24) return { id: 'diamond', name: 'Nitro Diamond (2y)', emoji: '<:Diamondelmas:1563576061730488421>', order: 20 };
            if (months >= 12) return { id: 'platinum', name: 'Nitro Platinum (1y)', emoji: '<:Platinumplat:1563576064259653753>', order: 20 };
            if (months >= 6) return { id: 'nitro_gold', name: 'Nitro Gold (6m)', emoji: '<:NitroGold:1563576065564221460>', order: 20 };
            if (months >= 3) return { id: 'nitro_silver', name: 'Nitro Silver (3m)', emoji: '<:NitroSilver:1563576066554069065>', order: 20 };
            if (months >= 1) return { id: 'nitro_bronze', name: 'Nitro Bronze (1m)', emoji: '<:NitroBronze:1563576069284692060>', order: 20 };
        }

        return { id: 'nitro', name: 'Nitro', emoji: '<:NitroGold:1563576065564221460>', order: 20 };
    }

    // 3. Sunucu Takviyesi (Booster)
    if (id.includes('guild_booster')) {
        if (id.includes('lvl9') || desc.includes('24 ay') || desc.includes('2 yıl')) return { id: 'guild_booster_lvl9', name: 'Booster (24+ Ay)', emoji: '<:Booster24m:1563576073323548753>', order: 30 };
        if (id.includes('lvl8') || desc.includes('18 ay')) return { id: 'guild_booster_lvl8', name: 'Booster (18 Ay)', emoji: '<:Booster18m:1563576074627973242>', order: 30 };
        if (id.includes('lvl7') || desc.includes('15 ay')) return { id: 'guild_booster_lvl7', name: 'Booster (15 Ay)', emoji: '<:Booster15m:1563576077065003054>', order: 30 };
        if (id.includes('lvl6') || desc.includes('12 ay') || desc.includes('1 yıl')) return { id: 'guild_booster_lvl6', name: 'Booster (12 Ay)', emoji: '<:Booster12m:1563576078751105056>', order: 30 };
        if (id.includes('lvl5') || desc.includes('9 ay')) return { id: 'guild_booster_lvl5', name: 'Booster (9 Ay)', emoji: '<:Booster9m:1563576080596729917>', order: 30 };
        if (id.includes('lvl4') || desc.includes('6 ay')) return { id: 'guild_booster_lvl4', name: 'Booster (6 Ay)', emoji: '<:Booster6m:1563576082324787270>', order: 30 };
        if (id.includes('lvl3') || desc.includes('3 ay')) return { id: 'guild_booster_lvl3', name: 'Booster (3 Ay)', emoji: '<:Booster3m:1563576084078002230>', order: 30 };
        if (id.includes('lvl2') || desc.includes('2 ay')) return { id: 'guild_booster_lvl2', name: 'Booster (2 Ay)', emoji: '<:Booster2m:1563576085931892836>', order: 30 };
        return { id: 'guild_booster_lvl1', name: 'Booster (1 Ay)', emoji: '<:Booster1m:1563576087802548288>', order: 30 };
    }

    // 4. Görevler & Aktif Geliştirici & Komutlar
    if (id.includes('quest')) return { id: 'quest_completed', name: 'Quest Completed', iconHash: badge.icon || null, emoji: '<:QuestCompleted:1563576090100764672>', order: 40 };
    if (id.includes('active_developer')) return { id: 'active_developer', name: 'Active Developer', iconHash: badge.icon || null, emoji: '⚙️', order: 41 };
    if (id.includes('bot_commands')) return { id: 'bot_commands', name: 'Supports Commands', iconHash: badge.icon || null, emoji: '⚡', order: 42 };
    if (id.includes('automod')) return { id: 'automod', name: 'Uses AutoMod', iconHash: badge.icon || null, emoji: '🛡️', order: 43 };
    if (id.includes('gifting')) return { id: 'gifting', name: 'Discord Gifting', iconHash: badge.icon || null, emoji: '🎁', order: 44 };

    // 5. HypeSquad Evleri
    if (id.includes('house_1') || id.includes('bravery') || desc.includes('cesaret')) return { id: 'hypesquad_bravery', name: 'HypeSquad Bravery', iconHash: badge.icon || null, emoji: '<:HypeBravery:1559275944823361586>', order: 50 };
    if (id.includes('house_2') || id.includes('brilliance') || desc.includes('güzellik') || desc.includes('parlaklık')) return { id: 'hypesquad_brilliance', name: 'HypeSquad Brilliance', iconHash: badge.icon || null, emoji: '<:HypeBrilliance:1559275947495268593>', order: 50 };
    if (id.includes('house_3') || id.includes('balance') || desc.includes('denge')) return { id: 'hypesquad_balance', name: 'HypeSquad Balance', iconHash: badge.icon || null, emoji: '<:HypeBalance:1559272045785776198>', order: 50 };

    // 6. Eski Kullanıcı Adı
    if (id.includes('legacy') || desc.includes('önceden')) return { id: 'legacy_username', name: 'Legacy Name', iconHash: badge.icon || null, emoji: '<:LegacyName:1559275948942033046>', order: 60 };

    // 7. Eğlence / Özel Etkinlik
    if (id.includes('april_fools') || desc.includes('seviyesine') || desc.includes('clown')) return { id: 'april_fools', name: 'April Fools Leaf', iconHash: badge.icon || null, emoji: '<:AprilFoolsLeaf:1559272047203590294>', order: 70 };
    if (id.includes('orb')) return { id: 'orb_badge', name: 'Orb Badge', iconHash: badge.icon || null, emoji: '<:OrbBadge:1559272048608542770>', order: 71 };

    // 8. Discord tarafından yeni eklenen diğer resmi rozetler (doğrudan CDN icon hash'i ile)
    if (badge.icon) {
        return {
            id: id || 'custom_badge',
            name: badge.description || badge.id || 'Discord Badge',
            iconHash: badge.icon,
            emoji: '🏅',
            order: 80
        };
    }

    return null;
}

async function guvenliProfilCek(client, userId, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (client?.api) {
                const getPromise = client.api.users(userId).profile.get({
                    query: { with_mutual_guilds: false }
                });
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3500));
                return await Promise.race([getPromise, timeoutPromise]);
            }
            const res = await axios.get(`https://discord.com/api/v9/users/${userId}/profile?with_mutual_guilds=false`, {
                headers: { Authorization: client.token },
                timeout: 3500
            });
            return res.data;
        } catch (err) {
            const status = err.httpStatus || err.response?.status;
            if (status === 429) {
                const retryAfter = Number(err.response?.data?.retry_after || 
                                          err.response?.headers?.['retry-after'] || 
                                          err.data?.retry_after ||
                                          1.5);
                const waitMs = Math.min(Math.ceil(retryAfter * 1000) + 200, 3000);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }
            if (attempt === maxRetries) return null;
            await new Promise(r => setTimeout(r, 100));
        }
    }
    return null;
}

// Rozet Filtre Kontrol Fonksiyonu
function badgeMatchesFilter(badgeObj, filterKey) {
    if (!badgeObj || !filterKey || filterKey === 'all') return true;
    const key = filterKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bId = (badgeObj.id || '').toLowerCase();
    const bName = (badgeObj.name || '').toLowerCase();

    if (key === 'staff') {
        return bId.includes('staff') || bName.includes('staff');
    }
    if (key === 'ruby' || key === 'yakut') {
        return bId.includes('ruby') || bName.includes('ruby') || bName.includes('yakut');
    }
    if (key === 'opal') {
        return bId.includes('opal') || bName.includes('opal');
    }
    if (key === 'zumrut' || key === 'emerald' || key === 'zmrüt') {
        return bId.includes('emerald') || bName.includes('emerald') || bName.includes('zümrüt') || bName.includes('zumrut');
    }
    if (key === 'diamond' || key === 'elmas') {
        return bId.includes('diamond') || bName.includes('diamond') || bName.includes('elmas');
    }
    if (key === 'platinum' || key === 'platin') {
        return bId.includes('platinum') || bName.includes('platinum') || bName.includes('platin');
    }
    if (key === '24ay' || key === '24m' || key === 'booster24') {
        return (bId.includes('guild_booster') && (bId.includes('lvl9') || bName.includes('24'))) || bName.includes('24+ ay') || bName.includes('24 ay');
    }
    if (key === 'booster' || key === 'takviye') {
        return bId.includes('guild_booster') || bName.includes('booster');
    }
    if (key === 'hypesquad' || key === 'hype') {
        return bId.includes('hypesquad') || bName.includes('hypesquad') || bName.includes('hype');
    }
    if (key === 'bughunter' || key === 'bug') {
        return bId.includes('bug_hunter') || bName.includes('bug hunter');
    }
    if (key === 'dev' || key === 'developer' || key === 'botdev') {
        return bId.includes('developer') || bName.includes('developer');
    }
    if (key === 'early' || key === 'supporter') {
        return bId.includes('early_supporter') || bName.includes('early supporter');
    }
    if (key === 'partner') {
        return bId.includes('partner') || bName.includes('partner');
    }
    if (key === 'moderator' || key === 'mod') {
        return bId.includes('moderator') || bName.includes('moderator');
    }
    if (key === 'nitro') {
        return bId.includes('nitro') || bName.includes('nitro') || bId.includes('tenure') || bId.includes('premium');
    }
    if (key === 'quest' || key === 'play') {
        return bId.includes('quest') || bName.includes('quest') || bId.includes('play') || bName.includes('play');
    }
    return bId.includes(key) || bName.includes(key);
}

/**
 * Sunucu tarama motoru
 * @param {Object} params
 * @param {string} params.token - Kullanıcının Discord hesap tokeni
 * @param {string} params.guildId - Taranacak sunucu ID'si
 * @param {string} [params.filterBadge='all'] - Belirli bir rozet filtresi (opsiyonel)
 * @param {Function} params.onProgress - Durum güncelleme callback fonksiyonu
 */
async function runScanner({ token, guildId, filterBadge = 'all', onProgress = () => {} }) {
    const temizId = guildId.replace(/[^\d]/g, '').trim();
    if (!temizId) {
        return { success: false, error: 'Geçersiz Sunucu ID\'si girdiniz.' };
    }

    const selfClient = new Client({ checkUpdate: false });

    try {
        await onProgress('Hesaba bağlanılıyor...', 5);
        await selfClient.login(token);
    } catch (err) {
        try { selfClient.destroy(); } catch (_) {}
        return { success: false, error: `Hesaba giriş yapılamadı: ${err.message || 'Token geçersiz'}` };
    }

    try {
        await onProgress('Sunucu aranıyor...', 15);

        // Gateway önbelleği hazır olana kadar kısa bekleme (özellikle 2. taramalarda)
        let guild = selfClient.guilds.cache.get(temizId);
        if (!guild && selfClient.guilds.cache.size === 0) {
            await new Promise(r => setTimeout(r, 1500));
            guild = selfClient.guilds.cache.get(temizId);
        }

        // Önbellekte yoksa API'den çekmeyi dene (maksimum 4 saniye zaman aşımı ile)
        if (!guild) {
            try {
                guild = await Promise.race([
                    selfClient.guilds.fetch(temizId).catch(() => null),
                    new Promise(resolve => setTimeout(() => resolve(null), 4000))
                ]);
            } catch (_) {
                guild = null;
            }
        }

        if (!guild) {
            return {
                success: false,
                error: `Sunucu bulunamadı (${temizId}). Girdiğiniz ID'nin bir Kategori veya Kanal ID değil, geçerli bir Sunucu ID'si olduğundan ve hesabınızın bu sunucuda bulunduğundan emin olun.`
            };
        }

        await onProgress(`**${guild.name}** sunucusuna bağlandı. Üyeler toplanıyor...`, 25);

        const toplananUyeler = new Map();

        // 1. Üyeleri güvenli yöntemle çek (maksimum 25 saniye zaman aşımı)
        try {
            const fetched = await Promise.race([
                guild.members.fetchByMemberSafety(25000).catch(() => null),
                new Promise(resolve => setTimeout(() => resolve(null), 25000))
            ]);
            if (fetched && fetched.size > 0) {
                fetched.forEach(m => toplananUyeler.set(m.id, m));
            }
        } catch (_) {}

        // 2. Önbellekteki ve ses kanallarındaki üyeleri ekle
        guild.members.cache.forEach(m => toplananUyeler.set(m.id, m));
        guild.channels.cache.filter(c => c.isVoice && c.isVoice()).forEach(k => {
            k.members?.forEach(m => toplananUyeler.set(m.id, m));
        });

        const toplamUyeSayisi = toplananUyeler.size;
        let incelenecekAdaylar = [];

        // Belirli bir rozet filtresi varsa ya da genel tarama ise
        const isAll = !filterBadge || filterBadge === 'all';

        if (isAll) {
            // Genel tarama: Sadece 8 nadir hedef rozete sahip olanlar
            for (const member of toplananUyeler.values()) {
                const rozetler = kullaniciHedefRozetleri(member);
                if (rozetler.length > 0) {
                    incelenecekAdaylar.push({
                        member,
                        rozetler,
                        user: member.user
                    });
                }
            }
        } else {
            // Belirli rozet filtresi (.ruby, .24ay, .staff, .opal, .zumrut, .hypesquad vs.)
            const filterClean = filterBadge.toLowerCase().replace(/[^a-z0-9]/g, '');
            const isTenureOrNitroOrQuest = ['ruby', 'opal', 'zumrut', 'emerald', 'diamond', 'platinum', 'nitro', 'quest', 'play'].includes(filterClean);
            const isBoosterFilter = ['24ay', '24m', 'booster', 'takviye'].includes(filterClean);

            // Sunucuda 500 veya daha az üye varsa, tüm rozet filtrelerinde üyelerin tamamını eksiksiz incelemeye al!
            if (toplamUyeSayisi <= 500) {
                for (const member of toplananUyeler.values()) {
                    incelenecekAdaylar.push({
                        member,
                        rozetler: kullaniciHedefRozetleri(member),
                        user: member.user
                    });
                }
            } else {
                // 500'den büyük sunucularda filtreye uygun adayları topla
                for (const member of toplananUyeler.values()) {
                    const rozetler = kullaniciHedefRozetleri(member);
                    const flags = member.user.flags?.toArray() || [];
                    const flagStr = flags.join(' ').toLowerCase();

                    let potansiyelAday = false;
                    if (filterClean === 'staff' && (flagStr.includes('employee') || flagStr.includes('staff'))) potansiyelAday = true;
                    else if ((filterClean === 'bughunter' || filterClean === 'bug') && flagStr.includes('bughunter')) potansiyelAday = true;
                    else if ((filterClean === 'dev' || filterClean === 'developer') && flagStr.includes('developer')) potansiyelAday = true;
                    else if ((filterClean === 'early' || filterClean === 'supporter') && flagStr.includes('early_supporter')) potansiyelAday = true;
                    else if (filterClean === 'partner' && flagStr.includes('partner')) potansiyelAday = true;
                    else if ((filterClean === 'moderator' || filterClean === 'mod') && flagStr.includes('moderator')) potansiyelAday = true;
                    else if (filterClean === 'hypesquad' || filterClean === 'hype') {
                        if (flagStr.includes('hypesquad') || flagStr.includes('house')) potansiyelAday = true;
                    }
                    else if (isBoosterFilter) {
                        if (member.premiumSince || rozetler.length > 0) potansiyelAday = true;
                    }
                    else if (isTenureOrNitroOrQuest) {
                        if (member.premiumSince || flags.length > 0 || rozetler.length > 0 || member.user.avatarDecoration || member.user.banner) potansiyelAday = true;
                    }

                    if (potansiyelAday || rozetler.length > 0) {
                        incelenecekAdaylar.push({
                            member,
                            rozetler,
                            user: member.user
                        });
                    }
                }

                // Booster olanları her halükarda ekle
                for (const member of toplananUyeler.values()) {
                    if (member.premiumSince && !incelenecekAdaylar.some(a => a.user.id === member.id)) {
                        incelenecekAdaylar.push({
                            member,
                            rozetler: kullaniciHedefRozetleri(member),
                            user: member.user
                        });
                    }
                }
            }
        }

        if (incelenecekAdaylar.length === 0) {
            let guildIconUrl = null;
            try { guildIconUrl = guild.iconURL ? guild.iconURL({ dynamic: true, size: 128 }) : null; } catch (_) {}
            return {
                success: true,
                guildId: guild.id,
                guildName: guild.name,
                guildIcon: guildIconUrl,
                totalScanned: toplamUyeSayisi,
                foundCount: 0,
                results: [],
                users: []
            };
        }

        await onProgress(`${toplamUyeSayisi} üye arasında **${incelenecekAdaylar.length}** potansiyel hesap analiz ediliyor...`, 40);

        const bulunanSonuclar = [];

        // Profilleri hızlı ve takılmadan inceleme (Paralel İşleme & Rate Limit Koruması)
        const ESZAMANLI_LIMIT = 5;
        for (let i = 0; i < incelenecekAdaylar.length; i += ESZAMANLI_LIMIT) {
            const parca = incelenecekAdaylar.slice(i, i + ESZAMANLI_LIMIT);
            const yuzde = 40 + Math.round((Math.min(i + ESZAMANLI_LIMIT, incelenecekAdaylar.length) / incelenecekAdaylar.length) * 55);

            await onProgress(`Profiller inceleniyor: **${Math.min(i + ESZAMANLI_LIMIT, incelenecekAdaylar.length)}/${incelenecekAdaylar.length}** (@${parca[0].user.username})...`, yuzde);

            await Promise.all(parca.map(async (item) => {
                const rozetListesi = [];
                let profileData = null;
                try {
                    profileData = await guvenliProfilCek(selfClient, item.user.id);
                } catch (_) {}

                // Profil API rozetleri
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

                // HypeSquad Evleri & Active Developer bayraklardan ekleme (profil API badges içinde gelmemişse)
                const userFlags = item.user.flags?.toArray() || [];
                if (userFlags.includes('HOUSE_BRAVERY') && !rozetListesi.some(x => x.id === 'hypesquad_bravery' || x.emoji.includes('HypeBravery'))) {
                    rozetListesi.push({ id: 'hypesquad_bravery', name: 'HypeSquad Bravery', emoji: '<:HypeBravery:1559275944823361586>', order: 50 });
                }
                if (userFlags.includes('HOUSE_BRILLIANCE') && !rozetListesi.some(x => x.id === 'hypesquad_brilliance' || x.emoji.includes('HypeBrilliance'))) {
                    rozetListesi.push({ id: 'hypesquad_brilliance', name: 'HypeSquad Brilliance', emoji: '<:HypeBrilliance:1559275947495268593>', order: 50 });
                }
                if (userFlags.includes('HOUSE_BALANCE') && !rozetListesi.some(x => x.id === 'hypesquad_balance' || x.emoji.includes('HypeBalance'))) {
                    rozetListesi.push({ id: 'hypesquad_balance', name: 'HypeSquad Balance', emoji: '<:HypeBalance:1559272045785776198>', order: 50 });
                }
                if (userFlags.includes('ACTIVE_DEVELOPER') && !rozetListesi.some(x => x.id === 'active_developer')) {
                    rozetListesi.push({ id: 'active_developer', name: 'Active Developer', emoji: '⚙️', order: 41 });
                }

                // Booster rozeti
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

                // Bayraklardan gelen eksik rozetler
                for (const r of item.rozetler) {
                    if (!rozetListesi.some(x => x.emoji === r.emoji || (r.id && x.id === r.id))) {
                        rozetListesi.push({
                            id: r.id || '',
                            name: r.name,
                            emoji: r.emoji,
                            order: r.order || 5
                        });
                    }
                }

                rozetListesi.sort((a, b) => (a.order || 99) - (b.order || 99));
                item.parsedRozetler = rozetListesi;

                // Filtre Kontrolü
                if (isAll) {
                    bulunanSonuclar.push(item);
                } else {
                    const hasFilteredBadge = rozetListesi.some(r => badgeMatchesFilter(r, filterBadge));
                    if (hasFilteredBadge) {
                        bulunanSonuclar.push(item);
                    }
                }
            }));

            // Her parça sonrası kısa bekleme (Rate limit koruması)
            await new Promise(r => setTimeout(r, 250));
        }

        // Satır formatlama ve Web Arayüzü için detaylı kullanıcı verisi
        const siraliSatirlar = [];
        const detayliKullanicilar = [];

        bulunanSonuclar.forEach((item, index) => {
            const rozetler = (item.parsedRozetler && item.parsedRozetler.length > 0)
                ? item.parsedRozetler
                : item.rozetler;

            const emojiGrubu = rozetler.map(r => r.emoji).join(' ');
            const satirDiscord = `\`${index + 1}.\` [**@${item.user.username}**](https://discord.com/users/${item.user.id}) ${emojiGrubu}`;
            siraliSatirlar.push(satirDiscord);

            let avatarUrl = '';
            try {
                avatarUrl = item.user.displayAvatarURL
                    ? item.user.displayAvatarURL({ dynamic: true, size: 128 })
                    : (item.user.avatar
                        ? `https://cdn.discordapp.com/avatars/${item.user.id}/${item.user.avatar}.png?size=128`
                        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(item.user.id) >> 22n) % 6}.png`);
            } catch (_) {
                avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
            }

            detayliKullanicilar.push({
                index: index + 1,
                id: item.user.id,
                username: item.user.username,
                displayName: item.member?.displayName || item.user.globalName || item.user.username,
                avatarUrl,
                profileUrl: `https://discord.com/users/${item.user.id}`,
                createdAt: item.user.createdTimestamp || null,
                badges: rozetler.map(r => ({
                    id: r.id || '',
                    name: r.name || '',
                    iconHash: r.iconHash || null,
                    emoji: r.emoji || '',
                    order: r.order || 99
                }))
            });
        });

        let guildIconUrl = null;
        try {
            guildIconUrl = guild.iconURL ? guild.iconURL({ dynamic: true, size: 128 }) : null;
        } catch (_) {}

        return {
            success: true,
            guildId: guild.id,
            guildName: guild.name,
            guildIcon: guildIconUrl,
            totalScanned: toplamUyeSayisi,
            foundCount: bulunanSonuclar.length,
            results: siraliSatirlar,
            users: detayliKullanicilar
        };
    } finally {
        try {
            selfClient.destroy();
        } catch (_) {}
    }
}

module.exports = {
    runScanner,
    NADIR_HEDEF_ROZETLER,
    badgeMatchesFilter
};

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
    REST,
    Routes,
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { runScanner } = require('./scanner');

// ANSI Renk Kodları
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

// Hata Yakalayıcılar (Botun ASLA Kapanmaması İçin)
process.on('uncaughtException', (err) => {
    if (err?.code === 10062 || err?.code === 40060 || err?.message?.includes('Unknown interaction')) return;
    console.error(`  ${RED}[Yakalanan Hata]:${RESET}`, err?.message || err);
});

process.on('unhandledRejection', (reason) => {
    if (reason?.code === 10062 || reason?.code === 40060 || reason?.message?.includes('Unknown interaction')) return;
    console.error(`  ${RED}[Yakalanan Promise Hatası]:${RESET}`, reason?.message || reason);
});

const botToken = process.env.BOT_TOKEN;

if (!botToken || botToken.trim() === '' || botToken === 'your_bot_token_here') {
    console.log(`\n  ${RED}[!] BOT_TOKEN bulunamadı!${RESET}`);
    console.log(`  ${YELLOW}Lütfen .env dosyasında BOT_TOKEN kısmına Discord Bot Tokeninizi yazın.${RESET}\n`);
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Aktif Tarama Odaları Oturum Hafızası
// Map: channelId => { userId, token, scanning: boolean, filterBadge: string }
const activeRoomSessions = new Map();

// Desteklenen Rozet Filtreleri ve Bilgileri
const ROZET_FILTRELERI = {
    'tara': { id: 'all', label: 'Tüm Hedef Rozetler', emoji: '🔍' },
    '24ay': { id: '24ay', label: '24+ Ay Booster', emoji: '<:Booster24m:1563576073323548753>' },
    'ruby': { id: 'ruby', label: 'Nitro Ruby (5y)', emoji: '<:rubyyakut:1563576053207797791>' },
    'opal': { id: 'opal', label: 'Nitro Opal (6y+)', emoji: '<:Opal:1563576051664429096>' },
    'zümrüt': { id: 'zumrut', label: 'Nitro Emerald (3y)', emoji: '<:Emeraldzmrt:1563576054671745185>' },
    'zumrut': { id: 'zumrut', label: 'Nitro Emerald (3y)', emoji: '<:Emeraldzmrt:1563576054671745185>' },
    'diamond': { id: 'diamond', label: 'Nitro Diamond (2y)', emoji: '<:Diamondelmas:1563576061730488421>' },
    'elmas': { id: 'diamond', label: 'Nitro Diamond (2y)', emoji: '<:Diamondelmas:1563576061730488421>' },
    'platinum': { id: 'platinum', label: 'Nitro Platinum (1y)', emoji: '<:Platinumplat:1563576064259653753>' },
    'platin': { id: 'platinum', label: 'Nitro Platinum (1y)', emoji: '<:Platinumplat:1563576064259653753>' },
    'play': { id: 'quest', label: 'Quest & Play Rozetleri', emoji: '<:QuestCompleted:1563576090100764672>' },
    'quest': { id: 'quest', label: 'Quest Görev Rozetleri', emoji: '<:QuestCompleted:1563576090100764672>' },
    'staff': { id: 'staff', label: 'Discord Staff', emoji: '<:DiscordStaff:1563576035646374000>' },
    'hypesquad': { id: 'hypesquad', label: 'HypeSquad Rozetleri', emoji: '<:HypeSquadEvents:1563576041027403798>' },
    'bughunter': { id: 'bughunter', label: 'Bug Hunter Rozetleri', emoji: '<:GoldenBugHunter:1563576037433020566>' },
    'early': { id: 'early', label: 'Early Supporter', emoji: '<:EarlySupporter:1563576045779558422>' },
    'dev': { id: 'dev', label: 'Early Bot Developer', emoji: '<:EarlyVerifiedBotDeveloper:1563576043971944479>' },
    'moderator': { id: 'moderator', label: 'Certified Moderator', emoji: '<:ModeratorProgramsAlumni:1563576038804426832>' },
    'booster': { id: 'booster', label: 'Tüm Sunucu Boosterlar', emoji: '<:Booster24m:1563576073323548753>' }
};

// Slash Komut Tanımları
const slashCommands = [
    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Kullanıcıların sunucu taraması başlatabilmesi için butonlu paneli gönderir.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('tara')
        .setDescription('Doğrudan sunucu tarama formunu açar.'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Kullanılabilir tarama ve rozet komutlarını listeler.')
].map(cmd => cmd.toJSON());

// Slash Komutlarını Kaydetme
async function slashKomutlariKaydet(botId) {
    try {
        const rest = new REST({ version: '10' }).setToken(botToken);
        console.log(`  ${CYAN}[*] Slash komutları kaydediliyor...${RESET}`);
        await rest.put(Routes.applicationCommands(botId), { body: slashCommands });
        console.log(`  ${GREEN}[+] Slash komutları (/panel, /tara, /help) başarıyla kaydedildi.${RESET}`);
    } catch (err) {
        console.error(`  ${RED}[!] Slash komut kaydı hatası:${RESET}`, err?.message || err);
    }
}

const BANNER_PATH = path.join(__dirname, 'assets', 'banner.png');

function getBannerFiles() {
    if (fs.existsSync(BANNER_PATH)) {
        return [new AttachmentBuilder(BANNER_PATH, { name: 'banner.png' })];
    }
    return [];
}

// Panel Mesajı Oluşturucu
function panelMesajiOlustur() {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔍 Discord Rozet & Kullanıcı Tarayıcı')
        .setDescription(
            'İstediğiniz sunucudaki nadir rozetlere sahip hesapları anında tespit edebilirsiniz.\n\n' +
            '🛡️ **Gizlilik ve Güvenlik:**\n' +
            '• Tarama başlattığınızda sadece sizin görebileceğiniz **özel gizli bir oda** açılır.\n' +
            '• Birden fazla kullanıcı aynı anda kendi özel odasını açıp bağımsız tarama yapabilir (genel oda sınırı yoktur).\n' +
            '• Sunucudaki diğer üyeler kesinlikle tarama sonuçlarınızı göremez.\n' +
            '• **Tek Sefer Token Girişi:** Oda açık kaldığı sürece tokeni tekrar girmeden odadan istediğiniz kadar sunucu tarayabilirsiniz!\n' +
            '• İşiniz bittiğinde **`[🗑️ Odayı Sil]`** butonu ile odayı anında silebilirsiniz.\n\n' +
            '💡 **Tüm Komutlar:** Detaylı komut listesi için `.help` yazabilirsiniz.'
        )
        .addFields(
            {
                name: '🎯 Taranan Nadir Rozetler',
                value: 
                    `<:DiscordStaff:1563576035646374000> **Discord Staff**\n` +
                    `<:GoldenBugHunter:1563576037433020566> **Bug Hunter Lv.2**\n` +
                    `<:ModeratorProgramsAlumni:1563576038804426832> **Certified Moderator**\n` +
                    `<:HypeSquadEvents:1563576041027403798> **HypeSquad Events**`,
                inline: true
            },
            {
                name: '\u200B',
                value: 
                    `<:EarlyVerifiedBotDeveloper:1563576043971944479> **Early Bot Developer**\n` +
                    `<:EarlySupporter:1563576045779558422> **Early Supporter**\n` +
                    `<:BugHunter:1563576048011182233> **Bug Hunter Lv.1**\n` +
                    `<:PartneredServerOwner:1563576049751826483> **Partner Server Owner**`,
                inline: true
            },
            {
                name: '💎 Desteklenen Nitro & Ek Rozetler',
                value: '<:Opal:1563576051664429096> <:rubyyakut:1563576053207797791> <:Emeraldzmrt:1563576054671745185> <:Diamondelmas:1563576061730488421> <:Platinumplat:1563576064259653753> <:NitroGold:1563576065564221460> <:NitroSilver:1563576066554069065> <:NitroBronze:1563576069284692060> <:NitroBasic:1563576071805210684> <:Booster24m:1563576073323548753>'
            }
        )
        .setImage('attachment://banner.png')
        .setFooter({ text: 'by @vacx • Discord Badge Scraper' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_tara_modal_all')
            .setLabel('Sunucu Tara')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔍')
    );

    return { embeds: [embed], components: [row], files: getBannerFiles() };
}

// Yardım (.help) Mesajı Oluşturucu
function helpMesajiOlustur() {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📖 Rozet Tarayıcı Komut Listesi')
        .setDescription(
            'Aşağıdaki komutları kullanarak hem genel tarama yapabilir hem de doğrudan aradığınız rozete özel filtreli tarama odası açabilirsiniz.\n' +
            'Aynı anda birden fazla kullanıcı kendi odasını açabilir; oda sınırı yoktur (yalnızca odası açık olan kullanıcı yeni oda açamaz).'
        )
        .addFields(
            {
                name: '🔍 Genel Tarama Komutları',
                value: 
                    '`!tara` veya `.tara` : Tüm nadir rozetleri tarar.\n' +
                    '`!panel` veya `.panel` : Yönetici tarama panelini gönderir.\n' +
                    '`!help` veya `.help` : Bu yardım menüsünü görüntüler.'
            },
            {
                name: '💎 Özel Rozet & Görev Filtre Komutları',
                value:
                    `<:Booster24m:1563576073323548753> \`.24ay\` : Yalnızca 24+ Ay Booster hesapları tarar.\n` +
                    `<:rubyyakut:1563576053207797791> \`.ruby\` : Yalnızca Nitro Ruby (5y) rozetli hesapları tarar.\n` +
                    `<:Opal:1563576051664429096> \`.opal\` : Yalnızca Nitro Opal (6y+) rozetli hesapları tarar.\n` +
                    `<:Emeraldzmrt:1563576054671745185> \`.zümrüt\` / \`.zumrut\` : Yalnızca Nitro Emerald (3y) hesapları tarar.\n` +
                    `<:QuestCompleted:1563576090100764672> \`.play\` / \`.quest\` : Yalnızca Quest/Oyun görev rozetlerini tarar.\n` +
                    `<:DiscordStaff:1563576035646374000> \`.staff\` : Yalnızca Discord Staff çalışanlarını tarar.\n` +
                    `<:HypeSquadEvents:1563576041027403798> \`.hypesquad\` : HypeSquad rozetli hesapları tarar.\n` +
                    `<:GoldenBugHunter:1563576037433020566> \`.bughunter\` : Bug Hunter hesapları tarar.\n` +
                    `<:EarlySupporter:1563576045779558422> \`.early\` : Early Supporter hesapları tarar.\n` +
                    `<:EarlyVerifiedBotDeveloper:1563576043971944479> \`.dev\` : Early Bot Developer hesapları tarar.\n` +
                    `<:ModeratorProgramsAlumni:1563576038804426832> \`.moderator\` : Certified Moderator hesapları tarar.`
            },
            {
                name: '⚡ Özel Odada Kullanım',
                value: 'Odanız açıldıktan sonra hiçbir komut yazmadan direkt **Sunucu ID**\'sini yapıştırarak tarama başlatabilirsiniz.'
            }
        )
        .setImage('attachment://banner.png')
        .setFooter({ text: 'by @vacx • Discord Badge Scraper' });

    return { embeds: [embed], files: getBannerFiles() };
}

// Oda Kontrol Butonları (Yeni Tara + Odayı Sil)
function odaKontrolButonlariOlustur(userId, scanning = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`btn_yeni_tara_${userId}`)
            .setLabel('Yeni Sunucu Tara')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔍')
            .setDisabled(scanning),
        new ButtonBuilder()
            .setCustomId(`btn_sil_${userId}`)
            .setLabel('Odayı Sil')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
    );
}

// Güvenli Webhook Gönderici
async function guvenliWebhookGonder(webhookUrl, icerik, embedler) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return;
    try {
        await axios.post(webhookUrl, {
            content: icerik,
            embeds: embedler.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e))
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000
        });
    } catch (err) {
        console.error(`  ${RED}[Webhook Hatası]:${RESET}`, err.response?.data?.message || err.message);
    }
}

// Bot Yeniden Başladığında Mevcut Odaları Otomatik Kurtarma (Recovery)
async function mevcutOdalarıKurtar() {
    try {
        const defaultToken = process.env.DISCORD_TOKEN || '';
        for (const guild of client.guilds.cache.values()) {
            guild.channels.cache.forEach(channel => {
                if (channel.type === ChannelType.GuildText && channel.name.startsWith('tarama-')) {
                    if (!activeRoomSessions.has(channel.id)) {
                        // Kanal topic'inden veya izinlerinden kullanıcı ID'sini bul
                        let ownerId = null;
                        const topic = channel.topic || '';
                        const idMatch = topic.match(/\((\d{17,21})\)/);
                        if (idMatch) {
                            ownerId = idMatch[1];
                        } else {
                            // İzin overwrites içinden ViewChannel sahibi üyeyi bul
                            for (const [id, overwrite] of channel.permissionOverwrites.cache.entries()) {
                                if (id !== guild.roles.everyone.id && id !== client.user.id && overwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
                                    ownerId = id;
                                    break;
                                }
                            }
                        }

                        if (ownerId) {
                            activeRoomSessions.set(channel.id, {
                                userId: ownerId,
                                token: defaultToken,
                                filterBadge: 'all',
                                scanning: false
                            });
                            console.log(`  ${CYAN}[Kurtarıldı]${RESET} Açık tarama odası hafızaya alındı: #${channel.name} (${ownerId})`);
                        }
                    }
                }
            });
        }
    } catch (e) {
        console.error('Oda kurtarma hatası:', e.message);
    }
}

client.once('clientReady', async () => {
    console.log(`\n${CYAN}====================================================${RESET}`);
    console.log(`  ${GREEN}${BOLD}EARLY.HOST — DISCORD SCRAPER BOTU AKTİF!${RESET}`);
    console.log(`  ${GRAY}Bot Kullanıcı Adı:${RESET} ${client.user.tag}`);
    console.log(`  ${GRAY}Sunucu Sayısı    :${RESET} ${client.guilds.cache.size}`);
    console.log(`  ${GRAY}Kullanım         :${RESET} !panel, .panel, .tara, .help veya rozet komutları (.ruby, .24ay vs.)`);
    console.log(`  ${GRAY}Thanks to hta${RESET}`);
    console.log(`${CYAN}====================================================${RESET}\n`);

    await slashKomutlariKaydet(client.user.id);
    await mevcutOdalarıKurtar();
});

// Kanal Silindiğinde Oturumu Hafızadan Temizleme
client.on('channelDelete', (channel) => {
    if (activeRoomSessions.has(channel.id)) {
        activeRoomSessions.delete(channel.id);
    }
});

// Metin Komutları ve Özel Odada ID Yazma Dinleyicisi
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const metin = message.content.trim();
    const metinKucuk = metin.toLowerCase();

    // 1. ÖZEL TARAMA ODASINDA KULLANIM (AYNI ODADA HİÇBİR YENİ ODA AÇMADAN DİREKT ÇALIŞTIRMA):
    const isTaramaKanalı = message.channel.name.startsWith('tarama-') || activeRoomSessions.has(message.channel.id);

    if (isTaramaKanalı) {
        // Eğer session yoksa (bot restart yemişse) anında session oluştur/kurtar
        if (!activeRoomSessions.has(message.channel.id)) {
            activeRoomSessions.set(message.channel.id, {
                userId: message.author.id,
                token: process.env.DISCORD_TOKEN || '',
                filterBadge: 'all',
                scanning: false
            });
        }

        const session = activeRoomSessions.get(message.channel.id);

        // Odanın sahibi mesaj attıysa
        if (message.author.id === session.userId) {
            // A) Filtreli komut + Sunucu ID formatı: .ruby 256828829966925825 veya .staff 123...
            if (metin.startsWith('.') || metin.startsWith('!')) {
                const parts = metin.slice(1).trim().split(/\s+/);
                const cmdName = parts[0].toLowerCase();
                const possibleId = parts[1] ? parts[1].replace(/[^\d]/g, '') : '';

                if (ROZET_FILTRELERI[cmdName] && possibleId.length >= 17 && possibleId.length <= 21) {
                    if (session.scanning) {
                        return message.reply({ content: '⏳ Bu odada devam eden bir tarama var. Lütfen tamamlanmasını bekleyin.' });
                    }
                    session.filterBadge = ROZET_FILTRELERI[cmdName].id;
                    return executeScanInChannel(message.channel, message.author, session.token, possibleId, session.filterBadge);
                }
            }

            // B) Direkt ID yazımı (örn: 256828829966925825) -> Mevcut filtren neyse onunla tara
            const cleanId = metin.replace(/[^\d]/g, '');
            if (cleanId.length >= 17 && cleanId.length <= 21 && !metin.includes(' ')) {
                if (session.scanning) {
                    return message.reply({ content: '⏳ Bu odada devam eden bir tarama var. Lütfen tamamlanmasını bekleyin.' });
                }

                return executeScanInChannel(message.channel, message.author, session.token, cleanId, session.filterBadge || 'all');
            }
        }
    }

    // 2. Panel Gönderme Komutu (!panel / .panel)
    if (metinKucuk === '!panel' || metinKucuk === '.panel') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ content: '❌ Bu komutu sadece sunucu yöneticileri kullanabilir.' });
        }
        await message.channel.send(panelMesajiOlustur());
        try { await message.delete(); } catch (_) {}
        return;
    }

    // 3. Yardım Menüsü (!help / .help / !yardim / .yardim)
    if (metinKucuk === '!help' || metinKucuk === '.help' || metinKucuk === '!yardim' || metinKucuk === '.yardim') {
        return message.reply(helpMesajiOlustur());
    }

    // 4. Rozet Filtre Komutları (.ruby, .opal, .24ay, .zümrüt, .play, .staff, .hypesquad, .early vs.) veya .tara
    // Desteklenen formatlar:
    // a) .early (Buton çıkarır)
    // b) .early <sunucu_id> (Odası varsa direkt odada taratır veya modal/yönlendirme sunar)
    let eslesenKomut = null;
    let parametreGuildId = null;

    if (metin.startsWith('.') || metin.startsWith('!')) {
        const parts = metin.slice(1).trim().split(/\s+/);
        const cmdName = parts[0].toLowerCase();
        if (ROZET_FILTRELERI[cmdName]) {
            eslesenKomut = { cmd: cmdName, ...ROZET_FILTRELERI[cmdName] };
            if (parts[1]) {
                const potentialId = parts[1].replace(/[^\d]/g, '');
                if (potentialId.length >= 17 && potentialId.length <= 21) {
                    parametreGuildId = potentialId;
                }
            }
        }
    }

    if (eslesenKomut) {
        // Kullanıcının açık odası var mı?
        const acikOda = kullanicininAcikOdasi(message.guild, message.author.id);

        // Güvenli Yanıt Gönderme Fonksiyonu (Silinmiş mesaj hatasını önler)
        const guvenliCevapVer = async (opts) => {
            try {
                return await message.reply(opts);
            } catch (e) {
                return await message.channel.send(opts).catch(() => {});
            }
        };

        // Eğer kullanıcının zaten açık odası varsa ve sunucu ID'si yazmışsa:
        if (acikOda && parametreGuildId) {
            const session = activeRoomSessions.get(acikOda.id);
            if (session && session.token) {
                if (session.scanning) {
                    return guvenliCevapVer({ content: `⏳ <#${acikOda.id}> kanalınızda zaten devam eden bir tarama var.` });
                }
                session.filterBadge = eslesenKomut.id;
                await guvenliCevapVer({ content: `🚀 Taramayı açık odanızda başlattım: <#${acikOda.id}>` });
                return executeScanInChannel(acikOda, message.author, session.token, parametreGuildId, eslesenKomut.id);
            }
        }

        // Eğer kullanıcının zaten odası varsa ama sadece komut yazmışsa (.early):
        if (acikOda && !parametreGuildId) {
            return guvenliCevapVer({
                content: `ℹ️ **Zaten aktif bir tarama odanız var:** <#${acikOda.id}>\n\n• Odaya gidip direkt Sunucu ID yazabilir veya \`.${eslesenKomut.cmd} <sunucu_id>\` yazarak tarama başlatabilirsiniz!`
            });
        }

        // Kullanıcının henüz açık odası yoksa buton ile form açtır:
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_tara_modal_${eslesenKomut.id}`)
                .setLabel(`${eslesenKomut.label} Taraması Başlat`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔍')
        );

        return guvenliCevapVer({
            content: `🔍 **${eslesenKomut.label}** tarama odası açmak için aşağıdaki butona tıklayın:`,
            components: [row]
        });
    }
});

// Etkileşim Dinleyicisi (Slash, Buton, Modal)
client.on('interactionCreate', async (interaction) => {
    try {
        // 1. SLASH KOMUTLAR
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'panel') {
                if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ Bu komutu sadece yöneticiler kullanabilir.', flags: MessageFlags.Ephemeral });
                }
                await interaction.channel.send(panelMesajiOlustur());
                return interaction.reply({ content: '✅ Panel başarıyla gönderildi.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.commandName === 'tara') {
                return modalGoster(interaction, 'all');
            }

            if (interaction.commandName === 'help') {
                return interaction.reply({ ...helpMesajiOlustur(), flags: MessageFlags.Ephemeral });
            }
        }

        // 2. BUTON ETKİLEŞİMLERİ
        if (interaction.isButton()) {
            // Sunucu Tara Butonları (Filtreli veya Genel)
            if (interaction.customId.startsWith('btn_tara_modal_') || interaction.customId === 'btn_tara_modal') {
                const filterBadge = interaction.customId.replace('btn_tara_modal_', '').replace('btn_tara_modal', '') || 'all';
                return modalGoster(interaction, filterBadge);
            }

            // [Yeni Sunucu Tara] Butonu - Sadece Sunucu ID Soran Hızlı Modal
            if (interaction.customId.startsWith('btn_yeni_tara_')) {
                const ownerId = interaction.customId.replace('btn_yeni_tara_', '');
                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: '❌ Bu işlemi yalnızca odanın sahibi yapabilir.', flags: MessageFlags.Ephemeral });
                }

                const session = activeRoomSessions.get(interaction.channel.id);
                if (!session || !session.token) {
                    return interaction.reply({
                        content: '❌ Bu odanın oturum bilgisi bulunamadı. Lütfen panelden yeni tarama başlatın.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (session.scanning) {
                    return interaction.reply({ content: '⏳ Halihazırda devam eden bir tarama var.', flags: MessageFlags.Ephemeral });
                }

                return hizliSunucuIdModalGoster(interaction);
            }

            // [Odayı Sil] Butonu
            if (interaction.customId.startsWith('btn_sil_')) {
                const ownerId = interaction.customId.replace('btn_sil_', '');
                const isOwner = interaction.user.id === ownerId;
                const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);

                if (!isOwner && !isAdmin) {
                    return interaction.reply({
                        content: '❌ Bu odayı yalnızca taramayı başlatan kişi veya kanal yöneticisi silebilir.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                activeRoomSessions.delete(interaction.channel.id);
                await interaction.reply({ content: '🗑️ Oda 3 saniye içinde siliniyor...', flags: MessageFlags.Ephemeral });
                setTimeout(() => {
                    interaction.channel.delete('Kullanıcı isteğiyle tarama odası silindi.').catch(() => {});
                }, 3000);
            }
        }

        // 3. MODAL GÖNDERİLDİĞİNDE
        if (interaction.isModalSubmit()) {
            // İlk Tarama Formu (Token + Sunucu ID)
            if (interaction.customId.startsWith('modal_tara_') || interaction.customId === 'modal_tara') {
                const filterBadge = interaction.customId.replace('modal_tara_', '').replace('modal_tara', '') || 'all';
                await taramaOturumuBaslat(interaction, filterBadge);
            }

            // Odadaki Hızlı Tarama Formu (Sadece Sunucu ID)
            if (interaction.customId === 'modal_hizli_tara') {
                await hizliTaramaBaslat(interaction);
            }
        }
    } catch (err) {
        if (err?.code !== 10062 && err?.code !== 40060) {
            console.error(`  ${RED}[Etkileşim Hatası]:${RESET}`, err?.message || err);
        }
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: `❌ Bir hata oluştu: ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
        } else {
            await interaction.reply({ content: `❌ Bir hata oluştu: ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
});

// Sadece İLGİLİ Kullanıcının Mevcut Açık Odası Var mı Kontrolü (Oda sınırı yok, sadece AYNI kişi birden fazla açamaz)
function kullanicininAcikOdasi(guild, userId) {
    if (!guild) return null;

    // 1. Önce aktif oturum listesinde bu kullanıcının odası var mı kontrol et
    for (const [channelId, session] of activeRoomSessions.entries()) {
        if (session.userId === userId) {
            const ch = guild.channels.cache.get(channelId);
            if (ch) return ch;
            activeRoomSessions.delete(channelId);
        }
    }

    // 2. Sunucudaki açık tarama kanallarında sadece BU kullanıcıya özel izin verilmiş oda var mı kontrol et
    const existing = guild.channels.cache.find(c => {
        if (c.type !== ChannelType.GuildText || !c.name.startsWith('tarama-')) return false;
        
        // Kanalın izinlerinde doğrudan bu kullanıcıya ViewChannel verilmiş mi?
        const userOverwrite = c.permissionOverwrites.cache.get(userId);
        return userOverwrite && userOverwrite.allow.has(PermissionFlagsBits.ViewChannel);
    });

    return existing || null;
}

// İlk Açılış Formu (Token + Sunucu ID)
async function modalGoster(interaction, filterBadge = 'all') {
    const acikOda = kullanicininAcikOdasi(interaction.guild, interaction.user.id);
    if (acikOda) {
        return interaction.reply({
            content: `❌ **Zaten aktif bir tarama odanız bulunuyor:** <#${acikOda.id}>\n\n• Başka bir sunucuyu taramak için odaya gidip direkt sunucu ID'sini yazabilir veya **[Yeni Sunucu Tara]** butonunu kullanabilirsiniz.\n• Sıfırdan yeni bir oda açmak istiyorsanız lütfen önce mevcut odanızı **[Odayı Sil]** butonu ile kapatın.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`modal_tara_${filterBadge}`)
        .setTitle('🔍 Sunucu Rozet Tarayıcı');

    const tokenInput = new TextInputBuilder()
        .setCustomId('input_token')
        .setLabel('Discord Hesap Tokeniniz')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Hesabınızın tokenini buraya yapıştırın...')
        .setRequired(true)
        .setMinLength(15);

    const guildInput = new TextInputBuilder()
        .setCustomId('input_guild_id')
        .setLabel('Taranacak Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Örn: 1015060230222131221')
        .setRequired(true)
        .setMinLength(15)
        .setMaxLength(25);

    modal.addComponents(
        new ActionRowBuilder().addComponents(tokenInput),
        new ActionRowBuilder().addComponents(guildInput)
    );

    await interaction.showModal(modal);
}

// Odadaki Hızlı Form (Sadece Sunucu ID)
async function hizliSunucuIdModalGoster(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('modal_hizli_tara')
        .setTitle('🔍 Yeni Sunucu Tara');

    const guildInput = new TextInputBuilder()
        .setCustomId('input_quick_guild_id')
        .setLabel('Taranacak Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Örn: 1015060230222131221')
        .setRequired(true)
        .setMinLength(15)
        .setMaxLength(25);

    modal.addComponents(new ActionRowBuilder().addComponents(guildInput));
    await interaction.showModal(modal);
}

// Odada Hızlı Tarama Gönderildiğinde
async function hizliTaramaBaslat(interaction) {
    const rawGuildId = interaction.fields.getTextInputValue('input_quick_guild_id').trim();
    const cleanGuildId = rawGuildId.replace(/[^\d]/g, '');

    const session = activeRoomSessions.get(interaction.channel.id);
    if (!session || !session.token) {
        return interaction.reply({ content: '❌ Oturum bulunamadı.', flags: MessageFlags.Ephemeral });
    }

    if (!cleanGuildId || cleanGuildId.length < 15) {
        return interaction.reply({ content: '❌ Geçersiz sunucu ID girdiniz.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({ content: `🔍 **${cleanGuildId}** ID'li sunucu için tarama başlatılıyor...` });
    await executeScanInChannel(interaction.channel, interaction.user, session.token, cleanGuildId, session.filterBadge || 'all');
}

// İlk Tarama Oturumu ve Özel Kanal Oluşturma
async function taramaOturumuBaslat(interaction, filterBadge = 'all') {
    const token = interaction.fields.getTextInputValue('input_token').trim();
    const rawGuildId = interaction.fields.getTextInputValue('input_guild_id').trim();
    const guildId = rawGuildId.replace(/[^\d]/g, '');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) {
        return interaction.editReply({ content: '❌ Bu işlem yalnızca bir sunucu içinde kullanılabilir.' });
    }

    if (!guildId || guildId.length < 15) {
        return interaction.editReply({ content: '❌ Geçersiz sunucu ID girdiniz. Lütfen geçerli bir Sunucu ID girin.' });
    }

    const acikOda = kullanicininAcikOdasi(guild, interaction.user.id);
    if (acikOda) {
        return interaction.editReply({
            content: `❌ **Zaten açık bir tarama odanız bulunuyor:** <#${acikOda.id}>\nLütfen mevcut odanızı kullanın veya yeni bir oda açmak için önce o odayı silin.`
        });
    }

    const safeUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'uye';
    const channelName = `tarama-${safeUsername}-${Math.floor(1000 + Math.random() * 9000)}`;

    console.log(`  ${CYAN}[Yeni Oda Talebi]${RESET} Kullanıcı: ${interaction.user.tag} (${interaction.user.id}) | Hedef: ${guildId} | Filtre: ${filterBadge}`);

    let privateChannel;
    try {
        const categoryId = process.env.CATEGORY_ID;
        const channelOptions = {
            name: channelName,
            type: ChannelType.GuildText,
            topic: `Tarayan: @${interaction.user.tag} (${interaction.user.id}) | Filtre: ${filterBadge} | Token kayıtlı oturum`,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.SendMessages // Kullanıcı odada direkt Sunucu ID yazabilmesi için açık!
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        };

        if (categoryId && guild.channels.cache.has(categoryId)) {
            channelOptions.parent = categoryId;
        }

        privateChannel = await guild.channels.create(channelOptions);
    } catch (err) {
        console.error(`  ${RED}[Kanal Oluşturma Hatası]:${RESET}`, err.message);
        return interaction.editReply({
            content: `❌ Özel kanal oluşturulamadı! Botun 'Kanalları Yönet' yetkisine sahip olduğundan emin olun. Hata: ${err.message}`
        });
    }

    // Oturumu Kaydet
    activeRoomSessions.set(privateChannel.id, {
        userId: interaction.user.id,
        token: token,
        filterBadge: filterBadge,
        scanning: false
    });

    await interaction.editReply({
        content: `✅ **Özel tarama odanız hazırlandı:** <#${privateChannel.id}>\nTokeniniz bu odada saklanacak; odayı kapatana kadar istediğiniz kadar sunucu tarayabilirsiniz!`
    });

    // Taramayı Başlat
    await executeScanInChannel(privateChannel, interaction.user, token, guildId, filterBadge);
}

// Odaya Özel Tarama Yürütücü (Tekrar tekrar kullanılabilir)
async function executeScanInChannel(channel, user, token, guildId, filterBadge = 'all') {
    const session = activeRoomSessions.get(channel.id);
    if (session) {
        session.scanning = true;
        if (filterBadge) session.filterBadge = filterBadge;
    }

    console.log(`  ${CYAN}[Tarama Başladı]${RESET} Kullanıcı: ${user.tag} | Sunucu: ${guildId} | Filtre: ${filterBadge}`);

    const filterObj = Object.values(ROZET_FILTRELERI).find(f => f.id === filterBadge) || { label: filterBadge === 'all' ? 'Tüm Rozetler' : filterBadge };

    const initialEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🔍 Rozet Tarama Başlatıldı ${filterBadge !== 'all' ? `• [${filterObj.label}]` : ''}`)
        .setDescription('Hedef sunucu ve üyeler analiz ediliyor, lütfen bekleyin...')
        .addFields(
            { name: '👤 Tarayan', value: `<@${user.id}>`, inline: true },
            { name: '🎯 Hedef Sunucu ID', value: `\`${guildId}\``, inline: true },
            { name: '🎯 Tarama Türü', value: `\`${filterObj.label}\``, inline: true },
            { name: '📊 Durum', value: '⏳ Hesaba bağlanılıyor (%5)...' }
        )
        .setFooter({ text: 'by @vacx • Güvenli Tarayıcı Sistemi' });

    const statusMsg = await channel.send({
        embeds: [initialEmbed],
        components: [odaKontrolButonlariOlustur(user.id, true)]
    });

    let result;
    try {
        let sonGuncellemeZamani = 0;
        result = await runScanner({
            token,
            guildId,
            filterBadge,
            onProgress: async (durum, yuzde) => {
                const simdi = Date.now();
                if (simdi - sonGuncellemeZamani < 1500 && yuzde < 95) return;
                sonGuncellemeZamani = simdi;

                const guncelEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`🔍 Rozet Tarama Sürüyor... ${filterBadge !== 'all' ? `• [${filterObj.label}]` : ''}`)
                    .setDescription('Veriler çekiliyor ve analiz ediliyor, lütfen bekleyin.')
                    .addFields(
                        { name: '👤 Tarayan', value: `<@${user.id}>`, inline: true },
                        { name: '🎯 Hedef Sunucu ID', value: `\`${guildId}\``, inline: true },
                        { name: '🎯 Tarama Türü', value: `\`${filterObj.label}\``, inline: true },
                        { name: '📊 Durum', value: `${durum} (%${yuzde})` }
                    )
                    .setFooter({ text: 'by @vacx • İşlem devam ediyor...' });

                await statusMsg.edit({ embeds: [guncelEmbed] }).catch(() => {});
            }
        });
    } catch (err) {
        result = { success: false, error: `Beklenmeyen bir hata oluştu: ${err.message}` };
    } finally {
        if (session) session.scanning = false;
    }

    // Hata Durumu
    if (!result.success) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('❌ Tarama Başarısız Oldu')
            .setDescription(`**Sebep:** ${result.error}`)
            .setFooter({ text: 'by @vacx • Başka sunucu tarayabilir veya odayı silebilirsiniz.' });

        return statusMsg.edit({
            embeds: [errorEmbed],
            components: [odaKontrolButonlariOlustur(user.id, false)]
        }).catch(() => {});
    }

    // 0 Sonuç Durumu
    if (result.foundCount === 0) {
        const emptyEmbed = new EmbedBuilder()
            .setColor('#2B2D31')
            .setTitle(`📋 ${result.guildName || 'Sunucu'} • Tarama Sonucu`)
            .setDescription(`Hedef nadir rozetlere sahip herhangi bir kullanıcı bulunamadı.\n\n📊 **İncelenen Üye Sayısı:** \`${result.totalScanned}\``)
            .setImage('attachment://banner.png')
            .setFooter({ text: 'by @vacx • Başka sunucu tarayabilir veya odayı silebilirsiniz.' });

        if (result.guildIcon) emptyEmbed.setThumbnail(result.guildIcon);

        return statusMsg.edit({
            embeds: [emptyEmbed],
            files: getBannerFiles(),
            components: [odaKontrolButonlariOlustur(user.id, false)]
        }).catch(() => {});
    }

    // Önceki durum mesajını temizle (Kanalda sadece temiz sonuç sayfaları kalsın)
    try { await statusMsg.delete(); } catch (_) {}

    // Sonuçları 15'erli parçalar halinde gönder (2. fotoğraftaki orijinal format)
    const parcaBoyutu = 15;
    const siraliSatirlar = result.results;
    const toplamSayfa = Math.ceil(siraliSatirlar.length / parcaBoyutu);

    for (let i = 0; i < siraliSatirlar.length; i += parcaBoyutu) {
        const parca = siraliSatirlar.slice(i, i + parcaBoyutu);
        const sayfa = Math.floor(i / parcaBoyutu) + 1;

        const embed = new EmbedBuilder()
            .setColor('#2B2D31')
            .setTitle(result.guildName)
            .setDescription(parca.join('\n'))
            .setFooter({ text: toplamSayfa > 1 ? `by @vacx • Sayfa ${sayfa}/${toplamSayfa}` : 'by @vacx' });

        if (sayfa === toplamSayfa) {
            embed.setImage('attachment://banner.png');
            await channel.send({
                embeds: [embed],
                files: getBannerFiles(),
                components: [odaKontrolButonlariOlustur(user.id, false)]
            });
        } else {
            await channel.send({ embeds: [embed] });
        }

        await new Promise(r => setTimeout(r, 600));
    }

    console.log(`  ${GREEN}[Tarama Tamamlandı]${RESET} ${user.tag} için ${result.foundCount} hesap listelendi.`);
}

client.login(botToken).catch((err) => {
    console.error(`\n  ${RED}[Giriş Hatası] Bot giriş yapamadı:${RESET}`, err.message);
    console.log(`  ${YELLOW}Lütfen .env dosyasındaki BOT_TOKEN değerinin doğruluğunu kontrol edin.${RESET}\n`);
    process.exit(1);
});

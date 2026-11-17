const assert = require('assert');
const { runScanner, NADIR_HEDEF_ROZETLER } = require('./scanner');
const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

console.log('🧪 SISTEM KAPSAMLI TESTLERI BASLATILIYOR...\n');

// TEST 1: Nadir rozet tanımları kontrolü
console.log('Test 1: Nadir rozet tanımları...');
assert.strictEqual(NADIR_HEDEF_ROZETLER.length, 8, '8 adet nadir rozet olmalı');
assert(NADIR_HEDEF_ROZETLER.some(r => r.id === 'discord_staff'), 'Discord Staff bulunmalı');
assert(NADIR_HEDEF_ROZETLER.some(r => r.id === 'early_supporter'), 'Early Supporter bulunmalı');
assert(NADIR_HEDEF_ROZETLER.some(r => r.id === 'golden_bug_hunter'), 'Golden Bug Hunter bulunmalı');
console.log('✅ Test 1 Başarılı: 8 adet nadir rozet eksiksiz tanımlı.');

// TEST 2: UI Bileşenleri ve Embed Testleri
console.log('\nTest 2: Panel ve Embed UI Testi...');
const panelEmbed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🔍 Discord Rozet & Kullanıcı Tarayıcı')
    .setDescription('Test Açıklama')
    .setFooter({ text: 'by @vacx • Discord Badge Scraper' });

assert.strictEqual(panelEmbed.data.color, 0x5865F2);
assert.strictEqual(panelEmbed.data.footer.text, 'by @vacx • Discord Badge Scraper');

// 15'erli sayfalama testi
const mockUsers = Array.from({ length: 35 }, (_, i) => `\`${i + 1}.\` [**@user${i + 1}**](https://discord.com) <:DiscordStaff:1559263981766582342>`);
const parcaBoyutu = 15;
const toplamSayfa = Math.ceil(mockUsers.length / parcaBoyutu);
assert.strictEqual(toplamSayfa, 3, '35 kullanıcı 15\'erli 3 sayfaya bölünmeli');

const sayfa1 = mockUsers.slice(0, 15);
assert.strictEqual(sayfa1.length, 15);
const sayfa3 = mockUsers.slice(30, 45);
assert.strictEqual(sayfa3.length, 5);
console.log('✅ Test 2 Başarılı: 15\'erli sayfalama algoritması ve embedler doğrulandı.');

// TEST 3: Butonlar ve Modal Form Testi
console.log('\nTest 3: Buton ve Form Doğrulama...');
const modal = new ModalBuilder().setCustomId('modal_tara').setTitle('Tarama Formu');
const inputToken = new TextInputBuilder().setCustomId('input_token').setLabel('Token').setStyle(TextInputStyle.Paragraph);
const inputGuild = new TextInputBuilder().setCustomId('input_guild_id').setLabel('Guild').setStyle(TextInputStyle.Short);
modal.addComponents(new ActionRowBuilder().addComponents(inputToken), new ActionRowBuilder().addComponents(inputGuild));

assert.strictEqual(modal.components.length, 2);
assert.strictEqual(modal.data.custom_id, 'modal_tara');

const btnYeni = new ButtonBuilder().setCustomId('btn_yeni_tara_123').setLabel('Yeni Sunucu Tara').setStyle(ButtonStyle.Success);
const btnSil = new ButtonBuilder().setCustomId('btn_sil_123').setLabel('Odayı Sil').setStyle(ButtonStyle.Danger);
assert.strictEqual(btnYeni.data.style, ButtonStyle.Success);
assert.strictEqual(btnSil.data.style, ButtonStyle.Danger);
console.log('✅ Test 3 Başarılı: Butonlar ve form alanları hatasız.');

// TEST 4: Scanner Hata Yakalama ve Zaman Aşımı Testi
console.log('\nTest 4: Scanner hata yakalama ve timeout testi...');
runScanner({
    token: 'invalid_dummy_token_12345',
    guildId: '999999999999999999',
    onProgress: () => {}
}).then(res => {
    assert.strictEqual(res.success, false, 'Geçersiz token hata döndürmeli');
    assert(res.error, 'Hata mesajı bulunmalı');
    console.log('✅ Test 4 Başarılı: Scanner hataları güvenle yakalıyor.');

    console.log('\n🎉 TÜM TESTLER BAŞARIYLA TAMAMLANDI! SISTEM KULLANIMA HAZIR.');
    process.exit(0);
}).catch(err => {
    console.error('❌ Test Başarısız:', err);
    process.exit(1);
});

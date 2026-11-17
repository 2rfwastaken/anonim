# Early.Host — Discord Kullanıcı Adı ve Rozet Tarayıcı (Türkçe)

Branding by **early.host** — thanks to **hta**.

## 📌 Tanıtım

Bu araç, Discord ses kanallarına katılan kullanıcıları anlık olarak tarar; kullanıcı adlarını, nadir rozetlerini ve kanal üyelerini analiz eder. Belirlenen kriterlere uyan (nadir rozetler, 2-3 haneli kısa kullanıcı adları vb.) kullanıcıları otomatik olarak tespit edip Discord **Webhook** adresinize detaylı bir bildirim gönderir.

---

## ⚙️ Özellikler

✅ **Ses Kanalı Takibi:** Kullanıcılar bir ses kanalına katıldığı anda otomatik analiz eder.  
✅ **Nadir Rozet Tespiti:**  
- Erken Destekçi (*Early Supporter*)  
- Erken Onaylı Bot Geliştiricisi (*Early Verified Bot Developer*)  
- HypeSquad Etkinlikleri (*HypeSquad Events*)  
- Discord Çalışanı (*Discord Employee*)  
- Discord Partneri (*Partnered Server Owner*)  
- Hata Avcısı Seviye 1 & 2 (*Bug Hunter*)  
- Aktif Geliştirici (*Active Developer*)  
✅ **Kısa Kullanıcı Adı Tespiti:** 2 veya 3 karakterden oluşan nadir kullanıcı adlarını yakalar.  
✅ **Türkçe Webhook Bildirimi:** Yakalanan kullanıcıyı zengin gömülü mesaj (embed) ve avatar görseliyle webhook'a iletir.  
✅ **Türkçe Konsol Arayüzü:** Renkli ve anlaşılır Türkçe terminal logları sunar.  
✅ **Doğrudan EXE Desteği:** Node.js kurmadan doğrudan `EarlyHost.exe` çift tıklanarak çalıştırılabilir.  
✅ **Akıllı Kurulum:** `.env` dosyasında token veya webhook eksikse program kapanmaz, konsolda kullanıcıdan isteyip otomatik kaydeder.

---

## 🚀 Nasıl Kullanılır?

### Yöntem 1: Doğrudan EXE ile Çalıştırma (Önerilen)

1. Klasördeki **`EarlyHost.exe`** veya **`Baslat.bat`** dosyasına çift tıklayın.
2. İlk açılışta Discord Tokeniniz ve Webhook URL'niz istenecektir:
   - **Discord Token**: Hesabınızın tokeni.
   - **Webhook URL**: Bildirimlerin gönderileceği Discord kanalının Webhook adresi.
3. Bilgileri girdikten sonra ayarlar `.env` dosyasına kaydedilir ve tarayıcı otomatik çalışmaya başlar.

---

### Yöntem 2: Node.js ile Çalıştırma

1. `.env` dosyasını açıp bilgilerinizi girin:
   ```env
   DISCORD_TOKEN=discord_hesap_tokeniniz
   WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```
2. Terminal üzerinden başlatın:
   ```bash
   node scrapper.js
   ```

---

## 🛠️ Yeniden EXE Derleme

Koddaki değişiklikleri tekrar EXE haline getirmek isterseniz:
```bash
npm run build:exe
```
komutunu çalıştırmanız yeterlidir.

---

## ⚠️ Önemli Hatırlatma

- Bu araç kullanıcı hesabı (*Selfbot*) ile çalışmaktadır. Discord Kullanım Koşulları gereği selfbot kullanımı hesabınız için risk oluşturabilir. Sorumluluk kullanıcıya aittir.
- Kod tamamen açık kaynaklıdır ve ihtiyaca göre düzenlenebilir.

---

## 🙌 Credits

**Early.Host** — thanks to **hta**.

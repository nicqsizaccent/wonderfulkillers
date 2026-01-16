# RePublic OF WonderfulKillers Launcher

Modern, animasyonlu oyun launcher'ı.

## Özellikler

- 🎨 Animasyonlu splash screen
- 🔐 Discord OAuth2 giriş sistemi
- ⬆️ GitHub'dan otomatik güncelleme
- 🎤 Sesli konuşma
- 💬 Yazışma sistemi
- 📢 Duyuru sistemi
- ⬇️ Dosya indirme
- 👥 Ekip bilgileri yönetimi

## Kurulum

```bash
npm install
```

## Geliştirme

```bash
npm start
```

## Build

Windows için .exe oluşturma:

```bash
npm run build-win
```

## Yapılandırma

### Discord OAuth2

1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden bir uygulama oluşturun
2. OAuth2 sekmesinden:
   - **Client ID**'yi kopyalayın
   - **Client Secret**'ı kopyalayın (Reset Secret butonuna tıklayarak görebilirsiniz)
   - **Redirect URI** ekleyin: `http://localhost:3000/auth/callback`
3. `config.example.js` dosyasını `config.js` olarak kopyalayın:
   ```bash
   cp config.example.js config.js
   ```
4. `config.js` dosyasını açın ve kendi Discord bilgilerinizi girin:
   ```javascript
   module.exports = {
     discord: {
       clientId: 'BURAYA_CLIENT_ID',
       clientSecret: 'BURAYA_CLIENT_SECRET',
       redirectUri: 'http://localhost:3000/auth/callback'
     }
   };
   ```

**Önemli:** `config.js` dosyası `.gitignore`'a eklenmiştir, böylece gizli bilgileriniz GitHub'a yüklenmez.

### GitHub Güncelleme

Launcher otomatik olarak GitHub repository'den (`nicqsizaccent/wonderfulkillers`) güncellemeleri kontrol eder.

**Güncelleme Yayınlama:**
1. GitHub repository'nizde yeni bir Release oluşturun
2. Tag name'i versiyon numarası olarak ayarlayın (örn: `v1.0.1`, `v1.1.0`)
3. Release'e `.exe` dosyasını ekleyin (electron-builder ile oluşturulan)
4. Release'i yayınlayın

**Önemli:**
- Güncelleme zorunludur - kullanıcılar güncelleme yapmadan giriş yapamaz
- Versiyon numarası `package.json`'daki `version` alanından alınır
- GitHub Releases'da tag name versiyon numarasıyla eşleşmeli

## Güncelleme Sistemi

Launcher her açılışta GitHub'dan otomatik olarak güncelleme kontrolü yapar:
- ✅ Yeni sürüm varsa: Güncelleme ekranı gösterilir, güncelleme zorunludur
- ✅ Güncelleme yoksa: Normal login ekranına geçilir
- ⚠️ Güncelleme yapmayan kullanıcılar launcher'e giriş yapamaz

**Versiyon Gösterimi:**
- Launcher versiyonu giriş yaptıktan sonra sağ alt köşede gösterilir

## Notlar

- Discord OAuth2 artık tam olarak çalışıyor! Gerçek Discord hesaplarıyla giriş yapabilirsiniz.
- Icon dosyası `assets/icon.ico` konumuna eklenmelidir
- `config.js` dosyasını asla GitHub'a yüklemeyin (gizli bilgiler içerir)
- GitHub Releases oluştururken tag name'i versiyon numarasıyla eşleştirin (örn: v1.0.1)
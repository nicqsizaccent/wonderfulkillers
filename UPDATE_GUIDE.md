# Güncelleme Yayınlama Rehberi

Bu rehber, launcher için yeni bir güncelleme yayınlamak için gereken adımları açıklar.

## Adımlar

### 1. Versiyon Numarasını Güncelle

`package.json` dosyasındaki `version` alanını güncelleyin:

```json
{
  "version": "1.0.1"  // Yeni versiyon numarası
}
```

### 2. Launcher'ı Build Edin

```bash
npm run build-win
```

Bu komut `dist` klasöründe `.exe` dosyası oluşturur.

### 3. GitHub Release Oluşturun

1. GitHub repository'nize gidin: https://github.com/nicqsizaccent/wonderfulkillers
2. "Releases" sekmesine tıklayın
3. "Create a new release" butonuna tıklayın
4. **Tag version**: `v1.0.1` (package.json'daki version ile aynı, başına `v` ekleyin)
5. **Release title**: "Launcher v1.0.1" (veya istediğiniz başlık)
6. **Description**: Güncelleme notlarınızı yazın
7. **Attach binaries**: `dist` klasöründeki `.exe` dosyasını sürükleyip bırakın
8. "Publish release" butonuna tıklayın

### 4. Kullanıcılar Otomatik Güncelleme Alacak

- Kullanıcılar launcher'ı açtığında otomatik olarak güncelleme kontrolü yapılır
- Yeni sürüm varsa güncelleme ekranı gösterilir
- Güncelleme zorunludur - güncelleme yapmadan giriş yapılamaz

## Önemli Notlar

- ✅ Tag name mutlaka `v` ile başlamalı (örn: `v1.0.1`)
- ✅ Tag name, `package.json`'daki version ile eşleşmeli
- ✅ Release'e mutlaka `.exe` dosyası eklenmeli
- ✅ Her yeni release için versiyon numarasını artırın

## Versiyon Numaralandırma

Semantic versioning kullanın:
- **MAJOR** (1.0.0 → 2.0.0): Büyük değişiklikler
- **MINOR** (1.0.0 → 1.1.0): Yeni özellikler
- **PATCH** (1.0.0 → 1.0.1): Hata düzeltmeleri

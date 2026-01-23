// Discord OAuth2 Yapılandırması
// Bu dosyayı config.js olarak kopyalayın ve kendi bilgilerinizi girin

module.exports = {
  discord: {
    clientId: '1381802508602707998',
    clientSecret: '0Uk1t9piauHgo369PgKdSuPfWY8uhpLP',
    redirectUri: 'http://localhost:3000/auth/callback',
    guildId: '552413880543084544',
    moderatorRoleIds: ['1209170161383379024', '1424508649916600462'],
    // Launcher'a erişim için gerekli rol ID (zorunlu)
    requiredRoleId: '1409937785720143952',
    // Rol ID -> görünen isim. Sadece bu ID'ler kullanıcıda varsa gösterilir.
    roleIdToName: {
      // 'DISCORD_ROL_ID': 'Görünen İsim'
      // Örnek: '123456789': 'President', '987654321': 'General Manager'
      '1382346826820096123': 'President',
      '1382346827411623966': 'General Manager'
    }
  },
  // Ortak sohbet: Tüm kullanıcılar AYNI sunucuya bağlanmalı. Boş bırakırsan localhost kullanılır (sadece kendi yazdığını görürsün).
  // Kurulum: SETUP_REALTIME.md dosyasına bakın. Örnek: 'ws://VPS_IP:4000' veya REALTIME_WS_URL ortam değişkeni.
  realtime: {
    wsUrl: process.env.REALTIME_WS_URL || 'ws://141.11.109.97:4000'
  },
  truckersmp: {
    vtcId: 53624,
    apiBase: 'https://api.truckersmp.com/v2',
    // TruckersMP Launcher yolu. Boşsa otomatik aranır: %LocalAppData%\\TruckersMP\\Launcher.exe
    launcherPath: ''
  },
  // Sürücü lisansı: km'ye göre 10 kademe. Her kademe için Discord rol ID (opsiyonel).
  driverLicenseTiers: [
    { km: 0, name: 'Aday Sürücü' },
    { km: 1000, name: 'Beginner Driver' },
    { km: 2500, name: 'Rookie Driver' },
    { km: 5000, name: 'Driver' },
    { km: 7500, name: 'Experienced Driver' },
    { km: 10000, name: 'Epic Driver' },
    { km: 15000, name: 'Veteran Driver' },
    { km: 25000, name: 'Expert Driver' },
    { km: 50000, name: 'Master Driver' },
    { km: 100000, name: 'Legend Driver' }
  ],
  driverLicenseRoleIds: {} // { 'Aday Sürücü': 'DISCORD_ROL_ID', ... } - Bot ile atama için
};

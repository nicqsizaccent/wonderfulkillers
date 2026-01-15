const splash = document.getElementById('splash');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('login-btn');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const gamesList = document.getElementById('games-list');
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const minimizeBtn = document.getElementById('minimize');
const closeBtn = document.getElementById('close');
const logoutBtn = document.getElementById('logout-btn');

window.addEventListener('DOMContentLoaded', async () => {
  // Splash animasyonu
  setTimeout(() => {
    splash.style.animation = 'fadeOut 1s forwards';
    setTimeout(() => {
      splash.style.display = 'none';
      mainApp.style.display = 'flex';
      mainApp.style.animation = 'fadeIn 1s forwards';
    }, 1000);
  }, 2000);

  // Kullanıcı yükle
  try {
    const saved = await window.wk.getSavedUser();
    if (saved && saved.user) {
      showUser(saved.user);
    }
  } catch (err) {
    console.error('Kullanıcı yükleme hatası:', err);
  }

  // Oyunları yükle
  try {
    await loadGames();
  } catch (err) {
    console.error('Oyun yükleme hatası:', err);
  }

  // Event listeners
  loginBtn.addEventListener('click', async () => {
    try {
      await window.wk.startDiscordOAuth();
    } catch (err) {
      alert('OAuth hatası: ' + err.message);
    }
  });

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
    });
  });

  logoutBtn.addEventListener('click', async () => {
    await window.wk.logout();
    location.reload();
  });

  minimizeBtn.addEventListener('click', () => window.wk.minimize());
  closeBtn.addEventListener('click', () => window.wk.close());

  // OAuth success
  window.wk.onOAuthSuccess((user) => {
    showUser(user);
  });

  // Progress
  window.wk.onDownloadProgress((data) => {
    const progressEl = document.getElementById(`progress-${data.gameId}`);
    if (progressEl) {
      progressEl.style.display = 'block';
      progressEl.querySelector('.progress-bar').style.width = data.progress + '%';
    }
  });

  // Güncelleme
  window.wk.onGameUpdateAvailable((data) => {
    alert(`${data.gameId} için yeni sürüm: ${data.latest}`);
  });
});

async function loadGames() {
  const games = await window.wk.getGames();
  gamesList.innerHTML = '';
  games.forEach((game, index) => {
    const gameCard = document.createElement('div');
    gameCard.className = 'game-card';
    gameCard.style.animationDelay = `${index * 0.1}s`;
    gameCard.innerHTML = `
      <img src="${game.image}" alt="${game.name}" />
      <h3>${game.name}</h3>
      <p>${game.description}</p>
      <button class="download-btn" data-gameid="${game.id}">İndir</button>
      <button class="launch-btn" data-gameid="${game.id}" disabled>Başlat</button>
      <div class="progress" id="progress-${game.id}" style="display:none;"><div class="progress-bar"></div></div>
    `;
    gamesList.appendChild(gameCard);
  });

  // İndirme ve başlatma
  gamesList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('download-btn')) {
      const gameId = e.target.dataset.gameid;
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'İndiriliyor...';
      try {
        await window.wk.downloadGame(gameId);
        btn.style.display = 'none';
        document.querySelector(`[data-gameid="${gameId}"].launch-btn`).disabled = false;
      } catch (err) {
        alert('İndirme hatası: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'İndir';
      }
    } else if (e.target.classList.contains('launch-btn')) {
      const gameId = e.target.dataset.gameid;
      try {
        await window.wk.launchGame(gameId);
      } catch (err) {
        alert('Başlatma hatası: ' + err.message);
      }
    }
  });
}

function showUser(user) {
  userAvatar.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  userName.textContent = user.username;
  loginBtn.style.display = 'none';
  userInfo.style.display = 'block';
}

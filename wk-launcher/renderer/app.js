const splash = document.getElementById('splash');
const appEl = document.getElementById('app');

const btnClose = document.getElementById('btnClose');
const btnMin = document.getElementById('btnMin');
const btnMax = document.getElementById('btnMax');

const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');

const avatar = document.getElementById('avatar');
const username = document.getElementById('username');
const userhint = document.getElementById('userhint');

const newsList = document.getElementById('newsList');
const downloadsList = document.getElementById('downloadsList');
const usersList = document.getElementById('usersList');
const dlStatus = document.getElementById('dlStatus');

function showApp() {
  splash.style.opacity = '0';
  setTimeout(() => {
    splash.style.display = 'none';
    appEl.style.display = 'flex';
  }, 250);
}

function setUser(u) {
  if (!u) {
    avatar.src = 'https://via.placeholder.com/64';
    username.textContent = 'Misafir';
    userhint.textContent = 'Discord ile giriş yap';
    btnLogin.style.display = '';
    btnLogout.style.display = 'none';
    return;
  }
  const av = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : 'https://via.placeholder.com/64';
  avatar.src = av;
  username.textContent = u.discriminator ? `${u.username}#${u.discriminator}` : u.username;
  userhint.textContent = u.email ? u.email : 'Giriş yapıldı';
  btnLogin.style.display = 'none';
  btnLogout.style.display = '';
}

async function loadAuth() {
  const auth = await window.wk.authGet();
  setUser(auth?.user || null);
}

function bindTabs() {
  const buttons = Array.from(document.querySelectorAll('.navbtn'));
  const tabs = {
    news: document.getElementById('tab-news'),
    downloads: document.getElementById('tab-downloads'),
    users: document.getElementById('tab-users'),
    settings: document.getElementById('tab-settings')
  };

  buttons.forEach(b => b.addEventListener('click', () => {
    buttons.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    Object.values(tabs).forEach(t => t.classList.remove('active'));
    tabs[b.dataset.tab].classList.add('active');
  }));
}

function card({ title, meta, body, actionsHtml }) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div class="card-title">${title || ''}</div>
    ${meta ? `<div class="card-meta">${meta}</div>` : ''}
    ${body ? `<div>${body}</div>` : ''}
    ${actionsHtml ? `<div class="card-actions">${actionsHtml}</div>` : ''}
  `;
  return el;
}

async function loadNews() {
  newsList.innerHTML = '';
  const data = await window.wk.newsGet();
  const items = data?.items || [];

  if (!items.length) {
    newsList.appendChild(card({
      title: 'Duyuru yok',
      meta: data?.error ? `Kaynak hatası: ${data.error}` : 'Henüz içerik eklenmedi.',
      body: 'GitHub repo içine launcher/news.json ekleyerek duyuruları yönetebilirsiniz.'
    }));
    return;
  }

  items.forEach(it => {
    newsList.appendChild(card({
      title: it.title,
      meta: it.date ? String(it.date) : '',
      body: it.text || ''
    }));
  });
}

const downloadProgress = new Map();

async function loadDownloads() {
  downloadsList.innerHTML = '';
  dlStatus.textContent = '';
  const data = await window.wk.downloadsGet();
  const items = data?.items || [];

  if (!items.length) {
    downloadsList.appendChild(card({
      title: 'İndirme yok',
      meta: data?.error ? `Kaynak hatası: ${data.error}` : 'Henüz içerik eklenmedi.',
      body: 'GitHub repo içine launcher/downloads.json ekleyerek indirmeleri yönetebilirsiniz.'
    }));
    return;
  }

  items.forEach(it => {
    const id = it.id;
    const el = card({
      title: it.name,
      meta: it.version ? `Sürüm: ${it.version}` : '',
      body: it.description || '',
      actionsHtml: `
        <button class="btn primary" data-dl="${id}">İndir</button>
        <div class="progress"><div class="bar" id="bar-${id}"></div></div>
      `
    });
    downloadsList.appendChild(el);
  });

  downloadsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-dl]');
    if (!btn) return;

    const id = btn.getAttribute('data-dl');
    const it = items.find(x => x.id === id);
    if (!it) return;

    btn.disabled = true;
    btn.textContent = 'İndiriliyor…';
    dlStatus.textContent = '';

    try {
      await window.wk.downloadRun({
        id: it.id,
        url: it.url,
        extract: !!it.extract,
        targetDir: it.targetDir || it.id,
        fileName: it.fileName || undefined
      });
      btn.textContent = 'Tamam';
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'İndir';
      dlStatus.textContent = String(err?.message || err);
    }
  }, { once: true });
}

function setBar(id, p) {
  const bar = document.getElementById(`bar-${id}`);
  if (!bar) return;
  if (p === -1) {
    // content-length bilinmiyor → animasyonlu “marquee” yok; minimum görsel
    bar.style.width = '25%';
    bar.style.opacity = '0.6';
    return;
  }
  bar.style.opacity = '1';
  bar.style.width = `${Math.max(0, Math.min(100, p))}%`;
}

async function loadUsers() {
  usersList.innerHTML = '';
  const users = await window.wk.usersRecent();
  if (!users.length) {
    usersList.appendChild(card({ title: 'Henüz kimse giriş yapmadı', meta: '', body: 'Bu cihazda yapılan girişler burada görünür.' }));
    return;
  }
  users.forEach(u => {
    const when = new Date(u.lastLoginAt).toLocaleString();
    usersList.appendChild(card({
      title: u.discriminator ? `${u.username}#${u.discriminator}` : u.username,
      meta: `Son giriş: ${when}`,
      body: u.id
    }));
  });
}

async function main() {
  // Splash her koşulda kalksın
  setTimeout(showApp, 650);

  // titlebar
  btnClose.addEventListener('click', () => window.wk.winClose());
  btnMin.addEventListener('click', () => window.wk.winMinimize());
  btnMax.addEventListener('click', () => window.wk.winToggleMaximize());

  bindTabs();

  // auth
  await loadAuth();
  window.wk.onDiscordLoggedIn(async () => {
    await loadAuth();
    await loadUsers();
  });

  btnLogin.addEventListener('click', async () => {
    try { await window.wk.discordLogin(); }
    catch (e) { dlStatus.textContent = String(e?.message || e); }
  });

  btnLogout.addEventListener('click', async () => {
    await window.wk.authLogout();
    await loadAuth();
  });

  // content
  await loadNews();
  await loadDownloads();
  await loadUsers();

  // progress
  window.wk.onDownloadProgress((d) => {
    downloadProgress.set(d.id, d.progress);
    setBar(d.id, d.progress);
  });
}

main();

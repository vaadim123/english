// ============================================================
//  WordFlash — English Flashcard App
//  Author: Claude / Anthropic
// ============================================================

// ===== CONSTANTS =====

const AVATARS = [
  '🦁','🐯','🦊','🐺','🐻','🦅','🐧','🦋',
  '🐉','🦄','⭐','🚀','🎯','🌈','🎸','🏆',
  '👦','👧','🧒','👨','👩','🧑'
];

const COLORS = [
  '#FF6B6B','#FF8E53','#FFC107','#4CAF50',
  '#2196F3','#9C27B0','#E91E63','#00BCD4',
  '#FF5722','#607D8B','#8BC34A','#795548'
];

const ACHIEVEMENTS = [
  { id:'first_word',    icon:'📝', name:'Перше слово',    desc:'Додав перше слово до словника' },
  { id:'words_10',      icon:'📚', name:'Початківець',    desc:'10 слів у словнику' },
  { id:'words_25',      icon:'🎓', name:'Учень',           desc:'25 слів у словнику' },
  { id:'words_50',      icon:'🏆', name:'Знавець',         desc:'50 слів у словнику' },
  { id:'words_100',     icon:'👑', name:'Ерудит',          desc:'100 слів у словнику' },
  { id:'first_session', icon:'🃏', name:'Перший урок',    desc:'Завершив перше заняття' },
  { id:'sessions_5',    icon:'🌟', name:'Старанний',       desc:'5 занять завершено' },
  { id:'sessions_20',   icon:'💎', name:'Посидючий',       desc:'20 занять завершено' },
  { id:'perfect',       icon:'🔥', name:'Відмінник',       desc:'Всі слова з першого разу!' },
  { id:'streak_3',      icon:'🎯', name:'3 дні поспіль',  desc:'Займався 3 дні поспіль' },
  { id:'streak_7',      icon:'🌈', name:'Тиждень',         desc:'Займався 7 днів поспіль' },
  { id:'streak_30',     icon:'🎖️', name:'Місяць',         desc:'Займався 30 днів поспіль' },
];

const MOTIVATIONAL = [
  '🌟 Ти молодець!', '💪 Відмінно!', '🚀 Так тримати!',
  '⭐ Неймовірно!', '🏆 Ти зірка!', '🎉 Браво!', '👏 Клас!'
];

const ENCOURAGEMENTS = {
  high: ['🌟 Ти справжня зірка!','🏆 Чудовий результат!','🚀 Ти молодець!','💪 Відмінна робота!'],
  mid:  ['👏 Непоганий результат!','📈 Ти прогресуєш!','💡 Ще трошки практики!','😊 Гарна робота!'],
  low:  ['💪 Не здавайся!','📚 Практика — шлях до успіху!','🔄 Спробуй ще раз!','⭐ Ти впораєшся!'],
};

// ===== STATE =====

const S = {
  profiles: [],
  profileId: null,
  view: 'profiles',
  params: {},
  session: null,
  dictSearch: '',
  dictSelected: new Set(),
  pendingToast: null,
  _confettiDone: false,
  syncStatus: 'idle', // idle | syncing | ok | error
};

// ===== GITHUB STORAGE =====

const GH = {
  token()    { return localStorage.getItem('wf_gh_token') || (typeof _GH_T !== 'undefined' ? _GH_T.trim() : ''); },
  setToken(t){ localStorage.setItem('wf_gh_token', t.trim()); },
  clearToken(){ localStorage.removeItem('wf_gh_token'); },

  rawUrl()  { return `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_DATA_PATH}?t=${Date.now()}`; },
  apiUrl()  { return `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_DATA_PATH}`; },
  headers() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    const t = this.token();
    if (t) h['Authorization'] = `token ${t}`;
    return h;
  },

  async pull() {
    try {
      const res = await fetch(this.rawUrl());
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  },

  async push() {
    const token = this.token();
    if (!token) return false;

    S.syncStatus = 'syncing';
    updateSyncBadge();

    const text    = JSON.stringify(S.profiles, null, 2);
    const content = btoa(unescape(encodeURIComponent(text)));

    // Need current SHA to update existing file
    let sha = null;
    try {
      const r = await fetch(this.apiUrl(), { headers: this.headers() });
      if (r.ok) sha = (await r.json()).sha;
    } catch {}

    try {
      const body = {
        message: `WordFlash sync ${new Date().toISOString().slice(0,10)}`,
        content,
        branch: GH_BRANCH,
      };
      if (sha) body.sha = sha;

      const r = await fetch(this.apiUrl(), {
        method: 'PUT',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      S.syncStatus = r.ok ? 'ok' : 'error';
      updateSyncBadge();
      return r.ok;
    } catch {
      S.syncStatus = 'error';
      updateSyncBadge();
      return false;
    }
  },
};

// Debounced GitHub push — triggered after every saveData()
let _syncTimer = null;
function schedulePush() {
  if (!GH.token()) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    const ok = await GH.push();
    if (ok) showToast('☁️ Дані збережено в GitHub!');
    else    showToast('⚠️ GitHub: не вдалося синхронізувати');
  }, 4000);
}

function updateSyncBadge() {
  const badge = document.getElementById('sync-badge');
  if (!badge) return;
  const map = { idle:'', syncing:'🔄', ok:'☁️', error:'⚠️' };
  badge.textContent = map[S.syncStatus] || '';
}

// ===== STORAGE =====

const DB_KEY = 'wordflash_v2';

async function loadData() {
  // 1. Load from localStorage (instant)
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) S.profiles = JSON.parse(raw);
  } catch { S.profiles = []; }

  // 2. Pull from GitHub if token is set (may be newer / from another device)
  if (GH.token()) {
    const ghData = await GH.pull();
    if (ghData && Array.isArray(ghData)) {
      S.profiles = ghData;
      localStorage.setItem(DB_KEY, JSON.stringify(S.profiles));
      render(); // re-render with fresh cloud data
    }
  }
}

function saveData() {
  localStorage.setItem(DB_KEY, JSON.stringify(S.profiles));
  schedulePush(); // async push to GitHub after 4s debounce
}

// ===== HELPERS =====

function uid() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('uk-UA', { day:'numeric', month:'short', year:'numeric' });
}

function fmtDuration(secs) {
  if (secs < 60) return `${secs} сек`;
  return `${Math.floor(secs/60)} хв ${secs%60} сек`;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== GETTERS =====

function getProfile()           { return S.profiles.find(p => p.id === S.profileId) || null; }
function getWord(id)            { const p=getProfile(); return p ? p.words.find(w=>w.id===id) : null; }
function getLevel(xp)           { return Math.floor((xp||0)/50)+1; }
function getXpInLevel(xp)       { return (xp||0) % 50; }

// ===== PROFILE OPS =====

function createProfile(name, avatar, color) {
  const p = {
    id: uid(), name, avatar, color,
    words: [], sessions: [],
    streak: 0, bestStreak: 0, lastStudied: null,
    achievements: [], xp: 0,
  };
  S.profiles.push(p);
  saveData();
  return p;
}

function deleteProfile(id) {
  if (!confirm('Видалити профіль? Всі слова та статистика будуть втрачені.')) return;
  S.profiles = S.profiles.filter(p => p.id !== id);
  saveData();
  render();
}

function addXP(profile, amount) {
  const prev = getLevel(profile.xp);
  profile.xp = (profile.xp||0) + amount;
  const next = getLevel(profile.xp);
  if (next > prev) showToast(`🎉 Рівень ${next}! Вітаємо!`);
}

function updateStreak(profile) {
  const t = today();
  if (!profile.lastStudied) {
    profile.streak = 1;
  } else if (profile.lastStudied === t) {
    return;
  } else {
    const diff = Math.round((new Date(t) - new Date(profile.lastStudied)) / 86400000);
    profile.streak = diff === 1 ? profile.streak + 1 : 1;
  }
  profile.bestStreak = Math.max(profile.bestStreak || 0, profile.streak);
  profile.lastStudied = t;
}

function checkAchievements(profile) {
  const earned = [];
  const give = id => {
    if (!profile.achievements.includes(id)) {
      profile.achievements.push(id);
      earned.push(id);
    }
  };
  const wc = profile.words.length;
  const sc = profile.sessions.length;
  if (wc >= 1)   give('first_word');
  if (wc >= 10)  give('words_10');
  if (wc >= 25)  give('words_25');
  if (wc >= 50)  give('words_50');
  if (wc >= 100) give('words_100');
  if (sc >= 1)   give('first_session');
  if (sc >= 5)   give('sessions_5');
  if (sc >= 20)  give('sessions_20');
  if (profile.streak >= 3)  give('streak_3');
  if (profile.streak >= 7)  give('streak_7');
  if (profile.streak >= 30) give('streak_30');
  if (sc > 0) {
    const last = profile.sessions[sc-1];
    if (last && last.knownFirst === last.totalWords && last.totalWords > 0) give('perfect');
  }
  return earned;
}

// ===== WORD OPS =====

function getDifficulty(w) {
  const t = w.timesKnown + w.timesUnknown;
  if (t === 0) return 'new';
  const r = w.timesKnown / t;
  if (r >= 0.8) return 'easy';
  if (r >= 0.5) return 'medium';
  return 'hard';
}

function difficultyBadge(w) {
  const map = {
    new:    ['diff-new',    '🆕'],
    easy:   ['diff-easy',   '😊'],
    medium: ['diff-medium', '🤔'],
    hard:   ['diff-hard',   '😅'],
  };
  const [cls, icon] = map[getDifficulty(w)];
  return `<span class="word-difficulty ${cls}">${icon}</span>`;
}

// ===== STUDY SESSION =====

function startSession(wordIds, direction) {
  const profile = getProfile();
  if (!profile || wordIds.length === 0) return;

  const words = wordIds.map(id => profile.words.find(w => w.id === id)).filter(Boolean);
  S.session = {
    allWords: words,
    queue: shuffle([...words]),
    completed: [],
    direction: direction || 'en-ua',
    isFlipped: false,
    startTime: Date.now(),
    knownFirst: 0,
    attempts: {},  // wordId → count
  };
  go('study');
}

function currentCard() {
  const s = S.session;
  return s && s.queue.length > 0 ? s.queue[0] : null;
}

function actionKnow() {
  const s = S.session;
  const word = currentCard();
  if (!word) return;

  word.timesStudied++;
  word.timesKnown++;
  s.completed.push(word);
  if (!s.attempts[word.id]) s.knownFirst++;

  addXP(getProfile(), 10);
  saveData();

  s.queue.shift();
  s.isFlipped = false;

  // Visual feedback
  const wrap = document.querySelector('.flashcard-wrap');
  if (wrap) {
    wrap.classList.add('card-success');
    setTimeout(() => { wrap && wrap.classList.remove('card-success'); }, 300);
  }

  if (s.queue.length === 0) {
    finishSession();
  } else {
    updateStudyCard();
  }
}

function actionUnknown() {
  const s = S.session;
  const word = currentCard();
  if (!word) return;

  word.timesStudied++;
  word.timesUnknown++;
  s.attempts[word.id] = (s.attempts[word.id] || 0) + 1;

  addXP(getProfile(), 2);
  saveData();

  s.queue.shift();
  s.queue.push(word);  // word goes to end of queue
  s.isFlipped = false;

  // Shake animation
  const fc = document.querySelector('.flashcard');
  if (fc) {
    fc.classList.remove('flipped');
    const wrap = document.querySelector('.flashcard-wrap');
    if (wrap) {
      wrap.classList.add('card-shake');
      setTimeout(() => { wrap && wrap.classList.remove('card-shake'); }, 500);
    }
  }

  setTimeout(updateStudyCard, 50);
}

function actionFlip() {
  const s = S.session;
  s.isFlipped = !s.isFlipped;
  const fc = document.querySelector('.flashcard');
  if (fc) fc.classList.toggle('flipped', s.isFlipped);
  const flipBtn = document.querySelector('[data-action="flip"]');
  if (flipBtn) flipBtn.textContent = s.isFlipped ? '🙈 Сховати' : '👁️ Подивитись переклад';
}

function updateStudyCard() {
  const s = S.session;
  const word = currentCard();
  if (!word) return;

  const total = s.allWords.length;
  const done  = s.completed.length;
  const pct   = Math.round(done / total * 100);

  // Update progress
  const ptxt = document.querySelector('.study-count');
  if (ptxt) ptxt.textContent = `✅ ${done} / ${total} слів`;

  const pbar = document.querySelector('.progress-fill');
  if (pbar) pbar.style.width = pct + '%';

  const rem = document.querySelector('.study-remaining');
  if (rem) rem.textContent = `🔄 В черзі: ${s.queue.length}`;

  // Update card content
  const front = document.querySelector('.fc-front .fc-word');
  const back  = document.querySelector('.fc-back  .fc-word');
  const ftag  = document.querySelector('.fc-front .fc-lang-tag');
  const btag  = document.querySelector('.fc-back  .fc-lang-tag');

  if (s.direction === 'en-ua') {
    if (front) front.textContent = word.english;
    if (back)  back.textContent  = word.ukrainian;
    if (ftag)  ftag.textContent  = '🇬🇧 English';
    if (btag)  btag.textContent  = '🇺🇦 Українська';
  } else {
    if (front) front.textContent = word.ukrainian;
    if (back)  back.textContent  = word.english;
    if (ftag)  ftag.textContent  = '🇺🇦 Українська';
    if (btag)  btag.textContent  = '🇬🇧 English';
  }

  // Reset flip
  const fc = document.querySelector('.flashcard');
  if (fc) fc.classList.remove('flipped');
  const flipBtn = document.querySelector('[data-action="flip"]');
  if (flipBtn) flipBtn.textContent = '👁️ Подивитись переклад';
}

function finishSession() {
  const s   = S.session;
  const p   = getProfile();
  if (!p) return;

  const duration = Math.round((Date.now() - s.startTime) / 1000);
  const session  = {
    id: uid(),
    date: today(),
    direction: s.direction,
    totalWords: s.allWords.length,
    knownFirst: s.knownFirst,
    duration,
  };

  p.sessions.push(session);
  updateStreak(p);
  const newAch = checkAchievements(p);
  addXP(p, 50);
  saveData();

  S.params = { session, newAch };
  go('complete');
}

// ===== NAVIGATION =====

function go(view, params = {}) {
  S.view = view;
  S.params = params;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
}

// ===== RENDER ENGINE =====

function render() {
  const el = document.getElementById('app');
  if (!el) return;
  const views = {
    profiles:    viewProfiles,
    newProfile:  viewNewProfile,
    menu:        viewMenu,
    dictionary:  viewDictionary,
    addWord:     viewAddWord,
    editWord:    viewEditWord,
    studySetup:  viewStudySetup,
    study:       viewStudy,
    complete:    viewComplete,
    stats:       viewStats,
    achievements:viewAchievements,
    settings:    viewSettings,
  };
  const fn = views[S.view];
  el.innerHTML = fn ? fn() : '<p>404</p>';
  attachEvents();

  if (S.view === 'complete' && !S._confettiDone) {
    S._confettiDone = true;
    const { session } = S.params || {};
    if (session) {
      const pct = session.totalWords > 0 ? session.knownFirst / session.totalWords : 0;
      const intensity = pct >= 0.9 ? 1.5 : pct >= 0.6 ? 1 : 0.4;
      setTimeout(() => launchConfetti(intensity), 400);
    }
  } else if (S.view !== 'complete') {
    S._confettiDone = false;
  }
}

// ===== VIEW: PROFILES =====

function viewProfiles() {
  const cards = S.profiles.map(p => {
    const wc = p.words.length;
    const sc = p.sessions.length;
    const bar = '#' + p.color.replace('#','');
    return `
    <div class="profile-card" data-action="selectProfile" data-id="${p.id}"
         style="--pc:${p.color}; border-top: 6px solid ${p.color};">
      <button class="profile-delete" data-action="deleteProfile" data-id="${p.id}" title="Видалити">✕</button>
      <span class="profile-avatar">${p.avatar}</span>
      <div class="profile-name">${esc(p.name)}</div>
      <div class="profile-meta">📚 ${wc} слів · 🃏 ${sc} занять</div>
      ${p.streak > 1 ? `<div class="profile-meta">🔥 ${p.streak} днів поспіль</div>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="app-logo">
    <span class="logo-icon">🌟</span>
    <h1>WordFlash</h1>
    <p>Вивчай англійську легко та весело!</p>
  </div>
  <div class="card">
    <div class="section-title">Оберіть профіль</div>
    <div class="profiles-grid">
      ${cards}
      <div class="profile-card profile-card-new" data-action="newProfile">
        <span class="plus-icon">➕</span>
        <span class="new-label">Новий профіль</span>
      </div>
    </div>
  </div>`;
}

// ===== VIEW: NEW PROFILE =====

function viewNewProfile() {
  const selAvatar = S.params.avatar || AVATARS[0];
  const selColor  = S.params.color  || COLORS[0];

  const avatarBtns = AVATARS.map(a =>
    `<div class="avatar-option ${a===selAvatar?'selected':''}" data-action="pickAvatar" data-val="${a}">${a}</div>`
  ).join('');

  const colorBtns = COLORS.map(c =>
    `<div class="color-option ${c===selColor?'selected':''}" data-action="pickColor" data-val="${c}" style="background:${c}"></div>`
  ).join('');

  return `
  <button class="back-btn" data-action="back">← Назад</button>
  <div class="card">
    <div class="section-title">Новий профіль</div>
    <div style="text-align:center;font-size:64px;margin-bottom:8px"
         id="preview-avatar">${selAvatar}</div>
    <div style="width:40px;height:40px;border-radius:50%;background:${selColor};margin:0 auto 20px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2)"
         id="preview-color"></div>

    <div class="form-group">
      <label class="form-label">Ім'я</label>
      <input class="form-input" id="profile-name" type="text" placeholder="Наприклад: Вадим" maxlength="20">
    </div>

    <div class="form-group">
      <label class="form-label">Аватар</label>
      <div class="avatar-grid">${avatarBtns}</div>
    </div>

    <div class="form-group">
      <label class="form-label">Колір</label>
      <div class="color-grid">${colorBtns}</div>
    </div>

    <button class="btn btn-primary btn-block" data-action="createProfile">
      🚀 Створити профіль
    </button>
  </div>`;
}

// ===== VIEW: MENU =====

function viewMenu() {
  const p = getProfile();
  if (!p) { go('profiles'); return ''; }

  const lvl    = getLevel(p.xp);
  const xpIn   = getXpInLevel(p.xp);
  const xpPct  = Math.round(xpIn / 50 * 100);
  const wc     = p.words.length;
  const sc     = p.sessions.length;
  const streak = p.streak || 0;
  const achC   = p.achievements.length;

  return `
  <button class="back-btn" data-action="back">← Профілі</button>
  <div class="card">
    <div class="profile-header">
      <span class="ph-avatar">${p.avatar}</span>
      <div class="ph-info">
        <div class="ph-name">${esc(p.name)}</div>
        <div class="ph-level">⭐ Рівень ${lvl} · ${p.xp || 0} XP</div>
        <div class="xp-bar">
          <div class="xp-bar-fill" style="width:${xpPct}%"></div>
        </div>
      </div>
      <div class="streak-badge">
        <span class="s-icon">🔥</span>
        <span class="s-num">${streak}</span>
        <span class="s-label">днів</span>
      </div>
    </div>

    <div class="menu-grid">
      <button class="menu-btn primary-btn" data-action="goStudySetup">
        <span class="mb-icon">🃏</span>
        <span class="mb-label">Почати навчання</span>
        <span class="mb-sub">${wc > 0 ? `${wc} слів у словнику` : 'Спочатку додай слова'}</span>
      </button>

      <button class="menu-btn" data-action="goDictionary">
        <span class="mb-icon">📚</span>
        <span class="mb-label">Словник</span>
        <span class="mb-sub">${wc} слів</span>
      </button>

      <button class="menu-btn" data-action="goStats">
        <span class="mb-icon">📊</span>
        <span class="mb-label">Статистика</span>
        <span class="mb-sub">${sc} занять</span>
      </button>

      <button class="menu-btn" data-action="goAchievements">
        <span class="mb-icon">🏆</span>
        <span class="mb-label">Досягнення</span>
        <span class="mb-sub">${achC} / ${ACHIEVEMENTS.length}</span>
      </button>

      <button class="menu-btn" data-action="goSettings" style="grid-column:1/-1">
        <span class="mb-icon">⚙️ <span id="sync-badge" style="font-size:18px"></span></span>
        <span class="mb-label">Налаштування та синхронізація</span>
        <span class="mb-sub">${GH.token() ? '☁️ GitHub sync увімкнено' : '💾 Локальне збереження'}</span>
      </button>
    </div>
  </div>`;
}

// ===== VIEW: DICTIONARY =====

function viewDictionary() {
  const p = getProfile();
  if (!p) { go('profiles'); return ''; }

  const q = S.dictSearch.toLowerCase();
  const filtered = p.words.filter(w =>
    !q || w.english.toLowerCase().includes(q) || w.ukrainian.toLowerCase().includes(q)
  );

  const selCount = S.dictSelected.size;

  const rows = filtered.length === 0
    ? `<div class="empty-state">
         <div class="empty-icon">📭</div>
         <p>${p.words.length === 0 ? 'Словник порожній' : 'Нічого не знайдено'}</p>
         <small>${p.words.length === 0 ? 'Додай перше слово!' : 'Спробуй інший запит'}</small>
       </div>`
    : filtered.map(w => {
        const isSel = S.dictSelected.has(w.id);
        return `
        <div class="word-item ${isSel?'selected':''}" data-action="toggleWord" data-id="${w.id}">
          <div class="word-item-check">${isSel?'✓':''}</div>
          <div class="word-item-text">
            <div class="word-en">${esc(w.english)}</div>
            <div class="word-ua">${esc(w.ukrainian)}</div>
          </div>
          ${difficultyBadge(w)}
          <div class="word-actions">
            <button class="icon-btn" data-action="editWord" data-id="${w.id}" title="Редагувати">✏️</button>
            <button class="icon-btn" data-action="deleteWord" data-id="${w.id}" title="Видалити">🗑️</button>
          </div>
        </div>`;
      }).join('');

  // Stats bar
  const hard = p.words.filter(w => getDifficulty(w) === 'hard').length;
  const easy = p.words.filter(w => getDifficulty(w) === 'easy').length;

  return `
  <button class="back-btn" data-action="back">← Меню</button>
  <div class="card">
    <div class="section-title">📚 Словник</div>

    <div class="dict-stats">
      <div class="dict-stat">📝 Всього: <strong>${p.words.length}</strong></div>
      <div class="dict-stat">😊 Легких: <strong>${easy}</strong></div>
      <div class="dict-stat">😅 Важких: <strong>${hard}</strong></div>
    </div>

    <div class="dict-toolbar">
      <input class="search-input flex-1" type="search" id="dict-search"
             placeholder="🔍 Пошук слова..." value="${esc(S.dictSearch)}">
      <button class="btn btn-primary btn-sm" data-action="addWord">➕ Додати</button>
    </div>

    <div class="dict-actions" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-outline btn-sm" data-action="selectAll">☑ Всі</button>
      <button class="btn btn-outline btn-sm" data-action="deselectAll">☐ Зняти</button>
      ${selCount > 0
        ? `<span style="font-size:13px;font-weight:700;color:var(--primary)">Обрано: ${selCount}</span>`
        : ''}
    </div>

    <div class="word-list">${rows}</div>

    <div class="dict-footer">
      <button class="btn btn-success flex-1" data-action="studySelected"
              ${selCount === 0 && p.words.length === 0 ? 'disabled' : ''}>
        🃏 ${selCount > 0 ? `Вчити обрані (${selCount})` : 'Вчити всі слова'}
      </button>
    </div>
  </div>`;
}

// ===== VIEW: ADD WORD =====

function viewAddWord() {
  return `
  <button class="back-btn" data-action="back">← Словник</button>
  <div class="card">
    <div class="section-title">➕ Нове слово</div>
    <div class="form-group">
      <label class="form-label">🇬🇧 Англійською</label>
      <input class="form-input" id="word-en" type="text" placeholder="apple" autocomplete="off" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">🇺🇦 Українською</label>
      <input class="form-input" id="word-ua" type="text" placeholder="яблуко" autocomplete="off">
    </div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-outline flex-1" data-action="back">Скасувати</button>
      <button class="btn btn-primary flex-1" data-action="saveWord">💾 Зберегти</button>
    </div>
    <div style="margin-top:20px;padding-top:16px;border-top:2px solid #F3F4F6">
      <div class="form-label" style="margin-bottom:10px">📋 Або додати декілька слів одразу:</div>
      <div style="font-size:13px;color:var(--text-light);font-weight:600;margin-bottom:8px">
        По одній парі на рядок: <code style="background:#F3F4F6;padding:2px 6px;border-radius:4px">apple - яблуко</code>
      </div>
      <textarea class="form-input" id="bulk-input" rows="5"
                placeholder="apple - яблуко&#10;dog - собака&#10;cat - кіт"></textarea>
      <button class="btn btn-outline btn-block mt-8" data-action="saveBulk">📥 Додати всі</button>
    </div>
  </div>`;
}

// ===== VIEW: EDIT WORD =====

function viewEditWord() {
  const word = getWord(S.params.wordId);
  if (!word) { go('dictionary'); return ''; }
  return `
  <button class="back-btn" data-action="back">← Словник</button>
  <div class="card">
    <div class="section-title">✏️ Редагувати слово</div>
    <div class="form-group">
      <label class="form-label">🇬🇧 Англійською</label>
      <input class="form-input" id="word-en" type="text" value="${esc(word.english)}" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">🇺🇦 Українською</label>
      <input class="form-input" id="word-ua" type="text" value="${esc(word.ukrainian)}">
    </div>
    <div style="background:#F9FAFB;border-radius:14px;padding:14px;margin-bottom:16px;font-size:13px;color:var(--text-light);font-weight:600">
      📈 Статистика: показано ${word.timesStudied || 0} разів ·
      ✅ знав ${word.timesKnown || 0} · ❌ не знав ${word.timesUnknown || 0}
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-outline flex-1" data-action="back">Скасувати</button>
      <button class="btn btn-primary flex-1" data-action="updateWord" data-id="${word.id}">💾 Зберегти</button>
    </div>
  </div>`;
}

// ===== VIEW: STUDY SETUP =====

function viewStudySetup() {
  const p = getProfile();
  if (!p) { go('profiles'); return ''; }

  const selCount = S.dictSelected.size;
  const wordCount = selCount > 0 ? selCount : p.words.length;
  const dir = S.params.direction || 'en-ua';

  if (p.words.length === 0) {
    return `
    <button class="back-btn" data-action="back">← Меню</button>
    <div class="card text-center">
      <div style="font-size:64px;margin-bottom:16px">📭</div>
      <div class="section-title">Словник порожній</div>
      <p style="color:var(--text-light);font-weight:600;margin-bottom:20px">
        Спочатку додай слова до словника!
      </p>
      <button class="btn btn-primary btn-block" data-action="goDictionary">📚 Відкрити словник</button>
    </div>`;
  }

  return `
  <button class="back-btn" data-action="back">← Меню</button>
  <div class="card">
    <div class="section-title">🃏 Налаштування заняття</div>

    <div class="form-label" style="margin-bottom:10px">Напрямок перекладу:</div>
    <div class="direction-choice">
      <button class="dir-btn ${dir==='en-ua'?'selected':''}" data-action="setDir" data-dir="en-ua">
        <div class="dir-icon">🇬🇧➡️🇺🇦</div>
        <div class="dir-label">English → Українська</div>
        <div class="dir-sub">Бачиш англійське слово</div>
      </button>
      <button class="dir-btn ${dir==='ua-en'?'selected':''}" data-action="setDir" data-dir="ua-en">
        <div class="dir-icon">🇺🇦➡️🇬🇧</div>
        <div class="dir-label">Українська → English</div>
        <div class="dir-sub">Бачиш українське слово</div>
      </button>
    </div>

    <div class="word-count-info">
      <span class="wci-icon">📝</span>
      <div class="wci-text">
        <div class="wci-num">${wordCount} слів</div>
        <div class="wci-label">${selCount > 0 ? 'вибрані в словнику' : 'всього в словнику'}</div>
      </div>
    </div>

    ${selCount > 0 ? `
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <button class="btn btn-success flex-1" data-action="startSelected">
        🎯 Вчити обрані (${selCount})
      </button>
      <button class="btn btn-outline" data-action="startAll">Всі ${p.words.length}</button>
    </div>` : `
    <button class="btn btn-primary btn-block" style="margin-bottom:12px" data-action="startAll">
      🚀 Почати! (${p.words.length} слів)
    </button>`}

    ${selCount > 0 ? '' : `
    <button class="btn btn-outline btn-block btn-sm" data-action="goDictionary">
      ☑ Вибрати конкретні слова
    </button>`}
  </div>`;
}

// ===== VIEW: STUDY =====

function viewStudy() {
  const s = S.session;
  if (!s) { go('menu'); return ''; }

  const word  = currentCard();
  if (!word)  { finishSession(); return ''; }

  const total = s.allWords.length;
  const done  = s.completed.length;
  const pct   = Math.round(done / total * 100);

  const frontWord = s.direction === 'en-ua' ? word.english  : word.ukrainian;
  const backWord  = s.direction === 'en-ua' ? word.ukrainian : word.english;
  const frontLang = s.direction === 'en-ua' ? '🇬🇧 English' : '🇺🇦 Українська';
  const backLang  = s.direction === 'en-ua' ? '🇺🇦 Українська' : '🇬🇧 English';

  return `
  <div class="study-header">
    <button class="back-btn" style="margin-bottom:0" data-action="quitStudy">← Вийти</button>
    <div class="study-info">
      <div class="study-count">✅ ${done} / ${total} слів</div>
      <div class="study-remaining">🔄 В черзі: ${s.queue.length}</div>
    </div>
  </div>

  <div class="progress-bar">
    <div class="progress-fill" style="width:${pct}%"></div>
  </div>

  <div class="flashcard-wrap" data-action="flip">
    <div class="flashcard">
      <div class="fc-face fc-front">
        <div class="fc-lang-tag">${frontLang}</div>
        <div class="fc-word">${esc(frontWord)}</div>
        <div class="fc-tip">👆 Натисни або кнопку нижче</div>
      </div>
      <div class="fc-face fc-back">
        <div class="fc-lang-tag">${backLang}</div>
        <div class="fc-word">${esc(backWord)}</div>
        <div class="fc-tip">Ти знаєш це слово?</div>
      </div>
    </div>
  </div>

  <div class="study-btns">
    <div class="study-btns-row">
      <button class="study-btn btn-know"    data-action="know">✅ Знаю!</button>
      <button class="study-btn btn-unknown" data-action="unknown">❌ Не знаю</button>
    </div>
    <button class="study-btn btn-flip" data-action="flip">👁️ Подивитись переклад</button>
    <button class="study-btn btn-quit" data-action="quitStudy">⏹ Завершити заняття</button>
  </div>`;
}

// ===== VIEW: COMPLETE =====

function viewComplete() {
  const { session, newAch } = S.params;
  if (!session) { go('menu'); return ''; }

  const pct   = session.totalWords > 0
                ? Math.round(session.knownFirst / session.totalWords * 100) : 0;
  const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : pct >= 30 ? 1 : 0;
  const emoji = stars === 3 ? '🏆' : stars === 2 ? '🌟' : stars === 1 ? '😊' : '💪';
  const msg   = pick(pct>=80 ? ENCOURAGEMENTS.high : pct>=50 ? ENCOURAGEMENTS.mid : ENCOURAGEMENTS.low);
  const dirLabel = session.direction === 'en-ua' ? 'EN → UA' : 'UA → EN';

  const starsHtml = [1,2,3].map(i =>
    `<span class="star ${i<=stars?'lit':''}">⭐</span>`
  ).join('');

  const achHtml = (newAch && newAch.length > 0)
    ? `<div class="achievements-earned">
         <h4>🎖️ Нові досягнення!</h4>
         ${newAch.map(id => {
           const a = ACHIEVEMENTS.find(x=>x.id===id);
           return a ? `<div class="achievement-badge">
             <span class="ab-icon">${a.icon}</span>
             <div class="ab-info">
               <div class="ab-name">${a.name}</div>
               <div class="ab-desc">${a.desc}</div>
             </div>
           </div>` : '';
         }).join('')}
       </div>`
    : '';

  return `
  <div class="card">
    <div class="complete-hero">
      <span class="complete-emoji">${emoji}</span>
      <div class="complete-title">${msg}</div>
      <div class="complete-subtitle">Заняття завершено · ${dirLabel}</div>
    </div>

    <div class="stars">${starsHtml}</div>

    <div class="result-grid">
      <div class="result-item">
        <div class="ri-num">${session.totalWords}</div>
        <div class="ri-label">Карток</div>
      </div>
      <div class="result-item">
        <div class="ri-num" style="color:var(--success)">${session.knownFirst}</div>
        <div class="ri-label">З першого разу</div>
      </div>
      <div class="result-item">
        <div class="ri-num">${session.totalWords - session.knownFirst}</div>
        <div class="ri-label">Потребують практики</div>
      </div>
    </div>

    <div class="result-grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <div class="result-item">
        <div class="ri-num">${pct}%</div>
        <div class="ri-label">Результат</div>
      </div>
      <div class="result-item">
        <div class="ri-num">${fmtDuration(session.duration)}</div>
        <div class="ri-label">Час заняття</div>
      </div>
    </div>

    <div class="text-center" style="margin-bottom:16px">
      <span class="xp-gained">⚡ +${50 + session.knownFirst * 10} XP отримано!</span>
    </div>

    ${achHtml}

    <div style="display:flex;gap:10px">
      <button class="btn btn-outline flex-1" data-action="back">← Меню</button>
      <button class="btn btn-primary flex-1" data-action="studyAgain">🔄 Ще раз</button>
    </div>
  </div>`;
}

// ===== VIEW: STATS =====

function viewStats() {
  const p = getProfile();
  if (!p) { go('profiles'); return ''; }

  const wc  = p.words.length;
  const sc  = p.sessions.length;
  const lvl = getLevel(p.xp);
  const totalKnown = p.sessions.reduce((a, s) => a + (s.knownFirst||0), 0);
  const avgPct = sc > 0
    ? Math.round(p.sessions.reduce((a,s) => a + (s.totalWords > 0 ? s.knownFirst/s.totalWords : 0), 0) / sc * 100)
    : 0;

  const recent = [...p.sessions].reverse().slice(0, 8);
  const sessionRows = recent.length === 0
    ? `<div class="empty-state"><div class="empty-icon">🃏</div><p>Занять ще не було</p></div>`
    : recent.map(s => {
        const pct = s.totalWords > 0 ? Math.round(s.knownFirst/s.totalWords*100) : 0;
        const icon = pct >= 80 ? '🏆' : pct >= 50 ? '⭐' : '📚';
        const dirLabel = s.direction === 'en-ua' ? '🇬🇧→🇺🇦' : '🇺🇦→🇬🇧';
        return `
        <div class="session-item">
          <span class="session-icon">${icon}</span>
          <div class="session-info">
            <div class="session-date">${fmtDate(s.date)} · ${dirLabel}</div>
            <div class="session-meta">${s.totalWords} карток · ${fmtDuration(s.duration||0)}</div>
          </div>
          <div class="session-score">${pct}%</div>
        </div>`;
      }).join('');

  // Hard words
  const hardWords = p.words
    .filter(w => (w.timesUnknown || 0) > 0)
    .sort((a,b) => (b.timesUnknown||0) - (a.timesUnknown||0))
    .slice(0, 5);

  const hardList = hardWords.length === 0
    ? `<p style="color:var(--text-muted);font-size:13px;font-weight:600;text-align:center">Поки немає важких слів 🎉</p>`
    : hardWords.map(w => `
      <div class="word-item" style="pointer-events:none">
        <div class="word-item-text">
          <div class="word-en">${esc(w.english)}</div>
          <div class="word-ua">${esc(w.ukrainian)}</div>
        </div>
        ${difficultyBadge(w)}
        <span style="font-size:12px;font-weight:700;color:var(--danger)">❌ ${w.timesUnknown}x</span>
      </div>`).join('');

  return `
  <button class="back-btn" data-action="back">← Меню</button>
  <div class="card">
    <div class="section-title">📊 Статистика</div>

    <div class="stats-hero">
      <div class="stat-box">
        <div class="sb-icon">📚</div>
        <div class="sb-num">${wc}</div>
        <div class="sb-label">Слів у словнику</div>
      </div>
      <div class="stat-box">
        <div class="sb-icon">🃏</div>
        <div class="sb-num">${sc}</div>
        <div class="sb-label">Занять</div>
      </div>
      <div class="stat-box">
        <div class="sb-icon">🔥</div>
        <div class="sb-num">${p.streak || 0}</div>
        <div class="sb-label">Поточна серія</div>
      </div>
      <div class="stat-box">
        <div class="sb-icon">🏆</div>
        <div class="sb-num">${p.bestStreak || 0}</div>
        <div class="sb-label">Найкраща серія</div>
      </div>
      <div class="stat-box">
        <div class="sb-icon">⭐</div>
        <div class="sb-num">${lvl}</div>
        <div class="sb-label">Рівень</div>
      </div>
      <div class="stat-box">
        <div class="sb-icon">💡</div>
        <div class="sb-num">${avgPct}%</div>
        <div class="sb-label">Середній результат</div>
      </div>
    </div>

    <div class="stats-section-title">😅 Важкі слова</div>
    <div class="word-list" style="max-height:200px">${hardList}</div>

    <div class="stats-section-title">📅 Останні заняття</div>
    <div class="sessions-list">${sessionRows}</div>

    <div style="margin-top:16px">
      <button class="btn btn-outline btn-block btn-sm" data-action="goAchievements">
        🏆 Переглянути досягнення
      </button>
    </div>
  </div>`;
}

// ===== VIEW: ACHIEVEMENTS =====

function viewAchievements() {
  const p = getProfile();
  if (!p) { go('profiles'); return ''; }

  const cards = ACHIEVEMENTS.map(a => {
    const earned = p.achievements.includes(a.id);
    return `
    <div class="ach-card ${earned?'earned':'locked'}">
      <span class="ach-icon">${a.icon}</span>
      <div class="ach-name">${a.name}</div>
      <div class="ach-desc">${a.desc}</div>
      ${earned ? '<div style="font-size:11px;color:#92400E;font-weight:700;margin-top:4px">✅ Отримано!</div>' : ''}
    </div>`;
  }).join('');

  return `
  <button class="back-btn" data-action="back">← Меню</button>
  <div class="card">
    <div class="section-title">🏆 Досягнення</div>
    <div style="font-size:15px;font-weight:700;color:var(--text-light);margin-bottom:16px">
      ${p.achievements.length} / ${ACHIEVEMENTS.length} отримано
    </div>
    <div class="achievements-grid">${cards}</div>
  </div>`;
}

// ===== VIEW: SETTINGS =====

function viewSettings() {
  const hasToken = !!GH.token();
  const syncColor = hasToken ? '#DCFCE7' : '#FEF9C3';
  const syncTextColor = hasToken ? '#15803D' : '#92400E';
  const syncMsg = hasToken
    ? '✅ GitHub sync увімкнено. Дані зберігаються в репозиторії.'
    : '⚠️ Токен не налаштовано. Дані зберігаються тільки в браузері.';

  return `
  <button class="back-btn" data-action="back">← Меню</button>
  <div class="card">
    <div class="section-title">⚙️ Налаштування</div>

    <div style="background:${syncColor};border-radius:14px;padding:14px;margin-bottom:20px;
                font-size:13px;font-weight:700;color:${syncTextColor}">
      ${syncMsg}
    </div>

    <div class="form-group">
      <label class="form-label">🔑 GitHub Personal Access Token</label>
      <div style="font-size:12px;color:var(--text-muted);font-weight:600;margin-bottom:8px;line-height:1.5">
        Токен зберігається тільки в цьому браузері (localStorage).
        Дані синхронізуються в: <strong>${GH_OWNER}/${GH_REPO}</strong>
      </div>
      <input class="form-input" id="gh-token" type="password"
             placeholder="ghp_xxxxxxxxxxxxxxxx"
             value="${hasToken ? '••••••••••••••••' : ''}">
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px">
      <button class="btn btn-primary flex-1" data-action="saveGhToken">💾 Зберегти токен</button>
      ${hasToken ? `<button class="btn btn-danger btn-sm" data-action="clearGhToken">🗑️ Видалити</button>` : ''}
    </div>

    ${hasToken ? `
    <button class="btn btn-success btn-block" style="margin-bottom:12px" data-action="manualSync">
      🔄 Синхронізувати зараз
    </button>` : ''}

    <div style="background:#F0F9FF;border-radius:14px;padding:16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:800;color:#0369A1;margin-bottom:8px">📋 Як отримати токен (2 хвилини):</div>
      <div style="font-size:12px;color:#0369A1;font-weight:600;line-height:1.7">
        1. Зайди на <strong>github.com</strong> → своє фото → <strong>Settings</strong><br>
        2. Зліва внизу: <strong>Developer settings</strong><br>
        3. <strong>Personal access tokens → Fine-grained tokens → Generate new token</strong><br>
        4. <strong>Repository access</strong>: Only selected → обери <strong>${GH_OWNER}/${GH_REPO}</strong><br>
        5. <strong>Permissions → Contents → Read and write</strong><br>
        6. Натисни <strong>Generate token</strong>, скопіюй і встав вище
      </div>
    </div>

    <div style="border-top:2px solid #F3F4F6;padding-top:16px">
      <div class="section-title" style="font-size:16px;margin-bottom:12px">📦 Резервна копія</div>
      <button class="btn btn-outline btn-block" data-action="exportData">
        📥 Скачати дані (JSON)
      </button>
      <label class="btn btn-outline btn-block mt-8" style="cursor:pointer;justify-content:center">
        📤 Відновити з файлу
        <input type="file" id="import-file" accept=".json" style="display:none">
      </label>
    </div>
  </div>`;
}

// ===== EVENT HANDLING =====

function attachEvents() {
  // Delegated click handler
  document.getElementById('app').addEventListener('click', handleClick, { once: true });

  // Search input
  const search = document.getElementById('dict-search');
  if (search) {
    search.addEventListener('input', e => {
      S.dictSearch = e.target.value;
      render();
    });
  }

  // Enter key on forms
  document.addEventListener('keydown', handleKey, { once: true });

  // File import
  const importFile = document.getElementById('import-file');
  if (importFile) {
    importFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!Array.isArray(data)) throw new Error('bad format');
          S.profiles = data;
          saveData();
          showToast('✅ Дані відновлено!');
          go('profiles');
        } catch { showToast('⚠️ Невірний файл!'); }
      };
      reader.readAsText(file);
    });
  }
}

function handleKey(e) {
  if (e.key === 'Enter') {
    const view = S.view;
    if (view === 'addWord' || view === 'editWord') {
      const btn = document.querySelector('[data-action="saveWord"], [data-action="updateWord"]');
      if (btn) btn.click();
    }
  }
  if (e.key === 'ArrowLeft' && S.view === 'study') actionKnow();
  if (e.key === 'ArrowRight' && S.view === 'study') actionUnknown();
  if (e.key === ' ' && S.view === 'study') { e.preventDefault(); actionFlip(); }
}

function handleClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;
  const id     = el.dataset.id;
  const val    = el.dataset.val;

  const actions = {
    // Profile screen
    selectProfile: () => { S.profileId = id; S.dictSelected.clear(); go('menu'); },
    deleteProfile: () => { e.stopPropagation(); deleteProfile(id); },
    newProfile:    () => { S.params = { avatar: AVATARS[0], color: COLORS[0] }; go('newProfile'); },
    pickAvatar:    () => { S.params = { ...S.params, avatar: val }; go('newProfile'); },
    pickColor:     () => { S.params = { ...S.params, color: val }; go('newProfile'); },
    createProfile: () => {
      const name = document.getElementById('profile-name')?.value?.trim();
      if (!name) { showToast('⚠️ Введи ім\'я профілю!'); return; }
      createProfile(name, S.params.avatar || AVATARS[0], S.params.color || COLORS[0]);
      showToast('🎉 Профіль створено!');
      go('profiles');
    },

    // Navigation
    back:            () => goBack(),
    goDictionary:    () => go('dictionary'),
    goStudySetup:    () => go('studySetup'),
    goStats:         () => go('stats'),
    goAchievements:  () => go('achievements'),
    goSettings:      () => go('settings'),
    addWord:         () => go('addWord'),

    // Settings / GitHub sync
    saveGhToken: () => {
      const inp = document.getElementById('gh-token');
      const val = inp ? inp.value.trim() : '';
      if (!val || val.startsWith('•')) { showToast('⚠️ Введи токен!'); return; }
      GH.setToken(val);
      showToast('✅ Токен збережено!');
      go('settings');
    },
    clearGhToken: () => {
      GH.clearToken();
      showToast('🗑️ Токен видалено');
      go('settings');
    },
    manualSync: async () => {
      showToast('🔄 Синхронізація...');
      const ok = await GH.push();
      showToast(ok ? '☁️ Збережено в GitHub!' : '⚠️ Помилка синхронізації');
    },
    exportData: () => {
      const json = JSON.stringify(S.profiles, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `wordflash-backup-${today()}.json`;
      a.click(); URL.revokeObjectURL(url);
      showToast('📥 Файл завантажується!');
    },

    // Dictionary
    toggleWord: () => {
      if (S.dictSelected.has(id)) S.dictSelected.delete(id);
      else S.dictSelected.add(id);
      render();
    },
    selectAll:   () => { const p=getProfile(); if(p) p.words.forEach(w=>S.dictSelected.add(w.id)); render(); },
    deselectAll: () => { S.dictSelected.clear(); render(); },
    editWord:    () => { e.stopPropagation(); go('editWord', { wordId: id }); },
    deleteWord:  () => {
      e.stopPropagation();
      const w = getWord(id);
      if (!w) return;
      if (!confirm(`Видалити слово "${w.english}"?`)) return;
      const p = getProfile();
      if (p) { p.words = p.words.filter(x => x.id !== id); S.dictSelected.delete(id); saveData(); render(); }
    },
    studySelected: () => {
      const p = getProfile();
      if (!p) return;
      const ids = S.dictSelected.size > 0 ? [...S.dictSelected] : p.words.map(w=>w.id);
      go('studySetup', { wordIds: ids });
    },

    // Add word
    saveWord: () => {
      const en = document.getElementById('word-en')?.value?.trim();
      const ua = document.getElementById('word-ua')?.value?.trim();
      if (!en || !ua) { showToast('⚠️ Заповни обидва поля!'); return; }
      const p = getProfile();
      if (!p) return;
      const w = { id: uid(), english: en, ukrainian: ua, addedDate: today(), timesStudied:0, timesKnown:0, timesUnknown:0 };
      p.words.push(w);
      checkAchievements(p);
      addXP(p, 5);
      saveData();
      showToast('✅ Слово додано! +5 XP');
      go('dictionary');
    },
    saveBulk: () => {
      const raw = document.getElementById('bulk-input')?.value || '';
      const p = getProfile();
      if (!p) return;
      let count = 0;
      raw.split('\n').forEach(line => {
        const parts = line.split(/\s*[-–—]\s*/);
        if (parts.length >= 2) {
          const en = parts[0].trim();
          const ua = parts.slice(1).join('-').trim();
          if (en && ua) {
            p.words.push({ id: uid(), english: en, ukrainian: ua, addedDate: today(), timesStudied:0, timesKnown:0, timesUnknown:0 });
            count++;
          }
        }
      });
      if (count === 0) { showToast('⚠️ Не знайдено пар слів!'); return; }
      checkAchievements(p);
      addXP(p, count * 5);
      saveData();
      showToast(`✅ Додано ${count} слів! +${count*5} XP`);
      go('dictionary');
    },

    // Edit word
    updateWord: () => {
      const en = document.getElementById('word-en')?.value?.trim();
      const ua = document.getElementById('word-ua')?.value?.trim();
      if (!en || !ua) { showToast('⚠️ Заповни обидва поля!'); return; }
      const w = getWord(id);
      if (w) { w.english = en; w.ukrainian = ua; saveData(); showToast('✅ Слово оновлено!'); }
      go('dictionary');
    },

    // Study setup
    setDir: () => { S.params = { ...S.params, direction: el.dataset.dir }; render(); },
    startAll: () => {
      const p = getProfile();
      if (!p || p.words.length === 0) return;
      startSession(p.words.map(w=>w.id), S.params.direction || 'en-ua');
    },
    startSelected: () => {
      const ids = S.dictSelected.size > 0 ? [...S.dictSelected] : (S.params.wordIds || []);
      if (ids.length === 0) { showToast('⚠️ Немає вибраних слів!'); return; }
      startSession(ids, S.params.direction || 'en-ua');
    },

    // Study
    know:      () => actionKnow(),
    unknown:   () => actionUnknown(),
    flip:      () => actionFlip(),
    quitStudy: () => {
      if (S.session && S.session.completed.length > 0) {
        if (!confirm('Завершити заняття достроково?')) return;
      }
      S.session = null;
      go('menu');
    },

    // Complete
    studyAgain: () => {
      const s = S.params.session;
      if (!s) { go('menu'); return; }
      go('studySetup');
    },
  };

  const fn = actions[action];
  if (fn) fn();
}

function goBack() {
  const map = {
    newProfile:   'profiles',
    menu:         'profiles',
    dictionary:   'menu',
    addWord:      'dictionary',
    editWord:     'dictionary',
    studySetup:   'menu',
    study:        'menu',
    complete:     'menu',
    stats:        'menu',
    achievements: 'menu',
    settings:     'menu',
  };
  go(map[S.view] || 'profiles');
}

// ===== TOAST =====

function showToast(msg, dur=3000) {
  const cont = document.getElementById('toast-container');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => el.remove(), dur);
}

// ===== CONFETTI =====

function launchConfetti(intensity = 1) {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const colors = ['#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF','#FF8B94','#B19CD9','#FECA57','#48DBFB'];
  const count  = Math.round(120 * intensity);
  const pieces = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    w: Math.random() * 12 + 6,
    h: Math.random() * 8 + 4,
    c: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 3 + 2,
    angle: Math.random() * 360,
    spin: (Math.random() - 0.5) * 6,
  }));

  let frame;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let any = false;
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.vy += 0.05;
      if (p.y < canvas.height + 20) { any = true; }
      ctx.save();
      ctx.translate(p.x + p.w/2, p.y + p.h/2);
      ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    if (any) frame = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 6000);
}

// ===== INIT =====

// Sync on page close/refresh (best-effort)
window.addEventListener('beforeunload', () => {
  if (GH.token() && S.profiles.length > 0) {
    // Fire-and-forget sync on close
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(S.profiles))));
    const url = GH.apiUrl();
    navigator.sendBeacon && navigator.sendBeacon('/dev/null'); // keepalive trick
    // Use synchronous XHR as last resort (deprecated but works on close)
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', GH.rawUrl().replace('?t=', '?close='), false);
      xhr.send();
    } catch {}
  }
});

render(); // Show UI immediately from localStorage
loadData(); // Then pull from GitHub asynchronously (will re-render if newer data found)

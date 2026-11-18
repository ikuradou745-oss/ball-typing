import { BALL_CATALOG, NPC_ENEMY_BALLS, RARITY_STYLES } from './assets/ballImages.js';

const GRID_SIZE = 16;
const TOTAL_PIXELS = GRID_SIZE * GRID_SIZE;
const DEFAULT_PIXEL_COLOR = '#FFFFFF';
const DEFAULT_USERNAME = 'プレイヤー1';
const DEFAULT_VOLUME = 70;
const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 12;
const MIN_EQUIPPED_BALLS = 1;
const MAX_EQUIPPED_BALLS = 4;
const DEFAULT_BALL_ID = 'sponge_ball';
const STORAGE_KEY = 'ball_typing_profile_v1';

const PALETTE_COLORS = [
  { name: '黒', hex: '#111827' },
  { name: '白', hex: '#FFFFFF' },
  { name: '赤', hex: '#EF4444' },
  { name: 'オレンジ', hex: '#F97316' },
  { name: 'ゴールド', hex: '#F6C116' },
  { name: 'レモン', hex: '#FDE047' },
  { name: 'ライム', hex: '#84CC16' },
  { name: 'エメラルド', hex: '#28C76F' },
  { name: 'シアン', hex: '#06B6D4' },
  { name: 'スカイブルー', hex: '#3196E2' },
  { name: 'ブルー', hex: '#2563EB' },
  { name: 'パープル', hex: '#7C3AED' },
  { name: 'ピンク', hex: '#EC4899' },
  { name: 'ローズ', hex: '#FB7185' },
  { name: 'ブラウン', hex: '#92400E' },
  { name: 'ベージュ', hex: '#FDBA74' },
  { name: 'ライトグレー', hex: '#CBD5E1' },
  { name: 'ダークグレー', hex: '#475569' },
];

const DEFAULT_BALL_ROWS = [
  '................',
  '.....KKKKKK.....',
  '...KKLLLLLLKK...',
  '..KLLWWBBBBBBK..',
  '.KLWWBBBBBBBBBK.',
  '.KLWBBBBYBBBBBK.',
  'KBBBBBBYYYBBBBBK',
  'KBBBBYYYYYYBBBBK',
  'KBBBBYYYYYYBBBBK',
  'KBBBBBBYYYBBBBBK',
  '.KBBBBBBYBBBBDK.',
  '.KBBBBBBBBBBDDK.',
  '..KBBBBBBBBDDK..',
  '...KKDDDDDDKK...',
  '.....KKKKKK.....',
  '................',
];

const DEFAULT_BALL_COLOR_MAP = {
  '.': '#FFFFFF',
  K: '#111827',
  B: '#3196E2',
  L: '#7DD3FC',
  D: '#1D4ED8',
  Y: '#F6C116',
  W: '#FFFFFF',
};

function createDefaultPixels() {
  const result = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = DEFAULT_BALL_ROWS[r] || '................';
    for (let c = 0; c < GRID_SIZE; c++) {
      const ch = row[c] || '.';
      result.push(DEFAULT_BALL_COLOR_MAP[ch] || DEFAULT_PIXEL_COLOR);
    }
  }
  return result;
}

function createEmptyGrid(fillColor = DEFAULT_PIXEL_COLOR) {
  return Array.from({ length: TOTAL_PIXELS }, () => fillColor);
}

function isValidUsername(name) {
  const trimmed = name.trim();
  return trimmed.length >= MIN_USERNAME_LENGTH && trimmed.length <= MAX_USERNAME_LENGTH;
}

function clampVolume(value) {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeOwnedBalls(owned) {
  const valid = Array.isArray(owned)
    ? owned.filter((id) => typeof id === 'string' && Boolean(BALL_CATALOG[id]))
    : [];
  if (!valid.includes(DEFAULT_BALL_ID)) {
    valid.unshift(DEFAULT_BALL_ID);
  }
  return Array.from(new Set(valid));
}

function normalizeEquippedBalls(equipped, ownedBalls) {
  const ownedSet = new Set(ownedBalls);
  const valid = Array.isArray(equipped)
    ? Array.from(new Set(equipped.filter((id) => typeof id === 'string' && ownedSet.has(id))))
    : [];
  const capped = valid.slice(0, MAX_EQUIPPED_BALLS);
  if (capped.length < MIN_EQUIPPED_BALLS) {
    return [ownedBalls[0] || DEFAULT_BALL_ID];
  }
  return capped;
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        username: DEFAULT_USERNAME,
        pixels: createDefaultPixels(),
        volume: DEFAULT_VOLUME,
        ownedBalls: [DEFAULT_BALL_ID],
        equippedBalls: [DEFAULT_BALL_ID],
      };
    }
    const parsed = JSON.parse(raw);
    const username =
      typeof parsed.username === 'string' && isValidUsername(parsed.username)
        ? parsed.username.trim()
        : DEFAULT_USERNAME;
    const pixels =
      Array.isArray(parsed.pixels) &&
      parsed.pixels.length === TOTAL_PIXELS &&
      parsed.pixels.every((p) => typeof p === 'string' && /^#[0-9a-fA-F]{6}$/.test(p))
        ? parsed.pixels
        : createDefaultPixels();
    const volume =
      typeof parsed.volume === 'number' ? clampVolume(parsed.volume) : DEFAULT_VOLUME;
    const ownedBalls = normalizeOwnedBalls(parsed.ownedBalls);
    const equippedBalls = normalizeEquippedBalls(parsed.equippedBalls, ownedBalls);
    return { username, pixels, volume, ownedBalls, equippedBalls };
  } catch {
    return {
      username: DEFAULT_USERNAME,
      pixels: createDefaultPixels(),
      volume: DEFAULT_VOLUME,
      ownedBalls: [DEFAULT_BALL_ID],
      equippedBalls: [DEFAULT_BALL_ID],
    };
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage errors
  }
}

// Web Audio API Sound Effects
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playClickSound(vol) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.1 * scale, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.065);
  } catch {
    // Optional audio
  }
}

function playOpenSound(vol) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.09);
    gain.gain.setValueAtTime(0.1 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  } catch {
    // Optional audio
  }
}

function playSaveSound(vol) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.09 * scale, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.13);
    });
  } catch {
    // Optional audio
  }
}

function playErrorSound(vol) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.linearRampToValueAtTime(145, now + 0.12);
    gain.gain.setValueAtTime(0.08 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch {
    // Optional audio
  }
}

function renderAvatarCanvas(canvas, pixels) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const x = i % GRID_SIZE;
    const y = Math.floor(i / GRID_SIZE);
    ctx.fillStyle = pixels[i] || DEFAULT_PIXEL_COLOR;
    ctx.fillRect(x, y, 1, 1);
  }
}

const BATTLE_SPEEDS = [1, 2, 3];
const BATTLE_WORD = { kana: 'あいうえお', romaji: 'aiueo' };

// App State
let profile = loadProfile();
let currentScreen = 'home';
let isMatchmaking = false;
let battleSpeedIndex = 0;
let typedIndex = 0;
let typingErrorTimer = null;
let ballSearchQuery = '';
let equipFeedbackTimer = null;
let draftVolume = profile.volume;
let draftUsername = profile.username;
let draftPixels = [...profile.pixels];
let history = [];
let activeTab = 'settings';
let selectedColor = '#111827';
let currentTool = 'pen';
let mirrorX = false;
let isDrawing = false;
let strokeSnapshot = null;

// DOM Elements
const topHudEl = document.querySelector('.top-hud');
const homeScreenEl = document.getElementById('home-screen');
const modeScreenEl = document.getElementById('mode-screen');
const equipScreenEl = document.getElementById('equip-screen');
const battleScreenEl = document.getElementById('battle-screen');
const equipBackBtn = document.getElementById('equip-back-btn');
const openPlayBtn = document.getElementById('open-play-btn');
const openEquipBtn = document.getElementById('open-equip-btn');
const modeVsBtn = document.getElementById('mode-vs-btn');
const matchmakingOverlay = document.getElementById('matchmaking-overlay');

const battleBackBtn = document.getElementById('battle-back-btn');
const battleSpeedBtn = document.getElementById('battle-speed-btn');
const battleTypingBox = document.getElementById('battle-typing-box');
const typingKanaEl = document.getElementById('typing-kana');
const typingRomajiEl = document.getElementById('typing-romaji');
const mobileTypingInput = document.getElementById('mobile-typing-input');
const enemyTerritoryEl = document.getElementById('enemy-territory');
const playerTerritoryEl = document.getElementById('player-territory');

const equipStatusMsg = document.getElementById('equip-status-msg');
const equippedCountText = document.getElementById('equipped-count-text');
const ownedCountText = document.getElementById('owned-count-text');
const equippedSlotsGrid = document.getElementById('equipped-slots-grid');
const ownedBallsGrid = document.getElementById('owned-balls-grid');
const ballSearchInput = document.getElementById('ball-search-input');

const hudAvatarCanvas = document.getElementById('hud-avatar-canvas');
const hudUsernameEl = document.getElementById('hud-username');
const openSettingsBtn = document.getElementById('open-settings-btn');

const noticeModal = document.getElementById('notice-modal');
const noticeCloseBtn = document.getElementById('notice-close-btn');

const settingsModal = document.getElementById('settings-modal');
const settingsXBtn = document.getElementById('settings-x-btn');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');

const tabBtnSettings = document.getElementById('tab-btn-settings');
const tabBtnProfile = document.getElementById('tab-btn-profile');
const tabLabelProfile = document.getElementById('tab-label-profile');
const panelSettings = document.getElementById('panel-settings');
const panelProfile = document.getElementById('panel-profile');

const volumeIconWrap = document.getElementById('volume-icon-wrap');
const volumeBadge = document.getElementById('volume-badge');
const volumeSlider = document.getElementById('volume-slider');

const previewAvatarCanvas = document.getElementById('preview-avatar-canvas');
const previewUsernameEl = document.getElementById('preview-username');
const usernameInput = document.getElementById('username-input');
const usernameCounter = document.getElementById('username-counter');
const usernameHint = document.getElementById('username-hint');

const mirrorBtn = document.getElementById('mirror-btn');
const undoBtn = document.getElementById('undo-btn');
const clearBtn = document.getElementById('clear-btn');
const toolButtons = Array.from(document.querySelectorAll('[data-tool]'));
const pixelGridEl = document.getElementById('pixel-grid');
const freeColorInput = document.getElementById('free-color-input');
const freeColorHex = document.getElementById('free-color-hex');
const colorSwatchesEl = document.getElementById('color-swatches');

const pixelCells = [];
const swatchButtons = [];

function renderHud() {
  hudUsernameEl.textContent = profile.username;
  renderAvatarCanvas(hudAvatarCanvas, profile.pixels);
  hudAvatarCanvas.setAttribute('aria-label', `${profile.username}のアイコン`);
}

function showEquipFeedback(message) {
  equipStatusMsg.textContent = message;
  equipStatusMsg.classList.remove('hidden');
  if (equipFeedbackTimer) clearTimeout(equipFeedbackTimer);
  equipFeedbackTimer = setTimeout(() => {
    equipStatusMsg.classList.add('hidden');
  }, 2400);
}

function triggerShake(el) {
  if (!el) return;
  el.classList.remove('is-shaking');
  void el.offsetWidth;
  el.classList.add('is-shaking');
}

function toggleEquipBall(ballId, triggerEl) {
  const isEquipped = profile.equippedBalls.includes(ballId);
  if (isEquipped) {
    if (profile.equippedBalls.length <= MIN_EQUIPPED_BALLS) {
      playErrorSound(profile.volume);
      triggerShake(triggerEl);
      showEquipFeedback('最低1つはボールを装備する必要があります');
      return;
    }
    playClickSound(profile.volume);
    profile.equippedBalls = profile.equippedBalls.filter((id) => id !== ballId);
  } else {
    if (profile.equippedBalls.length >= MAX_EQUIPPED_BALLS) {
      playErrorSound(profile.volume);
      triggerShake(triggerEl);
      showEquipFeedback('装備できるボールは最大4つまでです');
      return;
    }
    playOpenSound(profile.volume);
    profile.equippedBalls = [...profile.equippedBalls, ballId];
  }

  equipStatusMsg.classList.add('hidden');
  saveProfile(profile);
  renderEquipScreen();
}

function createBallCardHTML(ball, footerLabel) {
  const rarityInfo = RARITY_STYLES[ball.rarity] || RARITY_STYLES.common;
  return {
    bg: rarityInfo.cardBg,
    html: `
      <span class="ball-card-top">
        <span class="ball-tag">${rarityInfo.label}</span>
        <span class="ball-tag ball-level-tag">Lv.${ball.level}</span>
      </span>
      <span class="ball-sprite-wrap">
        <img
          src="${ball.imageSrc}"
          alt="${ball.name}"
          width="48"
          height="48"
          class="ball-pixel-img pixelated"
        />
      </span>
      <span class="ball-nameplate">${footerLabel}</span>
    `,
  };
}

function renderEquipScreen() {
  equippedCountText.textContent = `${profile.equippedBalls.length} / ${MAX_EQUIPPED_BALLS}`;
  ownedCountText.textContent = `${profile.ownedBalls.length}個`;

  // Upper: Equipped Balls (up to 4 slots)
  equippedSlotsGrid.innerHTML = '';
  for (let slotIndex = 0; slotIndex < MAX_EQUIPPED_BALLS; slotIndex++) {
    const ballId = profile.equippedBalls[slotIndex];
    const ball = ballId ? BALL_CATALOG[ballId] : null;
    if (ball) {
      const slotBtn = document.createElement('button');
      const card = createBallCardHTML(ball, ball.name);
      slotBtn.type = 'button';
      slotBtn.className = 'ball-card';
      slotBtn.style.backgroundColor = card.bg;
      slotBtn.setAttribute('aria-label', `${ball.name}（装備中・タップで外す）`);
      slotBtn.innerHTML = card.html;
      slotBtn.addEventListener('click', () => toggleEquipBall(ball.id, slotBtn));
      equippedSlotsGrid.appendChild(slotBtn);
    } else {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'ball-slot-empty';
      emptySlot.innerHTML = `<span>空きスロット</span>`;
      equippedSlotsGrid.appendChild(emptySlot);
    }
  }

  // Lower: Owned Balls (with name search filter)
  const query = ballSearchQuery.trim().toLowerCase();
  const filteredOwned = profile.ownedBalls.filter((ballId) => {
    const ball = BALL_CATALOG[ballId];
    if (!ball) return false;
    if (!query) return true;
    return ball.name.toLowerCase().includes(query);
  });

  ownedBallsGrid.innerHTML = '';
  if (filteredOwned.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'ball-empty-msg';
    emptyMsg.textContent = `「${ballSearchQuery.trim()}」に一致するボールが見つかりませんでした`;
    ownedBallsGrid.appendChild(emptyMsg);
    return;
  }

  filteredOwned.forEach((ballId) => {
    const ball = BALL_CATALOG[ballId];
    if (!ball) return;
    const isEquipped = profile.equippedBalls.includes(ballId);
    const cardBtn = document.createElement('button');
    const card = createBallCardHTML(ball, `${ball.name} ×1`);
    cardBtn.type = 'button';
    cardBtn.className = `ball-card ${isEquipped ? 'ball-card-equipped-highlight' : ''}`;
    cardBtn.style.backgroundColor = card.bg;
    cardBtn.setAttribute('aria-pressed', String(isEquipped));
    cardBtn.setAttribute(
      'aria-label',
      `${ball.name}：${isEquipped ? '装備中（タップで外す）' : '未装備（タップで装備）'}`
    );
    cardBtn.innerHTML = card.html;
    cardBtn.addEventListener('click', () => toggleEquipBall(ball.id, cardBtn));
    ownedBallsGrid.appendChild(cardBtn);
  });
}

function createBattleUnitElement(unit, isEnemy) {
  const wrapper = document.createElement('div');
  wrapper.className = `battle-unit ${isEnemy ? 'battle-unit-enemy' : 'battle-unit-player'}`;
  wrapper.innerHTML = `
    <img
      src="${unit.imageSrc}"
      alt="${unit.name}"
      width="56"
      height="56"
      class="battle-unit-sprite pixelated"
    />
    <div class="battle-stat-plate">
      <span class="battle-stat-lv">Lv.${unit.level}</span>
      <span class="battle-stat-nums">
        <span><span class="stat-heart">♥</span>${unit.hp}</span>
        <span><span class="stat-sword">⚔</span>${unit.atk}</span>
      </span>
    </div>
  `;
  return wrapper;
}

function renderBattleUnits() {
  enemyTerritoryEl.innerHTML = '';
  NPC_ENEMY_BALLS.forEach((enemy) => {
    enemyTerritoryEl.appendChild(createBattleUnitElement(enemy, true));
  });

  playerTerritoryEl.innerHTML = '';
  profile.equippedBalls.forEach((ballId) => {
    const ball = BALL_CATALOG[ballId];
    if (!ball) return;
    playerTerritoryEl.appendChild(createBattleUnitElement(ball, false));
  });
}

function renderBattleSpeed() {
  const speed = BATTLE_SPEEDS[battleSpeedIndex] || 1;
  battleSpeedBtn.textContent = `${speed}倍速`;
  battleScreenEl.style.setProperty('--battle-speed', String(speed));
}

function renderBattleTyping() {
  typingKanaEl.textContent = BATTLE_WORD.kana;
  typingRomajiEl.innerHTML = '';
  for (let i = 0; i < BATTLE_WORD.romaji.length; i++) {
    const span = document.createElement('span');
    span.textContent = BATTLE_WORD.romaji[i];
    if (i < typedIndex) {
      span.className = 'typing-char-done';
    } else if (i === typedIndex) {
      span.className = 'typing-char-next';
    } else {
      span.className = 'typing-char-rest';
    }
    typingRomajiEl.appendChild(span);
  }
}

function triggerPlayerLunge() {
  const speed = BATTLE_SPEEDS[battleSpeedIndex] || 1;
  const duration = Math.max(90, Math.round(220 / speed));
  const units = Array.from(playerTerritoryEl.querySelectorAll('.battle-unit'));
  units.forEach((unit) => {
    unit.classList.remove('battle-unit-lunge');
    void unit.offsetWidth;
    unit.classList.add('battle-unit-lunge');
    setTimeout(() => {
      unit.classList.remove('battle-unit-lunge');
    }, duration);
  });
}

function handleTypingChar(rawChar) {
  if (
    currentScreen !== 'battle' ||
    isMatchmaking ||
    !noticeModal.classList.contains('hidden') ||
    !settingsModal.classList.contains('hidden')
  ) {
    return;
  }

  const ch = rawChar.toLowerCase();
  if (!/^[a-z]$/.test(ch)) return;

  const expected = BATTLE_WORD.romaji[typedIndex];
  if (ch === expected) {
    typedIndex += 1;
    if (typedIndex >= BATTLE_WORD.romaji.length) {
      playSaveSound(profile.volume);
      triggerPlayerLunge();
      typedIndex = 0;
    } else {
      playClickSound(profile.volume);
    }
    battleTypingBox.classList.remove('typing-error-flash');
    renderBattleTyping();
  } else {
    playErrorSound(profile.volume);
    battleTypingBox.classList.add('typing-error-flash');
    if (typingErrorTimer) clearTimeout(typingErrorTimer);
    typingErrorTimer = setTimeout(() => {
      battleTypingBox.classList.remove('typing-error-flash');
    }, 180);
  }
}

function startVsMatchmaking() {
  if (isMatchmaking) return;
  isMatchmaking = true;
  playOpenSound(profile.volume);

  matchmakingOverlay.classList.remove('hidden');
  void matchmakingOverlay.offsetWidth;
  matchmakingOverlay.classList.add('is-visible');

  // Fade in (~220ms) -> prepare Battle Screen -> wait 0.5s -> fade out
  setTimeout(() => {
    setScreen('battle');
    setTimeout(() => {
      matchmakingOverlay.classList.remove('is-visible');
      setTimeout(() => {
        matchmakingOverlay.classList.add('hidden');
        isMatchmaking = false;
      }, 240);
    }, 500);
  }, 220);
}

function setScreen(screen) {
  currentScreen = screen;
  const isHome = currentScreen === 'home';
  const isMode = currentScreen === 'mode';
  const isEquip = currentScreen === 'equip';
  const isBattle = currentScreen === 'battle';

  topHudEl.classList.toggle('hidden', isBattle);
  homeScreenEl.classList.toggle('hidden', !isHome);
  modeScreenEl.classList.toggle('hidden', !isMode);
  equipScreenEl.classList.toggle('hidden', !isEquip);
  battleScreenEl.classList.toggle('hidden', !isBattle);
  equipBackBtn.classList.toggle('hidden', isHome || isBattle);

  if (isEquip) {
    equipStatusMsg.classList.add('hidden');
    ballSearchQuery = '';
    ballSearchInput.value = '';
    renderEquipScreen();
  }

  if (isBattle) {
    typedIndex = 0;
    renderBattleSpeed();
    renderBattleTyping();
    renderBattleUnits();
  }
}

function renderVolumeUI() {
  volumeBadge.textContent = String(draftVolume);
  volumeSlider.value = String(draftVolume);
  if (draftVolume === 0) {
    volumeIconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" class="volume-icon-off" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
  } else {
    volumeIconWrap.innerHTML =
      '<svg viewBox="0 0 24 24" class="volume-icon-on" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  }
}

function renderTabs() {
  const isSettings = activeTab === 'settings';
  tabBtnSettings.setAttribute('aria-selected', String(isSettings));
  tabBtnProfile.setAttribute('aria-selected', String(!isSettings));

  tabBtnSettings.classList.toggle('tab-btn-active-gold', isSettings);
  tabBtnProfile.classList.toggle('tab-btn-active-blue', !isSettings);
  tabLabelProfile.classList.toggle('arcade-outline-white', !isSettings);

  panelSettings.classList.toggle('hidden', !isSettings);
  panelProfile.classList.toggle('hidden', isSettings);
}

function renderUsernameValidation() {
  const trimmed = draftUsername.trim();
  const valid = isValidUsername(draftUsername);

  previewUsernameEl.textContent = trimmed || 'プレイヤー';
  usernameCounter.textContent = `${trimmed.length} / ${MAX_USERNAME_LENGTH}文字`;
  usernameCounter.classList.toggle('field-counter-error', !valid);
  usernameInput.classList.toggle('text-input-error', !valid);

  if (!valid) {
    usernameHint.textContent = `ユーザー名は${MIN_USERNAME_LENGTH}〜${MAX_USERNAME_LENGTH}文字で入力してください`;
    usernameHint.classList.add('field-hint-error');
    usernameHint.setAttribute('role', 'alert');
  } else {
    usernameHint.textContent = `${MIN_USERNAME_LENGTH}文字以上${MAX_USERNAME_LENGTH}文字以内で設定できます`;
    usernameHint.classList.remove('field-hint-error');
    usernameHint.removeAttribute('role');
  }

  settingsSaveBtn.disabled = !valid;
}

function renderPixelGrid() {
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    pixelCells[i].style.backgroundColor = draftPixels[i];
  }
  renderAvatarCanvas(previewAvatarCanvas, draftPixels);
  undoBtn.disabled = history.length === 0;
}

function renderToolsAndColors() {
  mirrorBtn.setAttribute('aria-pressed', String(mirrorX));
  mirrorBtn.classList.toggle('mini-btn-active', mirrorX);

  toolButtons.forEach((btn) => {
    const active = btn.dataset.tool === currentTool;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('tool-btn-active', active);
  });

  freeColorInput.value = selectedColor;
  freeColorHex.textContent = selectedColor;

  swatchButtons.forEach(({ hex, el }) => {
    const isSelected =
      selectedColor.toLowerCase() === hex.toLowerCase() && currentTool !== 'eraser';
    el.classList.toggle('color-swatch-selected', isSelected);
  });
}

function pushHistorySnapshot(pixelsSnapshot) {
  history = [...history.slice(-29), [...pixelsSnapshot]];
}

function applyDrawAt(index, pixels) {
  const paintColor = currentTool === 'eraser' ? DEFAULT_PIXEL_COLOR : selectedColor;
  const next = [...pixels];
  next[index] = paintColor;
  if (mirrorX) {
    const col = index % GRID_SIZE;
    const row = Math.floor(index / GRID_SIZE);
    const mirrorIndex = row * GRID_SIZE + (GRID_SIZE - 1 - col);
    next[mirrorIndex] = paintColor;
  }
  return next;
}

function floodFill(startIndex, targetColor, replacementColor) {
  if (targetColor.toLowerCase() === replacementColor.toLowerCase()) return;
  pushHistorySnapshot(draftPixels);
  const next = [...draftPixels];
  const queue = [startIndex];
  const visited = new Set();

  while (queue.length > 0) {
    const idx = queue.shift();
    if (visited.has(idx)) continue;
    visited.add(idx);
    if ((next[idx] || '').toLowerCase() !== targetColor.toLowerCase()) continue;
    next[idx] = replacementColor;

    const col = idx % GRID_SIZE;
    const row = Math.floor(idx / GRID_SIZE);
    if (col > 0) queue.push(idx - 1);
    if (col < GRID_SIZE - 1) queue.push(idx + 1);
    if (row > 0) queue.push(idx - GRID_SIZE);
    if (row < GRID_SIZE - 1) queue.push(idx + GRID_SIZE);
  }

  draftPixels = next;
  renderPixelGrid();
}

function buildEditorDOM() {
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'pixel-cell';
    cell.dataset.pixelIndex = String(i);
    cell.setAttribute(
      'aria-label',
      `ピクセル ${Math.floor(i / GRID_SIZE) + 1}行 ${(i % GRID_SIZE) + 1}列`
    );

    cell.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (currentTool === 'eyedropper') {
        selectedColor = draftPixels[i] || DEFAULT_PIXEL_COLOR;
        currentTool = 'pen';
        playClickSound(draftVolume);
        renderToolsAndColors();
        return;
      }
      if (currentTool === 'fill') {
        floodFill(i, draftPixels[i] || DEFAULT_PIXEL_COLOR, selectedColor);
        playClickSound(draftVolume);
        return;
      }
      strokeSnapshot = [...draftPixels];
      isDrawing = true;
      draftPixels = applyDrawAt(i, draftPixels);
      renderPixelGrid();
    });

    pixelGridEl.appendChild(cell);
    pixelCells.push(cell);
  }

  PALETTE_COLORS.forEach((swatch) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch';
    btn.style.backgroundColor = swatch.hex;
    btn.title = swatch.name;
    btn.setAttribute('aria-label', `色: ${swatch.name}`);
    btn.addEventListener('click', () => {
      playClickSound(draftVolume);
      selectedColor = swatch.hex;
      if (currentTool === 'eraser') currentTool = 'pen';
      renderToolsAndColors();
    });
    colorSwatchesEl.appendChild(btn);
    swatchButtons.push({ hex: swatch.hex, el: btn });
  });
}

function openSettingsModal() {
  playOpenSound(profile.volume);
  activeTab = 'settings';
  draftVolume = profile.volume;
  draftUsername = profile.username;
  draftPixels = [...profile.pixels];
  history = [];
  currentTool = 'pen';
  isDrawing = false;
  strokeSnapshot = null;

  usernameInput.value = draftUsername;
  renderTabs();
  renderVolumeUI();
  renderUsernameValidation();
  renderPixelGrid();
  renderToolsAndColors();

  settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  playClickSound(profile.volume);
  isDrawing = false;
  strokeSnapshot = null;
  settingsModal.classList.add('hidden');
}

// Event Listeners
noticeCloseBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  noticeModal.classList.add('hidden');
});

document.querySelectorAll('[data-menu-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    playClickSound(profile.volume);
  });
});

openPlayBtn.addEventListener('click', () => {
  playOpenSound(profile.volume);
  setScreen('mode');
});

openEquipBtn.addEventListener('click', () => {
  playOpenSound(profile.volume);
  setScreen('equip');
});

equipBackBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  setScreen('home');
});

modeVsBtn.addEventListener('click', startVsMatchmaking);

document.querySelectorAll('[data-dev-mode-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    playClickSound(profile.volume);
  });
});

battleBackBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  setScreen('mode');
});

battleSpeedBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  battleSpeedIndex = (battleSpeedIndex + 1) % BATTLE_SPEEDS.length;
  renderBattleSpeed();
});

battleTypingBox.addEventListener('click', () => {
  mobileTypingInput.focus();
});

mobileTypingInput.addEventListener('input', (e) => {
  const val = e.target.value;
  if (val) {
    for (const ch of val) {
      handleTypingChar(ch);
    }
    e.target.value = '';
  }
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.activeElement === mobileTypingInput) return;
  if (e.key.length === 1) {
    handleTypingChar(e.key);
  }
});

ballSearchInput.addEventListener('input', (e) => {
  ballSearchQuery = e.target.value;
  renderEquipScreen();
});

openSettingsBtn.addEventListener('click', openSettingsModal);
settingsXBtn.addEventListener('click', closeSettingsModal);
settingsCancelBtn.addEventListener('click', closeSettingsModal);

settingsSaveBtn.addEventListener('click', () => {
  if (!isValidUsername(draftUsername)) {
    activeTab = 'profile';
    renderTabs();
    return;
  }
  playSaveSound(draftVolume);
  profile = {
    ...profile,
    username: draftUsername.trim(),
    pixels: [...draftPixels],
    volume: clampVolume(draftVolume),
  };
  saveProfile(profile);
  renderHud();
  settingsModal.classList.add('hidden');
});

tabBtnSettings.addEventListener('click', () => {
  playClickSound(draftVolume);
  activeTab = 'settings';
  renderTabs();
});

tabBtnProfile.addEventListener('click', () => {
  playClickSound(draftVolume);
  activeTab = 'profile';
  renderTabs();
});

volumeSlider.addEventListener('input', (e) => {
  draftVolume = clampVolume(Number(e.target.value));
  renderVolumeUI();
});

volumeSlider.addEventListener('pointerup', () => {
  playClickSound(draftVolume);
});

volumeSlider.addEventListener('keyup', () => {
  playClickSound(draftVolume);
});

usernameInput.addEventListener('input', (e) => {
  draftUsername = e.target.value;
  renderUsernameValidation();
});

mirrorBtn.addEventListener('click', () => {
  playClickSound(draftVolume);
  mirrorX = !mirrorX;
  renderToolsAndColors();
});

undoBtn.addEventListener('click', () => {
  if (history.length === 0) return;
  playClickSound(draftVolume);
  draftPixels = history[history.length - 1];
  history = history.slice(0, -1);
  renderPixelGrid();
});

clearBtn.addEventListener('click', () => {
  playClickSound(draftVolume);
  pushHistorySnapshot(draftPixels);
  draftPixels = createEmptyGrid(DEFAULT_PIXEL_COLOR);
  renderPixelGrid();
});

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    playClickSound(draftVolume);
    currentTool = btn.dataset.tool || 'pen';
    renderToolsAndColors();
  });
});

freeColorInput.addEventListener('input', (e) => {
  selectedColor = e.target.value.toUpperCase();
  if (currentTool === 'eraser') currentTool = 'pen';
  renderToolsAndColors();
});

pixelGridEl.addEventListener('pointermove', (e) => {
  if (!isDrawing || (currentTool !== 'pen' && currentTool !== 'eraser')) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const idxAttr = target && target.dataset ? target.dataset.pixelIndex : undefined;
  if (idxAttr === undefined) return;
  const idx = Number(idxAttr);
  if (Number.isNaN(idx) || idx < 0 || idx >= TOTAL_PIXELS) return;
  const targetColor = currentTool === 'eraser' ? DEFAULT_PIXEL_COLOR : selectedColor;
  if (draftPixels[idx] === targetColor && !mirrorX) return;
  draftPixels = applyDrawAt(idx, draftPixels);
  renderPixelGrid();
});

function finishStroke() {
  if (!isDrawing) return;
  isDrawing = false;
  if (strokeSnapshot) {
    pushHistorySnapshot(strokeSnapshot);
    strokeSnapshot = null;
    renderPixelGrid();
  }
}

window.addEventListener('pointerup', finishStroke);
window.addEventListener('pointercancel', finishStroke);

// Initialize
buildEditorDOM();
renderHud();

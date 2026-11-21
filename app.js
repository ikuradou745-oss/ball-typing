import {
  BALL_CATALOG,
  RARITY_STYLES,
  WOOD_WALL_SVG,
  getCatalogBallsByRarity,
  getNextRarity,
} from './assets/ballImages.js';
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  SURVEY_CONTENT_MAX,
  SURVEY_DAILY_LIMIT,
  ensureFirebase,
  fetchAdminStatus,
  fetchAdminSurveys,
  fetchPresenceSnapshot,
  getJstDateParts,
  getMsUntilNextJstMidnight,
  getSelfVisitorId,
  getSyncedNowMs,
  getTodaySurveyQuota,
  logoutAdminSession,
  registerActiveTab,
  sendPresenceHeartbeat,
  sendPresenceLeave,
  splitPresenceRecords,
  submitSurveyFeedback,
  subscribeAdminSurveys,
  subscribePresence,
  unregisterActiveTab,
  verifyAdminCodeOnServer,
} from './firebaseClient.js';
import {
  TYPING_SHIELD_MAX,
  applyTypingMistake,
  completeTypingWord,
  createInitialTypingComboState,
  getPerfectMultiplier,
  prepareNextTypingWord,
} from './lib/typingComboHelpers.js';

const GRID_SIZE = 16;
const TOTAL_PIXELS = GRID_SIZE * GRID_SIZE;
const DEFAULT_PIXEL_COLOR = '#FFFFFF';
const DEFAULT_USERNAME = 'プレイヤー1';
const DEFAULT_VOLUME = 70;
const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 12;
const MIN_EQUIPPED_BALLS = 1;
const MAX_EQUIPPED_BALLS = 4;
const MAX_SAME_BALL_EQUIP = 2;
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

function normalizeBallCounts(rawCounts, ownedBalls) {
  const result = {};
  ownedBalls.forEach((id) => {
    const n = rawCounts && typeof rawCounts[id] === 'number' ? Math.floor(rawCounts[id]) : 1;
    result[id] = Math.max(1, n);
  });
  return result;
}

function normalizeEquippedBalls(equipped, ownedBalls, ballCounts) {
  const ownedSet = new Set(ownedBalls);
  const used = {};
  const valid = [];
  if (Array.isArray(equipped)) {
    for (const id of equipped) {
      if (typeof id !== 'string' || !ownedSet.has(id)) continue;
      const limit = Math.min(MAX_SAME_BALL_EQUIP, ballCounts[id] || 1);
      const current = used[id] || 0;
      if (current < limit && valid.length < MAX_EQUIPPED_BALLS) {
        valid.push(id);
        used[id] = current + 1;
      }
    }
  }
  if (valid.length < MIN_EQUIPPED_BALLS) {
    return [ownedBalls[0] || DEFAULT_BALL_ID];
  }
  return valid;
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
        ballCounts: { [DEFAULT_BALL_ID]: 1 },
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
    const ballCounts = normalizeBallCounts(parsed.ballCounts, ownedBalls);
    const equippedBalls = normalizeEquippedBalls(parsed.equippedBalls, ownedBalls, ballCounts);
    return { username, pixels, volume, ownedBalls, ballCounts, equippedBalls };
  } catch {
    return {
      username: DEFAULT_USERNAME,
      pixels: createDefaultPixels(),
      volume: DEFAULT_VOLUME,
      ownedBalls: [DEFAULT_BALL_ID],
      ballCounts: { [DEFAULT_BALL_ID]: 1 },
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

function playAttackHitSound(vol, isStrong) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isStrong ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(isStrong ? 380 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.11);
    gain.gain.setValueAtTime((isStrong ? 0.13 : 0.1) * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  } catch {
    // Optional audio
  }
}

function playHealSound(vol) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.09 * scale, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.15);
    });
  } catch {
    // Optional audio
  }
}

function playKnockoutSound(vol) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.22);
    gain.gain.setValueAtTime(0.11 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch {
    // Optional audio
  }
}

function playVictoryFanfare(vol) {
  try {
    const scale = clampVolume(vol) / 100;
    if (scale <= 0) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.1 * scale, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.19);
    });
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

const BATTLE_SPEEDS = [1, 3];
const TYPING_WORDS = [
  { kana: 'あきらめずにがんばろう', romaji: 'akiramezuniganbarou' },
  { kana: 'きょうもぜんりょくしょうぶ', romaji: 'kyoumozenryokusyoubu' },
  { kana: 'きょうもげんきにはしる', romaji: 'kyoumogenkinihasiru' },
  { kana: 'あついばとるがはじまる', romaji: 'atuibatorugahazimaru' },
  { kana: 'しょうりをつかみとろう', romaji: 'syouriwotukamitorou' },
  { kana: 'つよいぼーるをあつめよう', romaji: 'tuyoibo-ruwoatumeyou' },
  { kana: 'たいぴんぐがはやくなる', romaji: 'taipingugahayakunaru' },
  { kana: 'きみのゆびさきがひかる', romaji: 'kiminoyubisakigahikaru' },
  { kana: 'さいごまであきらめない', romaji: 'saigomadeakiramenai' },
  { kana: 'きらめくみらいへすすめ', romaji: 'kiramekumiraihesusume' },
  { kana: 'ぼーるとともにたびだとう', romaji: 'bo-rutotomonitabidatou' },
  { kana: 'さいきょうのぼーるめざす', romaji: 'saikyounobo-rumezasu' },
  { kana: 'すぴーどあっぷでかつぞ', romaji: 'supi-doappudekatuzo' },
  { kana: 'めざせたいぴんぐますたー', romaji: 'mezasetaipingumasuta-' },
  { kana: 'れんぞくこうげきをきめろ', romaji: 'renzokukougekiwokimero' },
];

function roundStat(num) {
  return Math.round(num * 100) / 100;
}

function formatStat(num) {
  return String(roundStat(num));
}

function pickNextWord(prevRomaji) {
  const candidates = prevRomaji
    ? TYPING_WORDS.filter((w) => w.romaji !== prevRomaji)
    : TYPING_WORDS;
  return candidates[Math.floor(Math.random() * candidates.length)] || TYPING_WORDS[0];
}

// App State
let profile = loadProfile();
let currentScreen = 'home';
let isMatchmaking = false;
let battleSpeedIndex = 0;
let battleSessionCounter = 0;
let battleState = null;
let typingErrorTimer = null;
let equipMode = 'equip';
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
let isAdminAuthenticated = false;
let surveyQuota = { used: 0, remaining: SURVEY_DAILY_LIMIT, limit: SURVEY_DAILY_LIMIT };
let surveySubView = 'form';
let isSurveyBusy = false;

// DOM Elements
const topHudEl = document.querySelector('.top-hud');
const homeTopLeftActions = document.getElementById('home-top-left-actions');
const openEnemyGuideBtn = document.getElementById('open-enemy-guide-btn');
const openAdminCrownBtn = document.getElementById('open-admin-crown-btn');
const openPresenceBtn = document.getElementById('open-presence-btn');
const openSurveyBtn = document.getElementById('open-survey-btn');
const homeScreenEl = document.getElementById('home-screen');
const modeScreenEl = document.getElementById('mode-screen');
const equipScreenEl = document.getElementById('equip-screen');
const battleScreenEl = document.getElementById('battle-screen');
const equipBackBtn = document.getElementById('equip-back-btn');
const openPlayBtn = document.getElementById('open-play-btn');
const openEquipBtn = document.getElementById('open-equip-btn');
const modeVsBtn = document.getElementById('mode-vs-btn');
const matchmakingOverlay = document.getElementById('matchmaking-overlay');

const battleSpeedBtn = document.getElementById('battle-speed-btn');
const battleTypingBox = document.getElementById('battle-typing-box');
const battleTurnBadge = document.getElementById('battle-turn-badge');
const typingComboBadge = document.getElementById('typing-combo-badge');
const typingShieldBadge = document.getElementById('typing-shield-badge');
const typingKanaEl = document.getElementById('typing-kana');
const typingRomajiEl = document.getElementById('typing-romaji');
const mobileTypingInput = document.getElementById('mobile-typing-input');
const battleFxLayer = document.getElementById('battle-fx-layer');
const enemyTerritoryEl = document.getElementById('enemy-territory');
const playerTerritoryEl = document.getElementById('player-territory');

const battleResultModal = document.getElementById('battle-result-modal');
const battleResultHeader = document.getElementById('battle-result-header');
const battleResultTitle = document.getElementById('battle-result-title');
const battleResultSummary = document.getElementById('battle-result-summary');
const battleRewardSection = document.getElementById('battle-reward-section');
const battleRewardGrid = document.getElementById('battle-reward-grid');
const battleRewardClaimedMsg = document.getElementById('battle-reward-claimed-msg');
const battleRetryBtn = document.getElementById('battle-retry-btn');
const battleResultEquipBtn = document.getElementById('battle-result-equip-btn');
const battleResultHomeBtn = document.getElementById('battle-result-home-btn');

const equipModeEquipBtn = document.getElementById('equip-mode-equip-btn');
const equipModeInfoBtn = document.getElementById('equip-mode-info-btn');
const equipTopHint = document.getElementById('equip-top-hint');
const equipBottomHint = document.getElementById('equip-bottom-hint');
const equipStatusMsg = document.getElementById('equip-status-msg');
const equippedCountText = document.getElementById('equipped-count-text');
const ownedCountText = document.getElementById('owned-count-text');
const equippedSlotsGrid = document.getElementById('equipped-slots-grid');
const ownedBallsGrid = document.getElementById('owned-balls-grid');
const ballSearchInput = document.getElementById('ball-search-input');

const ballDetailModal = document.getElementById('ball-detail-modal');
const ballDetailName = document.getElementById('ball-detail-name');
const ballDetailXBtn = document.getElementById('ball-detail-x-btn');
const ballDetailCloseBtn = document.getElementById('ball-detail-close-btn');
const ballDetailHero = document.getElementById('ball-detail-hero');
const ballDetailSprite = document.getElementById('ball-detail-sprite');
const ballDetailRarity = document.getElementById('ball-detail-rarity');
const ballDetailLevel = document.getElementById('ball-detail-level');
const ballDetailOwnership = document.getElementById('ball-detail-ownership');
const ballDetailHp = document.getElementById('ball-detail-hp');
const ballDetailAtk = document.getElementById('ball-detail-atk');
const ballDetailAbilityTitle = document.getElementById('ball-detail-ability-title');
const ballDetailAbilityDesc = document.getElementById('ball-detail-ability-desc');

const hudAvatarCanvas = document.getElementById('hud-avatar-canvas');
const hudUsernameEl = document.getElementById('hud-username');
const hudVerifiedBadge = document.getElementById('hud-verified-badge');
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
const previewVerifiedBadge = document.getElementById('preview-verified-badge');
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

const enemyGuideModal = document.getElementById('enemy-guide-modal');
const enemyGuideXBtn = document.getElementById('enemy-guide-x-btn');
const enemyGuideCloseBtn = document.getElementById('enemy-guide-close-btn');

const surveyModal = document.getElementById('survey-modal');
const surveyXBtn = document.getElementById('survey-x-btn');
const surveyQuotaBadge = document.getElementById('survey-quota-badge');
const surveyForm = document.getElementById('survey-form');
const surveyContentInput = document.getElementById('survey-content-input');
const surveyContentCounter = document.getElementById('survey-content-counter');
const surveyFeedbackMsg = document.getElementById('survey-feedback-msg');
const surveySubmitBtn = document.getElementById('survey-submit-btn');
const openAdminSurveyBtn = document.getElementById('open-admin-survey-btn');
const adminListPanel = document.getElementById('admin-list-panel');
const adminRefreshBtn = document.getElementById('admin-refresh-btn');
const adminListStatus = document.getElementById('admin-list-status');
const adminSurveyList = document.getElementById('admin-survey-list');
const adminBackFromListBtn = document.getElementById('admin-back-from-list-btn');

const adminCrownModal = document.getElementById('admin-crown-modal');
const adminCrownXBtn = document.getElementById('admin-crown-x-btn');
const crownUnverifiedView = document.getElementById('crown-unverified-view');
const crownVerifiedView = document.getElementById('crown-verified-view');
const crownCodeInput = document.getElementById('crown-code-input');
const crownCodeError = document.getElementById('crown-code-error');
const crownCancelBtn = document.getElementById('crown-cancel-btn');
const crownCodeSubmitBtn = document.getElementById('crown-code-submit-btn');
const crownLogoutBtn = document.getElementById('crown-logout-btn');
const crownDoneBtn = document.getElementById('crown-done-btn');

const presenceModal = document.getElementById('presence-modal');
const presenceXBtn = document.getElementById('presence-x-btn');
const presenceCloseBtn = document.getElementById('presence-close-btn');
const presenceDayBadge = document.getElementById('presence-day-badge');
const presenceOnlineCount = document.getElementById('presence-online-count');
const presenceOnlineList = document.getElementById('presence-online-list');
const presenceTodayCount = document.getElementById('presence-today-count');
const presenceTodayList = document.getElementById('presence-today-list');

const pixelCells = [];
const swatchButtons = [];

function renderHud() {
  hudUsernameEl.textContent = profile.username;
  hudVerifiedBadge.classList.toggle('hidden', !isAdminAuthenticated);
  previewVerifiedBadge.classList.toggle('hidden', !isAdminAuthenticated);
  openAdminCrownBtn.classList.toggle('hud-crown-btn-verified', isAdminAuthenticated);
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

function unequipBallAtSlot(slotIndex, triggerEl) {
  if (profile.equippedBalls.length <= MIN_EQUIPPED_BALLS) {
    playErrorSound(profile.volume);
    triggerShake(triggerEl);
    showEquipFeedback('最低1つはボールを装備する必要があります');
    return;
  }
  playClickSound(profile.volume);
  const next = [...profile.equippedBalls];
  next.splice(slotIndex, 1);
  profile.equippedBalls = next;
  equipStatusMsg.classList.add('hidden');
  saveProfile(profile);
  renderEquipScreen();
}

function toggleEquipBall(ballId, triggerEl) {
  const ownedCount = profile.ballCounts[ballId] || 1;
  const maxAllowed = Math.min(MAX_SAME_BALL_EQUIP, ownedCount);
  const equippedCount = profile.equippedBalls.filter((id) => id === ballId).length;

  if (equippedCount < maxAllowed) {
    if (profile.equippedBalls.length >= MAX_EQUIPPED_BALLS) {
      playErrorSound(profile.volume);
      triggerShake(triggerEl);
      showEquipFeedback('装備できるボールは最大4つまでです');
      return;
    }
    playOpenSound(profile.volume);
    profile.equippedBalls = [...profile.equippedBalls, ballId];
  } else if (ownedCount > MAX_SAME_BALL_EQUIP && equippedCount >= MAX_SAME_BALL_EQUIP) {
    playErrorSound(profile.volume);
    triggerShake(triggerEl);
    showEquipFeedback('同じボールは2体まで装備できます');
    return;
  } else {
    if (profile.equippedBalls.length <= MIN_EQUIPPED_BALLS) {
      playErrorSound(profile.volume);
      triggerShake(triggerEl);
      showEquipFeedback('最低1つはボールを装備する必要があります');
      return;
    }
    playClickSound(profile.volume);
    const removeIdx = profile.equippedBalls.lastIndexOf(ballId);
    if (removeIdx !== -1) {
      const next = [...profile.equippedBalls];
      next.splice(removeIdx, 1);
      profile.equippedBalls = next;
    }
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
        ${ball.svg}
      </span>
      <span class="ball-nameplate">${footerLabel}</span>
    `,
  };
}

function openBallDetailModal(ball) {
  playOpenSound(profile.volume);
  const rarityInfo = RARITY_STYLES[ball.rarity] || RARITY_STYLES.common;
  const isOwned = profile.ownedBalls.includes(ball.id);
  const isEquipped = profile.equippedBalls.includes(ball.id);

  ballDetailName.textContent = ball.name;
  ballDetailHero.style.backgroundColor = rarityInfo.cardBg;
  ballDetailSprite.innerHTML = ball.svg;
  ballDetailRarity.textContent = rarityInfo.label;
  ballDetailLevel.textContent = `Lv.${ball.level}`;
  ballDetailOwnership.textContent = isEquipped ? '装備中' : isOwned ? '所持中' : '未所持';
  ballDetailHp.textContent = String(ball.hp);
  ballDetailAtk.textContent = String(ball.atk);
  ballDetailAbilityTitle.textContent = ball.abilityTitle || '特殊能力';
  ballDetailAbilityDesc.textContent = ball.ability || '特殊能力なし';

  ballDetailModal.classList.remove('hidden');
}

function closeBallDetailModal() {
  if (ballDetailModal.classList.contains('hidden')) return;
  playClickSound(profile.volume);
  ballDetailModal.classList.add('hidden');
}

function renderEquipScreen() {
  const isInfoMode = equipMode === 'info';

  equipModeEquipBtn.setAttribute('aria-selected', String(!isInfoMode));
  equipModeInfoBtn.setAttribute('aria-selected', String(isInfoMode));
  equipModeEquipBtn.classList.toggle('equip-mode-btn-active-equip', !isInfoMode);
  equipModeInfoBtn.classList.toggle('equip-mode-btn-active-info', isInfoMode);

  equipTopHint.textContent = isInfoMode ? 'タップして能力を見る' : 'タップして外す';
  equipBottomHint.textContent = isInfoMode
    ? 'タップして能力を見る'
    : 'タップして装備 (同じボール最大2体)';

  const totalOwnedCount = profile.ownedBalls.reduce(
    (sum, id) => sum + (profile.ballCounts[id] || 1),
    0
  );
  equippedCountText.textContent = `${profile.equippedBalls.length} / ${MAX_EQUIPPED_BALLS}`;
  ownedCountText.textContent = `${totalOwnedCount}個`;

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
      slotBtn.setAttribute(
        'aria-label',
        isInfoMode
          ? `${ball.name}（タップして性能・能力を見る）`
          : `${ball.name}（装備中・タップで外す）`
      );
      slotBtn.innerHTML = card.html;
      slotBtn.addEventListener('click', () => {
        if (equipMode === 'info') {
          openBallDetailModal(ball);
        } else {
          unequipBallAtSlot(slotIndex, slotBtn);
        }
      });
      equippedSlotsGrid.appendChild(slotBtn);
    } else {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'ball-slot-empty';
      emptySlot.innerHTML = `<span>空きスロット</span>`;
      equippedSlotsGrid.appendChild(emptySlot);
    }
  }

  // Lower: Owned Balls (only owned balls can be inspected in 説明モード)
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
    emptyMsg.textContent = `「${ballSearchQuery.trim()}」に一致する所持ボールが見つかりませんでした`;
    ownedBallsGrid.appendChild(emptyMsg);
  } else {
    filteredOwned.forEach((ballId) => {
      const ball = BALL_CATALOG[ballId];
      if (!ball) return;
      const ownedCount = profile.ballCounts[ballId] || 1;
      const isEquipped = profile.equippedBalls.includes(ballId);
      const cardBtn = document.createElement('button');
      const card = createBallCardHTML(ball, `${ball.name} ×${ownedCount}`);
      cardBtn.type = 'button';
      cardBtn.className = `ball-card ${isEquipped ? 'ball-card-equipped-highlight' : ''}`;
      cardBtn.style.backgroundColor = card.bg;
      cardBtn.setAttribute('aria-pressed', String(isEquipped));
      cardBtn.setAttribute(
        'aria-label',
        isInfoMode
          ? `${ball.name}（タップして性能・能力を見る）`
          : `${ball.name}（所持${ownedCount}個）：${isEquipped ? '装備中' : '未装備'}`
      );
      cardBtn.innerHTML = card.html;
      cardBtn.addEventListener('click', () => {
        if (equipMode === 'info') {
          openBallDetailModal(ball);
        } else {
          toggleEquipBall(ball.id, cardBtn);
        }
      });
      ownedBallsGrid.appendChild(cardBtn);
    });
  }
}

function getBattleSpeed() {
  return BATTLE_SPEEDS[battleSpeedIndex] || 1;
}

function battleDelay(baseMs) {
  const speed = getBattleSpeed();
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(40, Math.round(baseMs / speed)));
  });
}

function countOwnedByRarity(rarity) {
  return profile.ownedBalls.reduce((sum, id) => {
    const ball = BALL_CATALOG[id];
    if (ball && ball.rarity === rarity) {
      return sum + (profile.ballCounts[id] || 1);
    }
    return sum;
  }, 0);
}

function pickEnemyBallForPlayerUnit(playerUnit) {
  const baseRarity = playerUnit.rarity;
  const tier = RARITY_STYLES[baseRarity] ? RARITY_STYLES[baseRarity].tier : 0;
  const ownedOfBaseRarity = countOwnedByRarity(baseRarity);
  let targetRarity = baseRarity;

  if (ownedOfBaseRarity >= 6) {
    const nextRarity = getNextRarity(baseRarity);
    const nextCandidates = nextRarity ? getCatalogBallsByRarity(nextRarity) : [];
    if (nextRarity && nextCandidates.length > 0) {
      const upgradeChance = 0.1 / Math.pow(2, tier);
      if (Math.random() < upgradeChance) {
        targetRarity = nextRarity;
      }
    }
  }

  const pool = getCatalogBallsByRarity(targetRarity);
  const fallbackPool = pool.length > 0 ? pool : getCatalogBallsByRarity(baseRarity);
  return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
}

function createUnitInstance(ball, uid) {
  return {
    uid,
    ballId: ball.id,
    name: ball.name,
    rarity: ball.rarity,
    level: ball.level,
    maxHp: ball.hp,
    hp: ball.hp,
    atk: ball.atk,
    svg: ball.svg,
    revived: false,
    exploded: false,
    summonedWall: false,
    isWall: false,
    attacksMade: 0,
    turnCounter: 0,
    isHardened: false,
    atkDebuffTurns: 0,
    atkMultiplier: 1,
    missDebuffTurns: 0,
    dead: false,
  };
}

function createWoodWallUnit(summonerUnit) {
  const wallHp = roundStat(summonerUnit.maxHp / 2);
  return {
    uid: `${summonerUnit.uid}_wall`,
    ballId: 'wood_wall',
    name: '木の壁',
    rarity: summonerUnit.rarity,
    level: summonerUnit.level,
    maxHp: wallHp,
    hp: wallHp,
    atk: 0,
    svg: WOOD_WALL_SVG,
    revived: false,
    exploded: false,
    summonedWall: true,
    isWall: true,
    attacksMade: 0,
    turnCounter: 0,
    isHardened: false,
    atkDebuffTurns: 0,
    atkMultiplier: 1,
    missDebuffTurns: 0,
    dead: false,
  };
}

function initBattleState() {
  battleSessionCounter += 1;
  const playerTeam = profile.equippedBalls.map((ballId, idx) => {
    const ball = BALL_CATALOG[ballId] || BALL_CATALOG[DEFAULT_BALL_ID];
    return createUnitInstance(ball, `p_${idx}`);
  });

  const enemyTeam = playerTeam.map((playerUnit, idx) => {
    const picked = pickEnemyBallForPlayerUnit(playerUnit);
    return createUnitInstance(picked, `e_${idx}`);
  });

  battleState = {
    sessionId: battleSessionCounter,
    playerTeam,
    enemyTeam,
    currentWord: pickNextWord(null),
    typedIndex: 0,
    ...createInitialTypingComboState(),
    turn: 'player',
    isResolvingTurn: false,
    rewardClaimed: false,
  };
}

function createBattleUnitElement(unit, isEnemy, isFrontTank, isFrontAttacker) {
  const wrapper = document.createElement('div');
  wrapper.dataset.uid = unit.uid;
  wrapper.className = [
    'battle-unit',
    isEnemy ? 'battle-unit-enemy' : 'battle-unit-player',
    unit.dead ? 'battle-unit-dead' : '',
    unit.isWall ? 'battle-unit-wall' : '',
    !unit.dead && (isFrontTank || isFrontAttacker) ? 'battle-unit-active' : '',
    unit.isHardened ? 'battle-unit-hardened' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
  const statusTag = unit.dead
    ? unit.isWall
      ? '破壊'
      : '撃破'
    : unit.isWall
      ? '壁'
      : isFrontAttacker
        ? '先頭'
        : '';

  const chips = [];
  if (!unit.dead) {
    if (unit.isHardened) {
      chips.push('<span class="battle-unit-status-chip battle-chip-shield">固まる</span>');
    }
    if (unit.atkDebuffTurns > 0) {
      chips.push(
        `<span class="battle-unit-status-chip battle-chip-debuff">攻75%(${unit.atkDebuffTurns})</span>`
      );
    }
    if (unit.missDebuffTurns > 0) {
      chips.push(
        `<span class="battle-unit-status-chip battle-chip-miss">命中50%(${unit.missDebuffTurns})</span>`
      );
    }
  }

  const effectiveAtk = roundStat(unit.atk * (unit.atkDebuffTurns > 0 ? unit.atkMultiplier : 1));

  wrapper.innerHTML = `
    ${statusTag ? `<span class="battle-unit-front-tag">${statusTag}</span>` : ''}
    ${chips.length > 0 ? `<div class="battle-unit-status-row">${chips.join('')}</div>` : ''}
    <div class="battle-unit-sprite-wrap" role="img" aria-label="${unit.name}">
      ${unit.svg}
    </div>
    <div class="battle-stat-plate">
      <div class="battle-hp-bar-track" aria-hidden="true">
        <div class="battle-hp-bar-fill ${hpPct <= 35 ? 'battle-hp-bar-fill-low' : ''}" style="width: ${hpPct}%"></div>
      </div>
      <span class="battle-stat-lv">Lv.${unit.level}</span>
      <span class="battle-stat-nums">
        <span><span class="stat-heart">♥</span>${formatStat(unit.hp)}</span>
        <span><span class="stat-sword">⚔</span>${formatStat(effectiveAtk)}</span>
      </span>
    </div>
  `;
  return wrapper;
}

function renderBattleUnits() {
  if (!battleState) return;
  const firstLivingEnemy = battleState.enemyTeam.find((u) => !u.dead);
  const firstAttackerEnemy = battleState.enemyTeam.find((u) => !u.dead && !u.isWall);
  const firstLivingPlayer = battleState.playerTeam.find((u) => !u.dead);
  const firstAttackerPlayer = battleState.playerTeam.find((u) => !u.dead && !u.isWall);

  enemyTerritoryEl.innerHTML = '';
  battleState.enemyTeam.forEach((enemy) => {
    const isFrontTank = Boolean(firstLivingEnemy && firstLivingEnemy.uid === enemy.uid);
    const isFrontAttacker = Boolean(firstAttackerEnemy && firstAttackerEnemy.uid === enemy.uid);
    enemyTerritoryEl.appendChild(createBattleUnitElement(enemy, true, isFrontTank, isFrontAttacker));
  });

  playerTerritoryEl.innerHTML = '';
  battleState.playerTeam.forEach((playerUnit) => {
    const isFrontTank = Boolean(firstLivingPlayer && firstLivingPlayer.uid === playerUnit.uid);
    const isFrontAttacker = Boolean(firstAttackerPlayer && firstAttackerPlayer.uid === playerUnit.uid);
    playerTerritoryEl.appendChild(
      createBattleUnitElement(playerUnit, false, isFrontTank, isFrontAttacker)
    );
  });
}

function renderBattleSpeed() {
  const speed = getBattleSpeed();
  battleSpeedBtn.textContent = `${speed}倍速`;
  battleSpeedBtn.classList.toggle('battle-speed-btn-1x', speed === 1);
  battleSpeedBtn.classList.toggle('battle-speed-btn-3x', speed === 3);
  battleScreenEl.style.setProperty('--battle-speed', String(speed));
}

function renderBattleHudStrip() {
  if (!battleState) return;
  const mult = getPerfectMultiplier(battleState.perfectStreak);
  if (battleState.turn === 'enemy') {
    battleTurnBadge.textContent = '敵のターン';
    battleTurnBadge.classList.add('battle-turn-badge-enemy');
  } else if (battleState.turn === 'finished') {
    battleTurnBadge.textContent = 'バトル終了';
    battleTurnBadge.classList.remove('battle-turn-badge-enemy');
  } else {
    battleTurnBadge.textContent = 'あなたのターン';
    battleTurnBadge.classList.remove('battle-turn-badge-enemy');
  }

  typingComboBadge.textContent =
    battleState.perfectStreak > 0
      ? `PERFECT ×${mult.toFixed(1)} (${battleState.perfectStreak}連続)`
      : `攻撃倍率 ×${mult.toFixed(1)}`;
  typingComboBadge.classList.toggle('typing-combo-badge-active', battleState.perfectStreak > 0);

  if (typingShieldBadge) {
    const showShield = battleState.perfectStreak > 0 && battleState.comboShield > 0;
    typingShieldBadge.classList.toggle('hidden', !showShield);
    if (showShield) {
      typingShieldBadge.textContent = `🛡 ${battleState.comboShield}/${TYPING_SHIELD_MAX}`;
      typingShieldBadge.classList.toggle('typing-shield-badge-low', battleState.comboShield === 2);
      typingShieldBadge.classList.toggle(
        'typing-shield-badge-critical',
        battleState.comboShield === 1
      );
    } else {
      typingShieldBadge.classList.remove('typing-shield-badge-low', 'typing-shield-badge-critical');
    }
  }
}

function renderBattleTyping() {
  if (!battleState) return;
  renderBattleHudStrip();
  const word = battleState.currentWord;
  typingKanaEl.textContent = word.kana;
  typingRomajiEl.innerHTML = '';
  for (let i = 0; i < word.romaji.length; i++) {
    const span = document.createElement('span');
    span.textContent = word.romaji[i];
    if (i < battleState.typedIndex) {
      span.className = 'typing-char-done';
    } else if (i === battleState.typedIndex) {
      span.className = 'typing-char-next';
    } else {
      span.className = 'typing-char-rest';
    }
    typingRomajiEl.appendChild(span);
  }
}

function spawnProjectileFx(fromPlayer) {
  const orb = document.createElement('div');
  orb.className = `battle-projectile ${fromPlayer ? 'battle-projectile-player' : 'battle-projectile-enemy'}`;
  battleFxLayer.appendChild(orb);
  setTimeout(() => {
    orb.remove();
  }, Math.max(80, Math.round(280 / getBattleSpeed())));
}

function showUnitImpactAndPopup(uid, label, popupType, showBurst) {
  const unitEl = battleScreenEl.querySelector(`.battle-unit[data-uid="${uid}"]`);
  if (!unitEl) return;

  if (showBurst) {
    unitEl.classList.remove('battle-unit-hit');
    void unitEl.offsetWidth;
    unitEl.classList.add('battle-unit-hit');

    const burst = document.createElement('div');
    burst.className = 'battle-impact-burst';
    burst.innerHTML = `
      <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
        <polygon points="32,2 40,22 62,18 46,34 58,54 36,44 24,62 22,40 2,36 20,24" fill="#FACC15" stroke="#000000" stroke-width="3.5" stroke-linejoin="round" />
        <polygon points="32,14 37,26 50,24 41,34 48,46 35,40 28,50 27,37 14,35 25,27" fill="#FFFFFF" />
      </svg>
    `;
    unitEl.appendChild(burst);
    setTimeout(() => {
      burst.remove();
      unitEl.classList.remove('battle-unit-hit');
    }, Math.max(110, Math.round(360 / getBattleSpeed())));
  }

  const popup = document.createElement('div');
  popup.className = `battle-float-popup ${popupType}`;
  popup.textContent = label;
  unitEl.appendChild(popup);
  setTimeout(() => {
    popup.remove();
  }, Math.max(220, Math.round(700 / getBattleSpeed())));
}

function openBattleResultModal(didWin) {
  if (!battleState) return;
  battleState.turn = 'finished';
  battleState.isResolvingTurn = true;
  renderBattleHudStrip();

  battleResultHeader.classList.toggle('battle-result-header-win', didWin);
  battleResultHeader.classList.toggle('battle-result-header-lose', !didWin);
  battleResultTitle.textContent = didWin ? '勝利！' : '敗北...';

  battleResultSummary.textContent = `入力単語数: ${battleState.wordsCompleted}語 / パーフェクト: ${battleState.perfectWordsCount}回 / 最大倍率: ×${battleState.maxMultiplierReached.toFixed(1)}`;

  if (didWin) {
    playVictoryFanfare(profile.volume);
    battleRewardSection.classList.remove('hidden');
    battleRewardClaimedMsg.classList.add('hidden');
    battleRetryBtn.classList.add('hidden');
    battleResultEquipBtn.classList.add('hidden');
    battleResultHomeBtn.classList.add('hidden');
    battleRewardGrid.innerHTML = '';

    battleState.enemyTeam.forEach((enemyUnit) => {
      const ball = BALL_CATALOG[enemyUnit.ballId];
      if (!ball) return;
      const btn = document.createElement('button');
      const card = createBallCardHTML(ball, ball.name);
      btn.type = 'button';
      btn.className = 'ball-card';
      btn.style.backgroundColor = card.bg;
      btn.setAttribute('aria-label', `${ball.name}を受け取る`);
      btn.innerHTML = card.html;
      btn.addEventListener('click', () => {
        if (!battleState || battleState.rewardClaimed) return;
        battleState.rewardClaimed = true;
        playSaveSound(profile.volume);

        if (!profile.ownedBalls.includes(ball.id)) {
          profile.ownedBalls = [...profile.ownedBalls, ball.id];
        }
        profile.ballCounts = {
          ...profile.ballCounts,
          [ball.id]: (profile.ballCounts[ball.id] || 0) + 1,
        };
        saveProfile(profile);

        Array.from(battleRewardGrid.querySelectorAll('button')).forEach((b) => {
          b.disabled = true;
        });
        btn.disabled = false;
        btn.classList.add('battle-reward-card-picked');

        battleRewardClaimedMsg.textContent = `${ball.name} を手に入れた！（所持数: ×${profile.ballCounts[ball.id]}）`;
        battleRewardClaimedMsg.classList.remove('hidden');
        battleRetryBtn.classList.remove('hidden');
        battleResultEquipBtn.classList.remove('hidden');
        battleResultHomeBtn.classList.remove('hidden');
      });
      battleRewardGrid.appendChild(btn);
    });
  } else {
    playKnockoutSound(profile.volume);
    battleRewardSection.classList.add('hidden');
    battleRewardGrid.innerHTML = '';
    battleRewardClaimedMsg.classList.add('hidden');
    battleRetryBtn.classList.remove('hidden');
    battleResultEquipBtn.classList.add('hidden');
    battleResultHomeBtn.classList.remove('hidden');
  }

  battleResultModal.classList.remove('hidden');
}

async function handleUnitDefeat(unit, opposingTeam, ownTeam, sessionId) {
  if (!unit.dead) return;
  unit.isHardened = false;
  unit.atkDebuffTurns = 0;
  unit.atkMultiplier = 1;
  unit.missDebuffTurns = 0;

  if (unit.isWall) return;

  // Sponge Ball once-per-battle revive at half max HP
  if (unit.ballId === 'sponge_ball' && !unit.revived) {
    await battleDelay(260);
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
    unit.revived = true;
    unit.dead = false;
    unit.hp = roundStat(unit.maxHp / 2);
    renderBattleUnits();
    playHealSound(profile.volume);
    showUnitImpactAndPopup(unit.uid, `復活! HP ${formatStat(unit.hp)}`, 'battle-float-heal', false);
    return;
  }

  // Wood Ball on-death summons a front wooden wall with half max HP (front ally ball can still move/attack)
  if (unit.ballId === 'wood_ball' && !unit.summonedWall) {
    unit.summonedWall = true;
    await battleDelay(220);
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
    const wallUnit = createWoodWallUnit(unit);
    const unitIdx = ownTeam.indexOf(unit);
    ownTeam.splice(unitIdx >= 0 ? unitIdx + 1 : 0, 0, wallUnit);
    renderBattleUnits();
    playHealSound(profile.volume);
    showUnitImpactAndPopup(wallUnit.uid, `壁召喚! HP ${formatStat(wallUnit.hp)}`, 'battle-float-shield', false);
    return;
  }

  // Plastic Ball death explosion (3x ATK damage to opposing front ball)
  if (unit.ballId === 'plastic_ball' && !unit.exploded) {
    unit.exploded = true;
    const unitEl = battleScreenEl.querySelector(`.battle-unit[data-uid="${unit.uid}"]`);
    if (unitEl) {
      unitEl.classList.add('battle-unit-swell');
    }
    await battleDelay(220);
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;

    const blastTarget = opposingTeam.find((u) => !u.dead);
    if (blastTarget) {
      let boomDmg = unit.atk * 3;
      if (blastTarget.isHardened) {
        boomDmg *= 0.5;
      }
      boomDmg = roundStat(boomDmg);
      blastTarget.hp = Math.max(0, roundStat(blastTarget.hp - boomDmg));
      if (blastTarget.hp <= 0) {
        blastTarget.hp = 0;
        blastTarget.dead = true;
        playKnockoutSound(profile.volume);
      } else {
        playAttackHitSound(profile.volume, true);
      }
      renderBattleUnits();
      showUnitImpactAndPopup(unit.uid, '大爆発!', 'battle-float-boom', true);
      showUnitImpactAndPopup(
        blastTarget.uid,
        `-${formatStat(boomDmg)} (爆発!)`,
        'battle-float-boom',
        true
      );

      if (blastTarget.dead) {
        await handleUnitDefeat(blastTarget, ownTeam, opposingTeam, sessionId);
      }
    }
  }
}

async function executeUnitTurn(attacker, ownTeam, defenderTeam, isPlayerAttacker, typingMultiplier, sessionId) {
  attacker.turnCounter += 1;
  attacker.isHardened = false;

  // Stone Ball: every 3rd turn enters "固まる" state (halves incoming damage, skips attack)
  if (attacker.ballId === 'stone_ball' && attacker.turnCounter % 3 === 0) {
    attacker.isHardened = true;
    renderBattleUnits();
    playHealSound(profile.volume);
    showUnitImpactAndPopup(attacker.uid, '固まる! (半減)', 'battle-float-shield', false);
    await battleDelay(320);
    return;
  }

  const defender = defenderTeam.find((u) => !u.dead);
  if (!defender) return;

  // Grass Ball miss debuff check
  if (attacker.missDebuffTurns > 0) {
    attacker.missDebuffTurns -= 1;
    if (Math.random() < 0.5) {
      if (attacker.atkDebuffTurns > 0) {
        attacker.atkDebuffTurns -= 1;
        if (attacker.atkDebuffTurns === 0) attacker.atkMultiplier = 1;
      }
      const attEl = battleScreenEl.querySelector(`.battle-unit[data-uid="${attacker.uid}"]`);
      if (attEl) {
        attEl.classList.add(isPlayerAttacker ? 'battle-unit-lunge-left' : 'battle-unit-lunge-right');
      }
      await battleDelay(180);
      if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
      renderBattleUnits();
      playErrorSound(profile.volume);
      showUnitImpactAndPopup(defender.uid, 'MISS!', 'battle-float-miss', false);
      return;
    }
  }

  attacker.attacksMade += 1;
  let dmg = attacker.atk * (isPlayerAttacker ? typingMultiplier : 1);

  if (attacker.atkDebuffTurns > 0) {
    dmg *= attacker.atkMultiplier;
    attacker.atkDebuffTurns -= 1;
    if (attacker.atkDebuffTurns === 0) {
      attacker.atkMultiplier = 1;
    }
  }

  let isRubberCrit = false;
  if (attacker.ballId === 'rubber_ball' && attacker.attacksMade % 2 === 0) {
    dmg *= 1.5;
    isRubberCrit = true;
  }

  const isSuperJump = attacker.ballId === 'super_ball' && attacker.attacksMade % 3 === 0;
  const isBushAttack = attacker.ballId === 'grass_ball' && attacker.turnCounter % 4 === 0;

  let wasHalved = false;
  if (defender.isHardened) {
    dmg *= 0.5;
    wasHalved = true;
  }
  dmg = roundStat(dmg);

  const attackerEl = battleScreenEl.querySelector(`.battle-unit[data-uid="${attacker.uid}"]`);
  if (attackerEl) {
    if (isSuperJump) {
      attackerEl.classList.add(
        isPlayerAttacker ? 'battle-unit-super-jump-left' : 'battle-unit-super-jump-right'
      );
    } else {
      attackerEl.classList.add(
        isPlayerAttacker ? 'battle-unit-lunge-left' : 'battle-unit-lunge-right'
      );
    }
  }
  spawnProjectileFx(isPlayerAttacker);

  await battleDelay(isSuperJump ? 260 : 210);
  if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;

  defender.hp = Math.max(0, roundStat(defender.hp - dmg));
  const isStrongHit = (isPlayerAttacker && typingMultiplier > 1) || isRubberCrit || isSuperJump || isBushAttack;
  playAttackHitSound(profile.volume, isStrongHit);

  if (defender.hp <= 0) {
    defender.hp = 0;
    defender.dead = true;
    playKnockoutSound(profile.volume);
  } else {
    if (isSuperJump) {
      defender.atkDebuffTurns = 2;
      defender.atkMultiplier = 0.75;
    }
    if (isBushAttack) {
      defender.missDebuffTurns = 2;
    }
  }

  renderBattleUnits();

  let dmgLabel = `-${formatStat(dmg)}`;
  if (isRubberCrit) dmgLabel += ' (1.5倍!)';
  else if (isPlayerAttacker && typingMultiplier > 1) dmgLabel += ` (×${typingMultiplier.toFixed(1)})`;
  if (wasHalved) dmgLabel += ' (半減)';

  showUnitImpactAndPopup(
    defender.uid,
    dmgLabel,
    isStrongHit ? 'battle-float-crit' : 'battle-float-dmg',
    true
  );

  if (!defender.dead && isSuperJump) {
    showUnitImpactAndPopup(defender.uid, '特大ジャンプ! 攻75%', 'battle-float-debuff', false);
  } else if (!defender.dead && isBushAttack) {
    showUnitImpactAndPopup(defender.uid, 'しげみ! 命中50%', 'battle-float-heal', false);
  }

  if (defender.dead) {
    await handleUnitDefeat(defender, ownTeam, defenderTeam, sessionId);
  }
}

async function resolveCombatRound(typingMultiplier) {
  if (!battleState) return;
  const sessionId = battleState.sessionId;
  battleState.isResolvingTurn = true;

  // 1. Player Front Non-Wall Ball Turn (ally front unit can still move/attack past a summoned wall)
  const playerFront = battleState.playerTeam.find((u) => !u.dead && !u.isWall);
  if (playerFront && battleState.enemyTeam.some((u) => !u.dead)) {
    await executeUnitTurn(
      playerFront,
      battleState.playerTeam,
      battleState.enemyTeam,
      true,
      typingMultiplier,
      sessionId
    );
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
  }

  if (battleState.enemyTeam.every((u) => u.dead)) {
    await battleDelay(480);
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
    openBattleResultModal(true);
    return;
  }

  if (battleState.playerTeam.every((u) => u.dead || u.isWall)) {
    await battleDelay(480);
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
    openBattleResultModal(false);
    return;
  }

  // 2. Enemy Front Non-Wall Ball Turn
  battleState.turn = 'enemy';
  renderBattleHudStrip();
  await battleDelay(360);
  if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;

  const activeEnemy = battleState.enemyTeam.find((u) => !u.dead && !u.isWall);
  if (activeEnemy && battleState.playerTeam.some((u) => !u.dead)) {
    await executeUnitTurn(
      activeEnemy,
      battleState.enemyTeam,
      battleState.playerTeam,
      false,
      1,
      sessionId
    );
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
  }

  if (battleState.enemyTeam.every((u) => u.dead)) {
    await battleDelay(480);
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
    openBattleResultModal(true);
    return;
  }

  if (battleState.playerTeam.every((u) => u.dead || u.isWall)) {
    await battleDelay(480);
    if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;
    openBattleResultModal(false);
    return;
  }

  // 3. Advance to Next Word & Player Turn
  await battleDelay(260);
  if (!battleState || battleState.sessionId !== sessionId || currentScreen !== 'battle') return;

  battleState.turn = 'player';
  battleState.currentWord = pickNextWord(battleState.currentWord.romaji);
  battleState.typedIndex = 0;
  Object.assign(battleState, prepareNextTypingWord(battleState));
  battleState.isResolvingTurn = false;
  renderBattleTyping();
}

function handleTypingChar(rawChar) {
  if (
    currentScreen !== 'battle' ||
    isMatchmaking ||
    !battleState ||
    battleState.isResolvingTurn ||
    battleState.turn !== 'player' ||
    !noticeModal.classList.contains('hidden') ||
    !settingsModal.classList.contains('hidden') ||
    !ballDetailModal.classList.contains('hidden') ||
    !battleResultModal.classList.contains('hidden') ||
    !enemyGuideModal.classList.contains('hidden') ||
    !surveyModal.classList.contains('hidden') ||
    !adminCrownModal.classList.contains('hidden') ||
    !presenceModal.classList.contains('hidden')
  ) {
    return;
  }

  const ch = rawChar.toLowerCase();
  if (!/^[a-z-]$/.test(ch)) return;

  const word = battleState.currentWord;
  const expected = word.romaji[battleState.typedIndex];
  if (ch === expected) {
    battleState.typedIndex += 1;
    battleTypingBox.classList.remove('typing-error-flash');

    if (battleState.typedIndex >= word.romaji.length) {
      const completed = completeTypingWord(battleState);
      Object.assign(battleState, completed.state);
      playSaveSound(profile.volume);
      renderBattleTyping();
      resolveCombatRound(completed.multiplier);
    } else {
      playClickSound(profile.volume);
      renderBattleTyping();
    }
  } else {
    const mistake = applyTypingMistake(battleState);
    Object.assign(battleState, mistake.state);
    playErrorSound(profile.volume);
    renderBattleHudStrip();
    if (mistake.outcome === 'shield_damaged' && typingShieldBadge) {
      typingShieldBadge.classList.remove('typing-shield-hit');
      void typingShieldBadge.offsetWidth;
      typingShieldBadge.classList.add('typing-shield-hit');
    }
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
  battleResultModal.classList.add('hidden');
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

  if (!isBattle) {
    battleSessionCounter += 1;
    battleState = null;
    battleResultModal.classList.add('hidden');
  }

  topHudEl.classList.toggle('hidden', isBattle);
  homeTopLeftActions.classList.toggle('hidden', !isHome);
  homeScreenEl.classList.toggle('hidden', !isHome);
  modeScreenEl.classList.toggle('hidden', !isMode);
  equipScreenEl.classList.toggle('hidden', !isEquip);
  battleScreenEl.classList.toggle('hidden', !isBattle);
  equipBackBtn.classList.toggle('hidden', isHome || isBattle);

  if (isEquip) {
    equipMode = 'equip';
    equipStatusMsg.classList.add('hidden');
    ballSearchQuery = '';
    ballSearchInput.value = '';
    renderEquipScreen();
  }

  if (isBattle) {
    battleFxLayer.innerHTML = '';
    initBattleState();
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
  if (e.key === 'Escape') {
    if (!adminCrownModal.classList.contains('hidden')) {
      closeAdminCrownModal();
      return;
    }
    if (!presenceModal.classList.contains('hidden')) {
      closePresenceModal();
      return;
    }
    if (!enemyGuideModal.classList.contains('hidden')) {
      closeEnemyGuideModal();
      return;
    }
    if (!surveyModal.classList.contains('hidden')) {
      closeSurveyModal();
      return;
    }
    if (!ballDetailModal.classList.contains('hidden')) {
      closeBallDetailModal();
      return;
    }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.activeElement === mobileTypingInput) return;
  if (e.key.length === 1) {
    handleTypingChar(e.key);
  }
});

equipModeEquipBtn.addEventListener('click', () => {
  if (equipMode === 'equip') return;
  playClickSound(profile.volume);
  equipMode = 'equip';
  equipStatusMsg.classList.add('hidden');
  renderEquipScreen();
});

equipModeInfoBtn.addEventListener('click', () => {
  if (equipMode === 'info') return;
  playClickSound(profile.volume);
  equipMode = 'info';
  equipStatusMsg.classList.add('hidden');
  renderEquipScreen();
});

ballDetailXBtn.addEventListener('click', closeBallDetailModal);
ballDetailCloseBtn.addEventListener('click', closeBallDetailModal);
ballDetailModal.addEventListener('click', (e) => {
  if (e.target === ballDetailModal) {
    closeBallDetailModal();
  }
});

battleRetryBtn.addEventListener('click', () => {
  battleResultModal.classList.add('hidden');
  startVsMatchmaking();
});

battleResultEquipBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  setScreen('equip');
});

battleResultHomeBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  setScreen('home');
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
  triggerPresenceHeartbeat();
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

// Enemy Guide Modal (❓)
function openEnemyGuideModal() {
  playOpenSound(profile.volume);
  enemyGuideModal.classList.remove('hidden');
}

function closeEnemyGuideModal() {
  if (enemyGuideModal.classList.contains('hidden')) return;
  playClickSound(profile.volume);
  enemyGuideModal.classList.add('hidden');
}

openEnemyGuideBtn.addEventListener('click', openEnemyGuideModal);
enemyGuideXBtn.addEventListener('click', closeEnemyGuideModal);
enemyGuideCloseBtn.addEventListener('click', closeEnemyGuideModal);
enemyGuideModal.addEventListener('click', (e) => {
  if (e.target === enemyGuideModal) closeEnemyGuideModal();
});

// Admin Crown Modal (👑)
function setCrownCodeError(msg) {
  if (!msg) {
    crownCodeError.textContent = '';
    crownCodeError.classList.add('hidden');
    return;
  }
  crownCodeError.textContent = msg;
  crownCodeError.classList.remove('hidden');
}

function renderCrownModalView() {
  crownUnverifiedView.classList.toggle('hidden', isAdminAuthenticated);
  crownVerifiedView.classList.toggle('hidden', !isAdminAuthenticated);
}

async function openAdminCrownModal() {
  playOpenSound(profile.volume);
  crownCodeInput.value = '';
  setCrownCodeError('');
  renderCrownModalView();
  adminCrownModal.classList.remove('hidden');
  isAdminAuthenticated = await fetchAdminStatus();
  renderHud();
  renderCrownModalView();
  if (!isAdminAuthenticated) {
    crownCodeInput.focus();
  }
}

function closeAdminCrownModal() {
  if (adminCrownModal.classList.contains('hidden')) return;
  playClickSound(profile.volume);
  crownCodeInput.value = '';
  setCrownCodeError('');
  adminCrownModal.classList.add('hidden');
}

async function handleCrownCodeSubmit() {
  const code = crownCodeInput.value.trim();
  if (!code) {
    playErrorSound(profile.volume);
    setCrownCodeError('コードを入力してください。');
    return;
  }
  crownCodeSubmitBtn.disabled = true;
  setCrownCodeError('');
  try {
    await verifyAdminCodeOnServer(code, profile.username);
    isAdminAuthenticated = true;
    crownCodeInput.value = '';
    playSaveSound(profile.volume);
    renderHud();
    renderCrownModalView();
    triggerPresenceHeartbeat();
  } catch (err) {
    playErrorSound(profile.volume);
    setCrownCodeError(err instanceof Error ? err.message : 'コードが正しくありません。');
  } finally {
    crownCodeSubmitBtn.disabled = false;
  }
}

openAdminCrownBtn.addEventListener('click', openAdminCrownModal);
adminCrownXBtn.addEventListener('click', closeAdminCrownModal);
crownCancelBtn.addEventListener('click', closeAdminCrownModal);
crownDoneBtn.addEventListener('click', closeAdminCrownModal);
adminCrownModal.addEventListener('click', (e) => {
  if (e.target === adminCrownModal) closeAdminCrownModal();
});
crownCodeSubmitBtn.addEventListener('click', handleCrownCodeSubmit);
crownCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleCrownCodeSubmit();
  }
});
crownLogoutBtn.addEventListener('click', async () => {
  playClickSound(profile.volume);
  stopAdminSurveySubscription();
  await logoutAdminSession();
  isAdminAuthenticated = false;
  renderHud();
  closeAdminCrownModal();
  triggerPresenceHeartbeat();
});

// Survey & Admin Modal (No Google Login; Name uses profile.username from Settings)
function setSurveyFeedback(msg, isError) {
  if (!msg) {
    surveyFeedbackMsg.textContent = '';
    surveyFeedbackMsg.classList.add('hidden');
    surveyFeedbackMsg.classList.remove('survey-feedback-error');
    return;
  }
  surveyFeedbackMsg.textContent = msg;
  surveyFeedbackMsg.classList.toggle('survey-feedback-error', Boolean(isError));
  surveyFeedbackMsg.classList.remove('hidden');
}

function renderSurveyView() {
  surveyForm.classList.toggle('hidden', surveySubView !== 'form');
  adminListPanel.classList.toggle('hidden', surveySubView !== 'admin-list');

  const len = surveyContentInput.value.length;
  surveyContentCounter.textContent = `${len} / ${SURVEY_CONTENT_MAX}文字`;
  surveyQuotaBadge.textContent = `本日残り ${surveyQuota.remaining} / ${surveyQuota.limit}回`;
  surveySubmitBtn.disabled = isSurveyBusy || surveyQuota.remaining <= 0;
}

async function refreshSurveyQuota() {
  surveyQuota = await getTodaySurveyQuota();
  renderSurveyView();
}

async function openSurveyModal() {
  playOpenSound(profile.volume);
  surveySubView = 'form';
  setSurveyFeedback('', false);
  surveyModal.classList.remove('hidden');
  renderSurveyView();
  await refreshSurveyQuota();
}

let unsubscribeAdminSurveys = null;

function stopAdminSurveySubscription() {
  if (typeof unsubscribeAdminSurveys === 'function') {
    unsubscribeAdminSurveys();
    unsubscribeAdminSurveys = null;
  }
}

function closeSurveyModal() {
  if (surveyModal.classList.contains('hidden')) return;
  playClickSound(profile.volume);
  stopAdminSurveySubscription();
  adminSurveyList.innerHTML = '';
  surveySubView = 'form';
  surveyModal.classList.add('hidden');
}

function formatSurveyDate(isoString) {
  if (!isoString) return '';
  try {
    const dateObj = new Date(isoString);
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  } catch {
    return '';
  }
}

function createVerifiedBadgeElement() {
  const badge = document.createElement('span');
  badge.className = 'verified-badge verified-badge-sm';
  badge.title = '管理者認証済み';
  badge.setAttribute('aria-label', '管理者認証済み');
  badge.innerHTML = `
    <svg viewBox="0 0 24 24" class="verified-badge-svg" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#38BDF8" stroke="#000000" stroke-width="2.2" />
      <path d="M7.5 12.2 10.6 15.3 16.8 9.1" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `.trim();
  return badge;
}

function renderAdminSurveyItems(items) {
  adminSurveyList.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    adminListStatus.textContent = 'まだアンケートは届いていません。';
    adminListStatus.classList.remove('survey-feedback-error', 'hidden');
    return;
  }
  adminListStatus.classList.add('hidden');
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'admin-survey-item';

    const line = document.createElement('div');
    line.className = 'admin-survey-line';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.authorName || 'プレイヤー';
    line.appendChild(nameSpan);
    if (item.isAdminVerified) {
      line.appendChild(document.createTextNode(' '));
      line.appendChild(createVerifiedBadgeElement());
    }
    line.appendChild(document.createTextNode(`：${item.content || ''}`));
    li.appendChild(line);

    const timeText = formatSurveyDate(item.createdAt);
    if (timeText) {
      const timeEl = document.createElement('div');
      timeEl.className = 'admin-survey-time';
      timeEl.textContent = timeText;
      li.appendChild(timeEl);
    }

    adminSurveyList.appendChild(li);
  });
}

async function startAdminSurveyRealtimeView() {
  stopAdminSurveySubscription();
  adminRefreshBtn.disabled = true;
  adminListStatus.textContent = 'リアルタイム読み込み中...';
  adminListStatus.classList.remove('survey-feedback-error', 'hidden');
  adminSurveyList.innerHTML = '';

  try {
    unsubscribeAdminSurveys = await subscribeAdminSurveys(
      (items) => {
        adminRefreshBtn.disabled = false;
        renderAdminSurveyItems(items);
      },
      async () => {
        try {
          const items = await fetchAdminSurveys();
          renderAdminSurveyItems(items);
        } catch (err) {
          if (err && err.status === 403) {
            isAdminAuthenticated = false;
            renderHud();
            surveySubView = 'form';
            renderSurveyView();
            setSurveyFeedback('管理者ではないため閲覧できません。', true);
            return;
          }
          adminListStatus.textContent =
            err instanceof Error ? err.message : 'アンケートの読み込みに失敗しました。';
          adminListStatus.classList.add('survey-feedback-error');
          adminListStatus.classList.remove('hidden');
        } finally {
          adminRefreshBtn.disabled = false;
        }
      }
    );
  } catch (err) {
    adminRefreshBtn.disabled = false;
    if (err && err.status === 403) {
      isAdminAuthenticated = false;
      renderHud();
      surveySubView = 'form';
      renderSurveyView();
      setSurveyFeedback('管理者ではないため閲覧できません。', true);
      return;
    }
    adminListStatus.textContent =
      err instanceof Error ? err.message : 'アンケートの読み込みに失敗しました。';
    adminListStatus.classList.add('survey-feedback-error');
    adminListStatus.classList.remove('hidden');
  }
}

async function loadAndRenderAdminSurveys() {
  adminRefreshBtn.disabled = true;
  adminListStatus.textContent = '読み込み中...';
  adminListStatus.classList.remove('survey-feedback-error', 'hidden');

  try {
    const items = await fetchAdminSurveys();
    renderAdminSurveyItems(items);
  } catch (err) {
    if (err && err.status === 403) {
      isAdminAuthenticated = false;
      renderHud();
      surveySubView = 'form';
      renderSurveyView();
      setSurveyFeedback('管理者ではないため閲覧できません。', true);
      return;
    }
    adminListStatus.textContent =
      err instanceof Error ? err.message : 'アンケートの読み込みに失敗しました。';
    adminListStatus.classList.add('survey-feedback-error');
    adminListStatus.classList.remove('hidden');
  } finally {
    adminRefreshBtn.disabled = false;
  }
}

openSurveyBtn.addEventListener('click', openSurveyModal);
surveyXBtn.addEventListener('click', closeSurveyModal);
surveyModal.addEventListener('click', (e) => {
  if (e.target === surveyModal) closeSurveyModal();
});

surveyContentInput.addEventListener('input', () => {
  const len = surveyContentInput.value.length;
  surveyContentCounter.textContent = `${len} / ${SURVEY_CONTENT_MAX}文字`;
});

surveyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSurveyBusy) return;
  const content = surveyContentInput.value.trim();
  if (!content) {
    playErrorSound(profile.volume);
    setSurveyFeedback('追加して欲しい内容を入力してください。', true);
    return;
  }

  isSurveyBusy = true;
  setSurveyFeedback('', false);
  renderSurveyView();
  try {
    surveyQuota = await submitSurveyFeedback({
      authorName: profile.username,
      content,
    });
    playSaveSound(profile.volume);
    surveyContentInput.value = '';
    setSurveyFeedback(
      `アンケートを送信しました！ありがとうございます（本日残り ${surveyQuota.remaining} / ${surveyQuota.limit}回）`,
      false
    );
  } catch (err) {
    playErrorSound(profile.volume);
    setSurveyFeedback(
      err instanceof Error ? err.message : '送信に失敗しました。',
      true
    );
  } finally {
    isSurveyBusy = false;
    await refreshSurveyQuota();
  }
});

openAdminSurveyBtn.addEventListener('click', async () => {
  setSurveyFeedback('', false);
  isAdminAuthenticated = await fetchAdminStatus();
  renderHud();
  if (!isAdminAuthenticated) {
    playErrorSound(profile.volume);
    setSurveyFeedback('管理者ではないため閲覧できません。', true);
    return;
  }
  playOpenSound(profile.volume);
  surveySubView = 'admin-list';
  renderSurveyView();
  await startAdminSurveyRealtimeView();
});

adminRefreshBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  loadAndRenderAdminSurveys();
});

adminBackFromListBtn.addEventListener('click', () => {
  playClickSound(profile.volume);
  stopAdminSurveySubscription();
  surveySubView = 'form';
  renderSurveyView();
});

// Real-Time Presence Modal (👥) & Heartbeat Lifecycle
let latestPresenceRecords = [];
let unsubscribePresence = null;
let presenceRefreshTimer = null;
let presenceHeartbeatTimer = null;
let presenceMidnightTimer = null;

function formatPresenceTime(isoString) {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}

function buildPresenceListItem(record, showOnlineStyle) {
  const li = document.createElement('li');
  li.className = 'presence-item';

  const main = document.createElement('div');
  main.className = 'presence-item-main';

  const dot = document.createElement('span');
  dot.className = record.activeNow ? 'presence-dot-online' : 'presence-dot-offline';
  dot.setAttribute('aria-hidden', 'true');
  main.appendChild(dot);

  const nameEl = document.createElement('span');
  nameEl.className = 'presence-item-name';
  nameEl.textContent = record.username || 'プレイヤー';
  main.appendChild(nameEl);

  if (record.isAdminVerified) {
    main.appendChild(createVerifiedBadgeElement());
  }

  if (record.isSelf) {
    const selfTag = document.createElement('span');
    selfTag.className = 'presence-self-tag';
    selfTag.textContent = 'あなた';
    main.appendChild(selfTag);
  }

  li.appendChild(main);

  const meta = document.createElement('span');
  meta.className = 'presence-item-meta';
  if (showOnlineStyle || record.activeNow) {
    meta.textContent = 'オンライン';
  } else {
    const timeStr = formatPresenceTime(record.lastLoginAt || record.lastSeenAt);
    meta.textContent = timeStr ? `${timeStr} ログイン` : '本日ログイン';
  }
  li.appendChild(meta);

  return li;
}

function renderPresenceLists() {
  const syncedNowMs = getSyncedNowMs();
  const { todayDayKey, onlineUsers, todayLogins } = splitPresenceRecords(
    latestPresenceRecords,
    syncedNowMs,
    getSelfVisitorId()
  );

  presenceDayBadge.textContent = `${todayDayKey}（00:00更新）`;
  presenceOnlineCount.textContent = `${onlineUsers.length}人`;
  presenceTodayCount.textContent = `${todayLogins.length}人`;

  presenceOnlineList.innerHTML = '';
  if (onlineUsers.length === 0) {
    const emptyEl = document.createElement('li');
    emptyEl.className = 'presence-empty';
    emptyEl.textContent = '現在ログインしている人はいません。';
    presenceOnlineList.appendChild(emptyEl);
  } else {
    onlineUsers.forEach((record) => {
      presenceOnlineList.appendChild(buildPresenceListItem(record, true));
    });
  }

  presenceTodayList.innerHTML = '';
  if (todayLogins.length === 0) {
    const emptyEl = document.createElement('li');
    emptyEl.className = 'presence-empty';
    emptyEl.textContent = '今日ログインした人はまだいません。';
    presenceTodayList.appendChild(emptyEl);
  } else {
    todayLogins.forEach((record) => {
      presenceTodayList.appendChild(buildPresenceListItem(record, false));
    });
  }
}

function applyPresenceSnapshotRecords(records) {
  if (!Array.isArray(records)) return;
  latestPresenceRecords = records.map((rec) => ({
    ...rec,
    lastLoginAtMs: rec.lastLoginAt ? Date.parse(rec.lastLoginAt) || 0 : 0,
    lastSeenAtMs: rec.lastSeenAt ? Date.parse(rec.lastSeenAt) || 0 : 0,
  }));
  if (!presenceModal.classList.contains('hidden')) {
    renderPresenceLists();
  }
}

function stopPresenceModalSync() {
  if (typeof unsubscribePresence === 'function') {
    unsubscribePresence();
    unsubscribePresence = null;
  }
  if (presenceRefreshTimer) {
    clearInterval(presenceRefreshTimer);
    presenceRefreshTimer = null;
  }
}

async function triggerPresenceHeartbeat() {
  const data = await sendPresenceHeartbeat(profile.username);
  if (data && data.record) {
    const idx = latestPresenceRecords.findIndex((item) => item.visitorId === data.record.visitorId);
    const updatedRecord = {
      ...data.record,
      lastLoginAtMs: data.record.lastLoginAt ? Date.parse(data.record.lastLoginAt) || 0 : 0,
      lastSeenAtMs: data.record.lastSeenAt ? Date.parse(data.record.lastSeenAt) || 0 : 0,
    };
    if (idx >= 0) {
      latestPresenceRecords = [
        ...latestPresenceRecords.slice(0, idx),
        updatedRecord,
        ...latestPresenceRecords.slice(idx + 1),
      ];
    } else {
      latestPresenceRecords = [updatedRecord, ...latestPresenceRecords];
    }
    if (!presenceModal.classList.contains('hidden')) {
      renderPresenceLists();
    }
  }
  return data;
}

async function refreshPresenceFromServer() {
  try {
    const snapshot = await fetchPresenceSnapshot();
    if (snapshot && Array.isArray(snapshot.records)) {
      applyPresenceSnapshotRecords(snapshot.records);
    }
  } catch {
    // Keep current list on transient polling error
  }
}

async function openPresenceModal() {
  playOpenSound(profile.volume);
  stopPresenceModalSync();
  presenceModal.classList.remove('hidden');
  presenceDayBadge.textContent = `${getJstDateParts(getSyncedNowMs()).dayKey}（00:00更新）`;
  renderPresenceLists();

  triggerPresenceHeartbeat().catch(() => {});
  refreshPresenceFromServer();

  unsubscribePresence = await subscribePresence(
    (records) => {
      latestPresenceRecords = records;
      if (!presenceModal.classList.contains('hidden')) {
        renderPresenceLists();
      }
    },
    () => {
      refreshPresenceFromServer();
    }
  );

  presenceRefreshTimer = setInterval(() => {
    if (!presenceModal.classList.contains('hidden')) {
      refreshPresenceFromServer();
      renderPresenceLists();
    }
  }, 4000);
}

function closePresenceModal() {
  if (presenceModal.classList.contains('hidden')) return;
  playClickSound(profile.volume);
  stopPresenceModalSync();
  presenceModal.classList.add('hidden');
}

function scheduleJstMidnightRollover() {
  if (presenceMidnightTimer) {
    clearTimeout(presenceMidnightTimer);
  }
  const waitMs = Math.max(1000, getMsUntilNextJstMidnight(getSyncedNowMs()) + 500);
  presenceMidnightTimer = setTimeout(() => {
    if (document.visibilityState !== 'hidden') {
      triggerPresenceHeartbeat().catch(() => {});
    }
    if (!presenceModal.classList.contains('hidden')) {
      renderPresenceLists();
    }
    scheduleJstMidnightRollover();
  }, waitMs);
}

function startPresenceLifecycle() {
  registerActiveTab();
  triggerPresenceHeartbeat().catch(() => {});
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
  }
  presenceHeartbeatTimer = setInterval(() => {
    if (document.visibilityState !== 'hidden') {
      triggerPresenceHeartbeat().catch(() => {});
    } else {
      registerActiveTab();
    }
  }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  scheduleJstMidnightRollover();
}

let didUnloadCurrentTab = false;
function handleTabUnload() {
  if (didUnloadCurrentTab) return;
  didUnloadCurrentTab = true;
  const isLastTab = unregisterActiveTab();
  if (isLastTab) {
    sendPresenceLeave();
  }
}

openPresenceBtn.addEventListener('click', openPresenceModal);
presenceXBtn.addEventListener('click', closePresenceModal);
presenceCloseBtn.addEventListener('click', closePresenceModal);
presenceModal.addEventListener('click', (e) => {
  if (e.target === presenceModal) closePresenceModal();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    didUnloadCurrentTab = false;
    registerActiveTab();
    triggerPresenceHeartbeat().catch(() => {});
    if (!presenceModal.classList.contains('hidden')) {
      refreshPresenceFromServer();
    }
  }
});

window.addEventListener('pagehide', handleTabUnload);
window.addEventListener('beforeunload', handleTabUnload);
window.addEventListener('pageshow', () => {
  didUnloadCurrentTab = false;
  registerActiveTab();
  triggerPresenceHeartbeat().catch(() => {});
});

// Initialize
buildEditorDOM();
renderHud();
ensureFirebase().catch(() => {});
fetchAdminStatus()
  .then((authed) => {
    isAdminAuthenticated = authed;
    renderHud();
  })
  .finally(() => {
    startPresenceLifecycle();
  });

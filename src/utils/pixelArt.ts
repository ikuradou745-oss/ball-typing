export const GRID_SIZE = 16;
export const TOTAL_PIXELS = GRID_SIZE * GRID_SIZE;
export const DEFAULT_PIXEL_COLOR = '#FFFFFF';
export const DEFAULT_USERNAME = 'プレイヤー1';
export const DEFAULT_VOLUME = 70;
export const MIN_USERNAME_LENGTH = 2;
export const MAX_USERNAME_LENGTH = 12;

const STORAGE_KEY = 'ball_typing_profile_v1';

export interface PlayerProfile {
  username: string;
  pixels: string[];
  volume: number;
}

export const PALETTE_COLORS: { name: string; hex: string }[] = [
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

const DEFAULT_BALL_COLOR_MAP: Record<string, string> = {
  '.': '#FFFFFF',
  K: '#111827',
  B: '#3196E2',
  L: '#7DD3FC',
  D: '#1D4ED8',
  Y: '#F6C116',
  W: '#FFFFFF',
};

export function createEmptyGrid(fillColor: string = DEFAULT_PIXEL_COLOR): string[] {
  return Array.from({ length: TOTAL_PIXELS }, () => fillColor);
}

export function createDefaultPixels(): string[] {
  const result: string[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = DEFAULT_BALL_ROWS[r] ?? '................';
    for (let c = 0; c < GRID_SIZE; c++) {
      const ch = row[c] ?? '.';
      result.push(DEFAULT_BALL_COLOR_MAP[ch] ?? DEFAULT_PIXEL_COLOR);
    }
  }
  return result;
}

export function isValidUsername(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= MIN_USERNAME_LENGTH && trimmed.length <= MAX_USERNAME_LENGTH;
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        username: DEFAULT_USERNAME,
        pixels: createDefaultPixels(),
        volume: DEFAULT_VOLUME,
      };
    }
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
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
    return { username, pixels, volume };
  } catch {
    return {
      username: DEFAULT_USERNAME,
      pixels: createDefaultPixels(),
      volume: DEFAULT_VOLUME,
    };
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage quota or private mode fallback
  }
}

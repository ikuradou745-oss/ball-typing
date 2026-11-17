import { useEffect, useRef, useState } from 'react';
import {
  Eraser,
  FlipHorizontal2,
  PaintBucket,
  Pencil,
  Pipette,
  RotateCcw,
  Settings,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  clampVolume,
  createEmptyGrid,
  DEFAULT_PIXEL_COLOR,
  GRID_SIZE,
  isValidUsername,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  PALETTE_COLORS,
  PlayerProfile,
} from '../utils/pixelArt';
import { playClickSound, playSaveSound } from '../utils/sound';
import { PixelAvatar } from './PixelAvatar';

type SettingsTab = 'settings' | 'profile';
type DrawTool = 'pen' | 'eraser' | 'fill' | 'eyedropper';

interface SettingsModalProps {
  isOpen: boolean;
  profile: PlayerProfile;
  onClose: () => void;
  onSave: (updated: PlayerProfile) => void;
}

export function SettingsModal({ isOpen, profile, onClose, onSave }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('settings');
  const [volume, setVolume] = useState(profile.volume);
  const [username, setUsername] = useState(profile.username);
  const [pixels, setPixels] = useState<string[]>(profile.pixels);
  const [history, setHistory] = useState<string[][]>([]);
  const [selectedColor, setSelectedColor] = useState('#111827');
  const [tool, setTool] = useState<DrawTool>('pen');
  const [mirrorX, setMirrorX] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const strokeSnapshotRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('settings');
      setVolume(profile.volume);
      setUsername(profile.username);
      setPixels([...profile.pixels]);
      setHistory([]);
      setTool('pen');
      setIsDrawing(false);
      strokeSnapshotRef.current = null;
    }
  }, [isOpen, profile]);

  useEffect(() => {
    if (!isDrawing) return;
    const handlePointerUp = () => {
      setIsDrawing(false);
      if (strokeSnapshotRef.current) {
        const snap = strokeSnapshotRef.current;
        setHistory((prev) => [...prev.slice(-29), snap]);
        strokeSnapshotRef.current = null;
      }
    };
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDrawing]);

  if (!isOpen) return null;

  const trimmedName = username.trim();
  const usernameValid = isValidUsername(username);

  const pushHistorySnapshot = (prevPixels: string[]) => {
    setHistory((prev) => [...prev.slice(-29), [...prevPixels]]);
  };

  const applyDrawAt = (index: number, currentPixels: string[]): string[] => {
    const paintColor = tool === 'eraser' ? DEFAULT_PIXEL_COLOR : selectedColor;
    const next = [...currentPixels];
    next[index] = paintColor;
    if (mirrorX) {
      const col = index % GRID_SIZE;
      const row = Math.floor(index / GRID_SIZE);
      const mirrorIndex = row * GRID_SIZE + (GRID_SIZE - 1 - col);
      next[mirrorIndex] = paintColor;
    }
    return next;
  };

  const floodFill = (startIndex: number, targetColor: string, replacementColor: string) => {
    if (targetColor.toLowerCase() === replacementColor.toLowerCase()) return;
    pushHistorySnapshot(pixels);
    const next = [...pixels];
    const queue = [startIndex];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const idx = queue.shift()!;
      if (visited.has(idx)) continue;
      visited.add(idx);
      if (next[idx]?.toLowerCase() !== targetColor.toLowerCase()) continue;
      next[idx] = replacementColor;

      const col = idx % GRID_SIZE;
      const row = Math.floor(idx / GRID_SIZE);
      if (col > 0) queue.push(idx - 1);
      if (col < GRID_SIZE - 1) queue.push(idx + 1);
      if (row > 0) queue.push(idx - GRID_SIZE);
      if (row < GRID_SIZE - 1) queue.push(idx + GRID_SIZE);
    }

    setPixels(next);
  };

  const handleCellPointerDown = (index: number) => {
    if (tool === 'eyedropper') {
      const picked = pixels[index] ?? DEFAULT_PIXEL_COLOR;
      setSelectedColor(picked);
      setTool('pen');
      playClickSound(volume);
      return;
    }
    if (tool === 'fill') {
      floodFill(index, pixels[index] ?? DEFAULT_PIXEL_COLOR, selectedColor);
      playClickSound(volume);
      return;
    }

    strokeSnapshotRef.current = [...pixels];
    setIsDrawing(true);
    setPixels((prev) => applyDrawAt(index, prev));
  };

  const handleGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || (tool !== 'pen' && tool !== 'eraser')) return;
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const cellIndexAttr = target?.dataset?.pixelIndex;
    if (cellIndexAttr !== undefined) {
      const idx = Number(cellIndexAttr);
      if (!Number.isNaN(idx) && idx >= 0 && idx < GRID_SIZE * GRID_SIZE) {
        setPixels((prev) => {
          const targetColor = tool === 'eraser' ? DEFAULT_PIXEL_COLOR : selectedColor;
          if (prev[idx] === targetColor && !mirrorX) return prev;
          return applyDrawAt(idx, prev);
        });
      }
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    playClickSound(volume);
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setPixels(last);
  };

  const handleClear = () => {
    playClickSound(volume);
    pushHistorySnapshot(pixels);
    setPixels(createEmptyGrid(DEFAULT_PIXEL_COLOR));
  };

  const handleSave = () => {
    if (!usernameValid) {
      setActiveTab('profile');
      return;
    }
    playSaveSound(volume);
    onSave({
      username: trimmedName,
      pixels: [...pixels],
      volume: clampVolume(volume),
    });
  };

  const handleCancel = () => {
    playClickSound();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-[2px] sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="arcade-card flex max-h-[94dvh] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl bg-[#FFFDF7]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-4 border-black bg-[#1E293B] px-5 py-3.5 sm:px-6">
          <h2
            id="settings-modal-title"
            className="arcade-outline-white text-xl font-black tracking-wide sm:text-2xl"
          >
            メニュー
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="閉じる"
            className="arcade-btn-sm flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-[#EF4444] text-white"
          >
            <X className="h-5 w-5 stroke-[3]" />
          </button>
        </div>

        {/* Tab Bar: 「設定」「プロフィール」 */}
        <div
          role="tablist"
          aria-label="設定メニュータブ"
          className="grid grid-cols-2 gap-3 border-b-4 border-black bg-slate-200 px-5 py-3 sm:px-6"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'settings'}
            onClick={() => {
              playClickSound(volume);
              setActiveTab('settings');
            }}
            className={`arcade-btn-sm flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-base font-black whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-[#F6C116] text-black'
                : 'bg-white text-slate-700'
            }`}
          >
            <Settings className="h-4 w-4 shrink-0 stroke-[2.6]" />
            <span>設定</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => {
              playClickSound(volume);
              setActiveTab('profile');
            }}
            className={`arcade-btn-sm flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-base font-black whitespace-nowrap ${
              activeTab === 'profile'
                ? 'bg-[#3196E2] text-white'
                : 'bg-white text-slate-700'
            }`}
          >
            <User className="h-4 w-4 shrink-0 stroke-[2.6]" />
            <span className={activeTab === 'profile' ? 'arcade-outline-white' : ''}>
              プロフィール
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto p-5 sm:p-6">
          {activeTab === 'settings' ? (
            <div role="tabpanel" aria-label="設定" className="mx-auto max-w-[520px] py-4">
              <div className="rounded-xl border-3 border-black bg-white p-5 shadow-[0_4px_0_#000]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {volume === 0 ? (
                      <VolumeX className="h-6 w-6 stroke-[2.5] text-slate-500" />
                    ) : (
                      <Volume2 className="h-6 w-6 stroke-[2.5] text-[#3196E2]" />
                    )}
                    <label
                      htmlFor="volume-slider"
                      className="text-lg font-black text-slate-900"
                    >
                      音量
                    </label>
                  </div>
                  <span className="rounded-lg border-2 border-black bg-[#F6C116] px-3 py-1 font-mono text-lg font-black text-black tabular-nums">
                    {volume}
                  </span>
                </div>

                <input
                  id="volume-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={volume}
                  onChange={(e) => setVolume(clampVolume(Number(e.target.value)))}
                  onPointerUp={() => playClickSound(volume)}
                  onKeyUp={() => playClickSound(volume)}
                  aria-label="音量（0から100）"
                  className="h-3.5 w-full cursor-pointer accent-[#3196E2]"
                />

                <div className="mt-2 flex items-center justify-between font-mono text-xs font-bold text-slate-500 tabular-nums">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>
            </div>
          ) : (
            <div
              role="tabpanel"
              aria-label="プロフィール"
              className="grid gap-6 md:grid-cols-[270px_1fr]"
            >
              {/* Left Column: Preview & Username */}
              <div className="flex flex-col gap-5">
                <div className="rounded-xl border-3 border-black bg-[#89D1EE] p-4 shadow-[0_4px_0_#000]">
                  <p className="mb-2 text-xs font-extrabold text-slate-900">表示プレビュー</p>
                  <div className="flex items-center gap-3 rounded-xl border-3 border-black bg-[#1E293B] p-2.5 shadow-[0_3px_0_#000]">
                    <div className="overflow-hidden rounded-lg border-2 border-black bg-white">
                      <PixelAvatar pixels={pixels} size={52} alt="アイコンプレビュー" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-black text-white">
                        {trimmedName || 'プレイヤー'}
                      </div>
                      <div className="font-mono text-[11px] font-bold text-amber-300">
                        16×16 ICON
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border-3 border-black bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label
                      htmlFor="username-input"
                      className="text-sm font-black text-slate-900"
                    >
                      ユーザー名
                    </label>
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        usernameValid ? 'text-slate-600' : 'text-red-600'
                      }`}
                    >
                      {trimmedName.length} / {MAX_USERNAME_LENGTH}文字
                    </span>
                  </div>
                  <input
                    id="username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={MAX_USERNAME_LENGTH}
                    placeholder="2〜12文字で入力"
                    className={`w-full rounded-lg border-3 px-3 py-2.5 text-base font-bold text-slate-950 outline-none transition-colors ${
                      usernameValid
                        ? 'border-black bg-slate-50 focus:bg-white'
                        : 'border-red-600 bg-red-50'
                    }`}
                  />
                  {!usernameValid ? (
                    <p className="mt-1.5 text-xs font-extrabold text-red-600" role="alert">
                      ユーザー名は{MIN_USERNAME_LENGTH}〜{MAX_USERNAME_LENGTH}
                      文字で入力してください
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs font-bold text-slate-500">
                      {MIN_USERNAME_LENGTH}文字以上{MAX_USERNAME_LENGTH}文字以内で設定できます
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: 16x16 Pixel Editor */}
              <div className="flex flex-col gap-4 rounded-xl border-3 border-black bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-black text-slate-900">16×16 アイコン</h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound(volume);
                        setMirrorX((v) => !v);
                      }}
                      aria-pressed={mirrorX}
                      className={`arcade-btn-sm flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-extrabold ${
                        mirrorX ? 'bg-[#3196E2] text-white' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <FlipHorizontal2 className="h-3.5 w-3.5" />
                      <span>左右対称</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={history.length === 0}
                      className="arcade-btn-sm flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-extrabold text-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>戻す</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="arcade-btn-sm flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg bg-rose-100 px-2.5 text-xs font-extrabold text-rose-900"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>全消去</span>
                    </button>
                  </div>
                </div>

                {/* Drawing Tools */}
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'pen', label: 'ペン', icon: Pencil },
                      { id: 'eraser', label: '消しゴム', icon: Eraser },
                      { id: 'fill', label: 'ぬりつぶし', icon: PaintBucket },
                      { id: 'eyedropper', label: 'スポイト', icon: Pipette },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => {
                    const active = tool === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          playClickSound(volume);
                          setTool(id);
                        }}
                        aria-pressed={active}
                        className={`arcade-btn-sm flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-extrabold whitespace-nowrap ${
                          active
                            ? 'bg-[#F6C116] text-black'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 16x16 Interactive Canvas Grid */}
                <div className="flex justify-center">
                  <div
                    onPointerMove={handleGridPointerMove}
                    className="grid aspect-square w-full max-w-[300px] touch-none select-none grid-cols-16 overflow-hidden rounded-lg border-4 border-black bg-slate-200 shadow-[0_4px_0_#000]"
                    role="grid"
                    aria-label="16かける16ピクセルアイコンキャンバス"
                  >
                    {pixels.map((color, idx) => (
                      <button
                        key={idx}
                        type="button"
                        data-pixel-index={idx}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          handleCellPointerDown(idx);
                        }}
                        style={{ backgroundColor: color }}
                        aria-label={`ピクセル ${Math.floor(idx / GRID_SIZE) + 1}行 ${
                          (idx % GRID_SIZE) + 1
                        }列`}
                        className="h-full w-full cursor-crosshair border-[0.5px] border-slate-300/60 p-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-black"
                      />
                    ))}
                  </div>
                </div>

                {/* Color Palette + Free Color Picker */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-800">カラー選択</span>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-black bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-900">
                      <span>自由な色</span>
                      <input
                        type="color"
                        value={selectedColor}
                        onChange={(e) => {
                          setSelectedColor(e.target.value.toUpperCase());
                          if (tool === 'eraser') setTool('pen');
                        }}
                        aria-label="自由な色を選択"
                        className="h-6 w-8 cursor-pointer rounded border border-black bg-transparent p-0"
                      />
                      <span className="font-mono text-[11px] uppercase tabular-nums">
                        {selectedColor}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-9 gap-1.5">
                    {PALETTE_COLORS.map((swatch) => {
                      const isSelected =
                        selectedColor.toLowerCase() === swatch.hex.toLowerCase() &&
                        tool !== 'eraser';
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={swatch.name}
                          aria-label={`色: ${swatch.name}`}
                          onClick={() => {
                            playClickSound(volume);
                            setSelectedColor(swatch.hex);
                            if (tool === 'eraser') setTool('pen');
                          }}
                          style={{ backgroundColor: swatch.hex }}
                          className={`aspect-square w-full cursor-pointer rounded-md border-2 transition-transform ${
                            isSelected
                              ? 'scale-110 border-black ring-2 ring-[#F6C116] ring-offset-1'
                              : 'border-black/70 hover:scale-105'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t-4 border-black bg-slate-100 px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={handleCancel}
            className="arcade-btn min-h-[44px] min-w-[120px] cursor-pointer rounded-xl bg-white px-5 py-2 text-base font-black text-slate-900"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!usernameValid}
            className="arcade-btn min-h-[44px] min-w-[150px] cursor-pointer rounded-xl bg-[#28C76F] px-6 py-2 text-base font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}

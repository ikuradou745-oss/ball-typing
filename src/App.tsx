import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { NoticeModal } from './components/NoticeModal';
import { PixelAvatar } from './components/PixelAvatar';
import { SettingsModal } from './components/SettingsModal';
import { loadProfile, PlayerProfile, saveProfile } from './utils/pixelArt';
import { playClickSound, playOpenSound, setMasterVolume } from './utils/sound';

export function App() {
  const [showNotice, setShowNotice] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());

  useEffect(() => {
    setMasterVolume(profile.volume);
  }, [profile.volume]);

  const handleOpenSettings = () => {
    playOpenSound();
    setShowSettings(true);
  };

  const handleSaveProfile = (updated: PlayerProfile) => {
    setProfile(updated);
    setMasterVolume(updated.volume);
    saveProfile(updated);
    setShowSettings(false);
  };

  const handlePlaceholderButtonClick = () => {
    playClickSound();
  };

  return (
    <div className="arcade-bg relative flex min-h-dvh w-full flex-col overflow-hidden">
      {/* Top HUD Bar: Combined Icon + Username + Settings Gear on Top-Right */}
      <header className="relative z-10 flex items-center justify-end px-4 pt-4 sm:px-6 sm:pt-5">
        <button
          type="button"
          onClick={handleOpenSettings}
          aria-label="設定とプロフィールを開く"
          title="設定・プロフィール"
          className="arcade-btn flex min-h-[54px] max-w-[300px] cursor-pointer items-center gap-3 rounded-2xl bg-[#1E293B] py-1.5 pr-3 pl-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <div className="shrink-0 overflow-hidden rounded-xl border-3 border-black bg-white">
            <PixelAvatar
              pixels={profile.pixels}
              size={42}
              alt={`${profile.username}のアイコン`}
            />
          </div>
          <span className="min-w-0 truncate text-base font-black tracking-wide text-white sm:text-lg">
            {profile.username}
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-[#FFFDF7] text-slate-900">
            <Settings className="h-5 w-5 stroke-[2.6]" />
          </span>
        </button>
      </header>

      {/* Center Home Menu Stage */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-12">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1 className="arcade-outline-title text-4xl font-black tracking-wider text-[#F6C116] sm:text-5xl">
            ボールタイピング
          </h1>
        </div>

        <nav
          aria-label="メインメニュー"
          className="flex w-full max-w-[300px] flex-col gap-4"
        >
          <button
            type="button"
            onClick={handlePlaceholderButtonClick}
            className="arcade-btn flex h-[60px] w-full cursor-pointer items-center justify-center rounded-xl bg-[#F6C116] px-6 text-2xl font-black tracking-wider text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            プレイ
          </button>

          <button
            type="button"
            onClick={handlePlaceholderButtonClick}
            className="arcade-btn flex h-[60px] w-full cursor-pointer items-center justify-center rounded-xl bg-[#3196E2] px-6 text-2xl font-black tracking-wider focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <span className="arcade-outline-white">ショップ</span>
          </button>

          <button
            type="button"
            onClick={handlePlaceholderButtonClick}
            className="arcade-btn flex h-[60px] w-full cursor-pointer items-center justify-center rounded-xl bg-[#28C76F] px-6 text-2xl font-black tracking-wider text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            装備
          </button>
        </nav>
      </main>

      {/* Initial Notice Modal */}
      <NoticeModal isOpen={showNotice} onClose={() => setShowNotice(false)} />

      {/* Settings & Profile Modal */}
      <SettingsModal
        isOpen={showSettings}
        profile={profile}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveProfile}
      />
    </div>
  );
}

export default App;

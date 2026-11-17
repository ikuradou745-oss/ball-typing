import { playClickSound } from '../utils/sound';

interface NoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NoticeModal({ isOpen, onClose }: NoticeModalProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    playClickSound();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-modal-title"
    >
      <div className="arcade-card w-full max-w-[540px] overflow-hidden rounded-2xl bg-[#FFFDF7]">
        {/* Brawl / Survivor style Header Banner */}
        <div className="flex items-center justify-center border-b-4 border-black bg-[#1E293B] px-6 py-4">
          <h2
            id="notice-modal-title"
            className="arcade-outline-white text-center text-2xl font-black tracking-wide sm:text-3xl"
          >
            注意項目
          </h2>
        </div>

        {/* Notice Body */}
        <div className="space-y-4 px-6 py-6 text-[15px] leading-relaxed font-bold text-slate-900 sm:px-8 sm:text-base">
          <p className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-slate-950">
            ボールタイピングは、ゲームではなくタイピングです。ゲームではないです。
          </p>
          <p>
            このタイピングは、タイピングのモチベーションを増加させるためにあるものです。このタイピングは、ボールを自分で動かせない、などのゲーム要素は少なめです。
          </p>
          <p>
            逆に、強いボールが欲しいから周回する。すると、タイピングをする必要があるので逆にタイピングがどんどん上手くなる。というwin-winの関係にあります。
          </p>
          <p>このような狙いでこのようなタイピングを作りました。</p>
        </div>

        {/* Close Button Footer */}
        <div className="flex justify-center border-t-4 border-black bg-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            autoFocus
            className="arcade-btn min-h-[48px] w-full max-w-[240px] cursor-pointer rounded-xl bg-[#F6C116] px-6 py-2.5 text-lg font-black tracking-wide text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

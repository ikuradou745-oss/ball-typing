import { useEffect, useRef } from 'react';
import { GRID_SIZE } from '../utils/pixelArt';

interface PixelAvatarProps {
  pixels: string[];
  size?: number;
  className?: string;
  alt?: string;
}

export function PixelAvatar({
  pixels,
  size = 48,
  className = '',
  alt = 'プレイヤーアイコン',
}: PixelAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const x = i % GRID_SIZE;
      const y = Math.floor(i / GRID_SIZE);
      ctx.fillStyle = pixels[i] ?? '#FFFFFF';
      ctx.fillRect(x, y, 1, 1);
    }
  }, [pixels]);

  return (
    <canvas
      ref={canvasRef}
      width={GRID_SIZE}
      height={GRID_SIZE}
      aria-label={alt}
      role="img"
      style={{ width: size, height: size }}
      className={`pixelated block shrink-0 bg-white ${className}`}
    />
  );
}

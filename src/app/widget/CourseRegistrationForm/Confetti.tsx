'use client';

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../widgetMotion';
import { movePiece, newPiece, pieceCount, pieceOpacity, type ConfettiLevel, type ConfettiPiece } from './confettiPieces';
import look from './newLook.module.css';

/**
 * Confetti falling behind a finished registration (see `confettiPieces.ts`).
 *
 * A canvas under the content: nothing it draws can cover a figure or take a
 * tap. It stops while the tab is hidden, and is not drawn at all for someone
 * who asked their device for less motion.
 */
export default function Confetti({ level }: { level: ConfettiLevel }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || prefersReducedMotion()) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let frameId = 0;
    let last = 0;
    let pieces: ConfettiPiece[] = [];

    const measure = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const wanted = pieceCount(level, width);
      while (pieces.length < wanted) pieces.push(newPiece(pieces.length, width, height, level, true));
      pieces.length = wanted;
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < pieces.length; i += 1) {
        let piece = pieces[i];
        movePiece(piece, dt, now / 1000);
        if (piece.y > height + 20) {
          piece = newPiece(i, width, height, level);
          pieces[i] = piece;
        }
        const opacity = pieceOpacity(piece.y, height);
        if (opacity <= 0 || piece.y < -20) continue;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.turn);
        ctx.fillStyle = piece.color;
        if (piece.round) {
          ctx.beginPath();
          ctx.arc(0, 0, piece.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // The height swings with the turn, so a piece reads as flipping in the air.
          ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height * Math.abs(Math.cos(piece.turn * 1.3)) + 1);
        }
        ctx.restore();
      }
      frameId = window.requestAnimationFrame(draw);
    };

    const run = () => {
      window.cancelAnimationFrame(frameId);
      last = performance.now();
      frameId = window.requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      if (document.hidden) window.cancelAnimationFrame(frameId);
      else run();
    };

    measure();
    run();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [level]);

  return <canvas ref={ref} className={look.confetti} aria-hidden="true" />;
}

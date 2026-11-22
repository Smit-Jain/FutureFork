import React, { useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum tilt in degrees. */
  max?: number;
  /** How far the content lifts towards the viewer on hover (px). */
  lift?: number;
  children: React.ReactNode;
}

/**
 * CSS 3D card that tilts towards the pointer. Children can use `style={{ transform: 'translateZ(24px)' }}`
 * to float above the card face. Disabled for reduced motion and touch-only devices.
 */
export const TiltCard: React.FC<TiltCardProps> = ({ max = 7, lift = 14, children, className = '', style, ...rest }) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const frame = useRef<number | null>(null);

  const setTransform = (rx: number, ry: number, z: number) => {
    if (!ref.current) return;
    ref.current.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(${z}px)`;
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType === 'touch' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setTransform(-py * max, px * max, lift));
    ref.current.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`);
    ref.current.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`);
  };

  const onLeave = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    setTransform(0, 0, 0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`preserve-3d transition-transform duration-300 ease-editorial will-change-transform ${className}`}
      style={{ transform: 'perspective(900px)', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
};

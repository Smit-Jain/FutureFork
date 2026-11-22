import React, { useEffect, useRef, useState } from 'react';
import { RobotFallback } from '../Personas';
import type { RobotScene } from './RobotScene';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Fixed full-screen transparent canvas behind the landing content. Loads three.js on demand,
 * feeds it scroll progress (scrollY / innerHeight) and the normalised pointer, and pauses when hidden.
 */
export const RobotCanvas: React.FC<{ reduced: boolean }> = ({ reduced }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(() => typeof window !== 'undefined' && !webglAvailable());

  useEffect(() => {
    if (failed || !canvasRef.current) return;
    let scene: RobotScene | null = null;
    let cancelled = false;

    const onScroll = () => scene?.setScroll(window.scrollY / window.innerHeight);
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    const onResize = () => scene?.resize();
    const onVisibility = () => {
      if (!scene) return;
      if (document.hidden) scene.stopLoop();
      else scene.startLoop();
    };

    import('./RobotScene')
      .then(({ RobotScene: Scene }) => {
        if (cancelled || !canvasRef.current) return;
        scene = new Scene(canvasRef.current, reduced);
        onScroll();
        scene.startLoop();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pointermove', onPointer, { passive: true });
        window.addEventListener('resize', onResize);
        document.addEventListener('visibilitychange', onVisibility);
      })
      .catch((err) => {
        console.warn('FutureFork robot scene failed to start:', err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      scene?.dispose();
      scene = null;
    };
  }, [failed, reduced]);

  return (
    <div className="ff-canvas-wrap" aria-hidden="true">
      {failed ? <RobotFallback /> : <canvas ref={canvasRef} />}
    </div>
  );
};

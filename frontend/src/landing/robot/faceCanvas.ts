import * as THREE from 'three';

export type FaceMode = 'eyes' | 'quote';

/**
 * The robot's 512px face screen: two glowing eyes that blink every 2.5–5.5s, or a single quote mark.
 * Switching modes cross-fades the new face in at +0.05 alpha per frame.
 */
export class FaceScreen {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private mode: FaceMode = 'eyes';
  private prevMode: FaceMode = 'eyes';
  private fade = 1;
  private blinkStart = -1;
  private nextBlink: number;
  private readonly blinkEnabled: boolean;

  constructor(blink = true) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 512;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.blinkEnabled = blink;
    this.nextBlink = performance.now() + this.blinkGap();
    this.draw(performance.now());
  }

  setMode(mode: FaceMode) {
    if (mode === this.mode) return;
    this.prevMode = this.mode;
    this.mode = mode;
    this.fade = 0;
  }

  /** Call once per frame. Redraws only when something changed. */
  update(now: number) {
    let dirty = false;
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + 0.05);
      dirty = true;
    }
    if (this.blinkEnabled && this.blinkStart < 0 && now >= this.nextBlink) {
      this.blinkStart = now;
    }
    if (this.blinkStart >= 0) {
      dirty = true;
      if (now - this.blinkStart > 180) {
        this.blinkStart = -1;
        this.nextBlink = now + this.blinkGap();
      }
    }
    if (dirty) this.draw(now);
  }

  private blinkGap() {
    return 2500 + Math.random() * 3000;
  }

  /** 1 = open, 0.1 = closed; a down-and-up squash over 0.18s. */
  private eyeOpen(now: number) {
    if (this.blinkStart < 0) return 1;
    const t = Math.min(1, (now - this.blinkStart) / 180);
    return 1 - 0.9 * Math.sin(t * Math.PI);
  }

  private drawFace(mode: FaceMode, alpha: number, now: number) {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = '#ffffff';
    g.shadowColor = '#ffffff';
    g.shadowBlur = 18;
    if (mode === 'eyes') {
      const open = this.eyeOpen(now);
      for (const [x, y] of [
        [196, 262],
        [316, 252],
      ]) {
        g.beginPath();
        g.ellipse(x, y, 30, 38 * open, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.font = '560px "Arial Black", "Arial", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      // Centre the glyph's ink box on the screen (font metrics vary between systems).
      const m = g.measureText('“');
      const ascent = m.actualBoundingBoxAscent || 400;
      const descent = m.actualBoundingBoxDescent || -150;
      g.fillText('“', 256, 268 + (ascent - descent) / 2);
    }
    g.restore();
  }

  private draw(now: number) {
    const g = this.g;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 512, 512);
    if (this.fade < 1) this.drawFace(this.prevMode, 1 - this.fade, now);
    this.drawFace(this.mode, this.fade, now);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

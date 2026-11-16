// Keyboard + mouse + pointer lock. All input state lives here; the sim reads it.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false; this.mouseDownR = false;
    this.locked = false;
    this.onKey = null; // (code, down) => void, set by main
    this.onMouseDown = null; // (button) => void
    this.onMouseUp = null;
    this._kd = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, true);
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
    };
    this._ku = (e) => {
      this.keys.delete(e.code);
      if (this.onKey) this.onKey(e.code, false);
    };
    this._mm = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._md = (e) => {
      if (e.button === 0) { this.mouseDown = true; if (this.onMouseDown) this.onMouseDown(0); }
      if (e.button === 2) { this.mouseDownR = true; if (this.onMouseDown) this.onMouseDown(2); }
    };
    this._mu = (e) => {
      if (e.button === 0) { this.mouseDown = false; if (this.onMouseUp) this.onMouseUp(0); }
      if (e.button === 2) { this.mouseDownR = false; if (this.onMouseUp) this.onMouseUp(2); }
    };
    this._lc = () => { this.locked = document.pointerLockElement === this.canvas; };
    this._ctx = (e) => e.preventDefault();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    document.addEventListener('mousemove', this._mm);
    document.addEventListener('mousedown', this._md);
    document.addEventListener('mouseup', this._mu);
    document.addEventListener('pointerlockchange', this._lc);
    this.canvas.addEventListener('contextmenu', this._ctx);
  }
  down(code) { return this.keys.has(code); }
  axis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }
  lock() {
    try { this.canvas.requestPointerLock(); } catch (e) { /* headless: no lock */ }
  }
  unlock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* noop */ }
  }
}

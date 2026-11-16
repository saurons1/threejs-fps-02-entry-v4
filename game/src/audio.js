// Procedural WebAudio sounds — every effect is synthesized, no audio assets.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.enabled = true;
    this.noiseBuf = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }
  _noise(dur, filterType, freq, gain, q = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _tone(freq0, freq1, dur, type, gain) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  shot(kind) {
    // kind: rifle | smg | dmr | shotgun | pistol | enemy (muffled, distant)
    if (kind === 'shotgun') { this._noise(0.28, 'lowpass', 900, 0.9); this._tone(160, 50, 0.22, 'sine', 0.5); }
    else if (kind === 'dmr') { this._noise(0.32, 'bandpass', 1400, 0.9, 0.8); this._tone(220, 45, 0.3, 'sine', 0.55); }
    else if (kind === 'smg') { this._noise(0.1, 'bandpass', 2000, 0.55, 1); this._tone(190, 90, 0.08, 'square', 0.16); }
    else if (kind === 'pistol') { this._noise(0.14, 'bandpass', 1700, 0.6, 1); this._tone(170, 80, 0.1, 'square', 0.2); }
    else if (kind === 'enemy') { this._noise(0.16, 'lowpass', 700, 0.28); }
    else { this._noise(0.14, 'bandpass', 1600, 0.7, 1); this._tone(180, 70, 0.11, 'square', 0.22); }
  }
  dryFire() { this._tone(1400, 900, 0.04, 'square', 0.1); }
  reload() {
    this._tone(900, 700, 0.05, 'square', 0.12);
    setTimeout(() => this._tone(700, 1100, 0.05, 'square', 0.12), 260);
  }
  hit(head) {
    if (head) { this._tone(2400, 2400, 0.06, 'sine', 0.28); this._tone(3200, 3200, 0.09, 'sine', 0.2); }
    else this._tone(1500, 1500, 0.05, 'sine', 0.22);
  }
  hurt() { this._tone(220, 110, 0.16, 'sawtooth', 0.2); this._noise(0.12, 'lowpass', 500, 0.25); }
  kill() { this._tone(660, 990, 0.12, 'sine', 0.25); }
  plantBeep(final) {
    this._tone(final ? 1800 : 1200, final ? 1800 : 1200, 0.07, 'square', 0.16);
  }
  defuseBeep() { this._tone(980, 980, 0.06, 'square', 0.14); }
  explosion() {
    this._noise(1.4, 'lowpass', 420, 1.0);
    this._tone(90, 28, 1.2, 'sine', 0.85);
    this._noise(0.5, 'bandpass', 900, 0.4, 0.7);
  }
  step(run) { this._noise(0.07, 'lowpass', run ? 500 : 340, run ? 0.12 : 0.07); }
  buy() { this._tone(880, 1320, 0.09, 'sine', 0.2); }
  denied() { this._tone(220, 180, 0.12, 'square', 0.16); }
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, f, 0.22, 'sine', 0.22), i * 130)); }
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, f, 0.24, 'sine', 0.2), i * 140)); }
  flash() { this._tone(2400, 2400, 0.3, 'sine', 0.08); }
  smoke() { this._noise(0.4, 'bandpass', 600, 0.2, 0.8); }
  grenadeThrow() { this._noise(0.12, 'bandpass', 1100, 0.2, 1); }
}

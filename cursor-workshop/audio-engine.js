/**
 * Cursor Workshop — Procedural Web Audio Engine (audio-engine.js)
 * يولّد نقرات الكتابة، ترددات السحب، رنين المحاذاة، ونغمة الاكتمال برمجياً
 * باستخدام Web Audio API بدون أي ملفات صوتية خارجية.
 */
(function (global) {
  'use strict';

  class CursorAudioEngine {
    constructor() {
      this.ctx = null;
      this.enabled = false; // يبدأ بصمت حتى يفعّله الزائر بزر الصوت
      this.paused = false;
      this.speed = 1;
      this.lastTickTime = 0;
      this.lastSnapTime = 0;
    }

    /**
     * تهيئة أو تفعيل سياق الصوت بعد تفاعل المستخدم
     */
    unlock() {
      if (!this.ctx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    setEnabled(flag) {
      this.enabled = Boolean(flag);
      if (this.enabled) {
        this.unlock();
        this.playToggleSound(true);
      }
    }

    toggle() {
      this.setEnabled(!this.enabled);
      return this.enabled;
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
    }

    setSpeed(speed) {
      this.speed = Number(speed) || 1;
    }

    canPlay() {
      return this.enabled && !this.paused && this.ctx && this.ctx.state === 'running';
    }

    /**
     * نغمة خفيفة عند تفعيل زر الصوت
     */
    playToggleSound(on) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(on ? 520 : 360, now);
      osc.frequency.exponentialRampToValueAtTime(on ? 780 : 240, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    }

    /**
     * نقرة كتابة ميكانيكية ناعمة متزامنة مع سرعة العرض
     */
    playTypeClick(charIndex) {
      if (!this.canPlay()) return;
      const now = this.ctx.currentTime;
      // منع تداخل النقرات الكثيفة جداً في السرعة 3x
      const minGap = 0.024 / Math.sqrt(this.speed);
      if (now - this.lastTickTime < minGap) return;
      this.lastTickTime = now;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      // تنويع طفيف في التردد ليبدو طبيعياً
      const variation = ((charIndex % 5) - 2) * 35;
      const baseFreq = (680 + variation) * (1 + (this.speed - 1) * 0.12);
      const dur = Math.max(0.015, 0.032 / Math.sqrt(this.speed));

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + dur);

      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.005);
    }

    /**
     * نبضة سحب القياسات (أثناء رسم الإطار أو سحب النسخة)
     */
    playDragTick(progress) {
      if (!this.canPlay()) return;
      const now = this.ctx.currentTime;
      const minGap = 0.065 / this.speed;
      if (now - this.lastTickTime < minGap) return;
      this.lastTickTime = now;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const freq = (320 + progress * 220) * (1 + (this.speed - 1) * 0.1);
      const dur = 0.025;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.028, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.004);
    }

    /**
     * رنين المحاذاة (Snap Alignment) عند استقرار العنصر أو تطابق خطوط المحاذاة
     */
    playSnapPing() {
      if (!this.canPlay()) return;
      const now = this.ctx.currentTime;
      if (now - this.lastSnapTime < 0.09) return;
      this.lastSnapTime = now;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const dur = Math.max(0.06, 0.11 / Math.sqrt(this.speed));

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + dur * 0.6);

      gain.gain.setValueAtTime(0.065, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    }

    /**
     * نغمة اكتمال العرض النهائية (Chord)
     */
    playCompletionChord() {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = now + idx * 0.055;
        const dur = 0.38;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.055, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
    }
  }

  global.CursorAudioEngine = CursorAudioEngine;
})(window);

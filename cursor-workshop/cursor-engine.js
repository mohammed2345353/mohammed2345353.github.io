/**
 * Cursor Workshop — Declarative Multi-Cursor & Timeline Engine (cursor-engine.js)
 * محرك مستقل يقرأ سمات HTML (data-cw-*) لبناء عناصر الصفحة أمام الزائر بمؤشرات ملونة،
 * قياسات حية، خطوط محاذاة، كتابة تدريجية، جولة تلقائية، وتكامل مع Web Audio.
 */
(function (global) {
  'use strict';

  const CURSOR_PALETTE = {
    cyan: {
      id: 'cyan',
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.10)',
      labelAr: 'مازن • راسم الإطار',
      labelEn: 'Mazen • Frame',
      homeX: 0.18,
      homeY: 0.18
    },
    violet: {
      id: 'violet',
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.10)',
      labelAr: 'سارة • محررة النصوص',
      labelEn: 'Sara • Typography',
      homeX: 0.76,
      homeY: 0.20
    },
    amber: {
      id: 'amber',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.10)',
      labelAr: 'عمر • نسخ ومحاذاة',
      labelEn: 'Omar • Clone & Snap',
      homeX: 0.25,
      homeY: 0.68
    },
    emerald: {
      id: 'emerald',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.10)',
      labelAr: 'نور • تخطيط الأقسام',
      labelEn: 'Noor • Layout',
      homeX: 0.78,
      homeY: 0.68
    }
  };

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  class CursorWorkshopEngine {
    constructor(options = {}) {
      this.audio = options.audio || (global.CursorAudioEngine ? new global.CursorAudioEngine() : null);
      this.lang = document.documentElement.lang === 'en' ? 'en' : 'ar';
      this.speed = 1;
      this.paused = false;
      this.tourActive = false;
      this.allCompleted = false;
      this.reducedMotion = false;
      this.hasUserScrolled = false;

      this.sections = [];
      this.allItems = [];
      this.completedCount = 0;

      this.cursors = {};
      this.overlay = null;
      this.snapLineTop = null;
      this.snapLineBottom = null;
      this.distanceMarker = null;
      this.distancePill = null;
      this.cloneGhost = null;

      this.activeSectionIndex = -1;
      this.activeStepIndex = -1;
      this.activeTasks = [];
      this.rafId = null;
      this.lastFrameTime = 0;
      this.sectionObserver = null;
      this.tourScrollTimer = null;
    }

    init() {
      this.createOverlayDOM();
      this.parseDeclarativeDOM();
      this.bindControls();
      this.setupScrollAndObserver();

      // فحص تفضيل تقليل الحركة في النظام
      const mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
      if (mq && mq.matches) {
        this.reducedMotion = true;
        this.skipToComplete(true);
        return;
      }

      this.reset(false);
    }

    /**
     * إنشاء طبقة المؤشرات والقياسات وخطوط المحاذاة الفوقية
     */
    createOverlayDOM() {
      let existing = document.getElementById('cw-overlay-layer');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'cw-overlay-layer';
      overlay.className = 'cw-overlay-layer';
      overlay.setAttribute('aria-hidden', 'true');

      // خطوط المحاذاة العلوية والسفلية
      this.snapLineTop = document.createElement('div');
      this.snapLineTop.className = 'cw-snap-line';
      this.snapLineBottom = document.createElement('div');
      this.snapLineBottom.className = 'cw-snap-line';

      // مؤشر قياس المسافة أثناء سحب النسخة
      this.distanceMarker = document.createElement('div');
      this.distanceMarker.className = 'cw-distance-marker';
      this.distanceMarker.innerHTML = `
        <div class="cw-distance-line">
          <span class="cw-distance-pill">0 px</span>
        </div>
      `;
      this.distancePill = this.distanceMarker.querySelector('.cw-distance-pill');

      // النسخة المرئية المسحوبة (Ghost Clone)
      this.cloneGhost = document.createElement('div');
      this.cloneGhost.className = 'cw-clone-ghost';

      overlay.appendChild(this.snapLineTop);
      overlay.appendChild(this.snapLineBottom);
      overlay.appendChild(this.distanceMarker);
      overlay.appendChild(this.cloneGhost);

      // إنشاء المؤشرات الأربعة وإطارات السحب الخاصة بكل مؤشر
      Object.keys(CURSOR_PALETTE).forEach((key) => {
        const cfg = CURSOR_PALETTE[key];

        const dragRect = document.createElement('div');
        dragRect.className = 'cw-drag-rect';
        dragRect.style.borderColor = cfg.color;
        dragRect.style.backgroundColor = cfg.bg;
        const dimPill = document.createElement('span');
        dimPill.className = 'cw-dim-pill';
        dimPill.style.backgroundColor = cfg.color;
        dragRect.appendChild(dimPill);
        overlay.appendChild(dragRect);

        const cursorEl = document.createElement('div');
        cursorEl.className = 'cw-cursor';
        cursorEl.dataset.cursorId = key;
        cursorEl.innerHTML = `
          <svg class="cw-cursor-svg" viewBox="0 0 24 24" fill="none">
            <path d="M4 3L19.5 11.2L12.2 13.4L9.5 20.5L4 3Z"
                  fill="${cfg.color}" stroke="#061018" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
          <span class="cw-cursor-tag" style="background:${cfg.color}">
            ${this.lang === 'ar' ? cfg.labelAr : cfg.labelEn}
          </span>
        `;
        overlay.appendChild(cursorEl);

        const initX = Math.round(global.innerWidth * cfg.homeX);
        const initY = Math.round(global.innerHeight * cfg.homeY);

        this.cursors[key] = {
          cfg,
          el: cursorEl,
          tagEl: cursorEl.querySelector('.cw-cursor-tag'),
          dragRect,
          dimPill,
          x: initX,
          y: initY
        };
        this.setCursorPos(key, initX, initY);
      });

      document.body.appendChild(overlay);
      this.overlay = overlay;
    }

    setCursorPos(cursorKey, x, y) {
      const c = this.cursors[cursorKey];
      if (!c) return;
      c.x = x;
      c.y = y;
      c.el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    }

    /**
     * قراءة العناصر والأقسام من سمات HTML (data-cw-*)
     */
    parseDeclarativeDOM() {
      this.sections = [];
      this.allItems = [];

      const sectionEls = Array.from(document.querySelectorAll('[data-cw-section]'));
      sectionEls.forEach((secEl, secIdx) => {
        const itemEls = Array.from(secEl.querySelectorAll('[data-cw-item]'));
        const stepMap = new Map();

        itemEls.forEach((itemEl) => {
          const stepNum = parseInt(itemEl.getAttribute('data-cw-step') || '1', 10);
          if (!stepMap.has(stepNum)) {
            stepMap.set(stepNum, []);
          }

          const typeTargets = Array.from(itemEl.querySelectorAll('[data-cw-type]')).map((tEl) => ({
            el: tEl,
            ar: tEl.getAttribute('data-ar') || tEl.textContent.trim(),
            en: tEl.getAttribute('data-en') || tEl.textContent.trim(),
            textNode: null,
            caretEl: null
          }));

          const itemRecord = {
            el: itemEl,
            sectionIndex: secIdx,
            stepNum,
            action: itemEl.getAttribute('data-cw-action') || 'draw-card',
            cursorKey: itemEl.getAttribute('data-cw-cursor') || 'cyan',
            cloneFromSelector: itemEl.getAttribute('data-cw-clone-from') || null,
            duration: parseInt(itemEl.getAttribute('data-cw-duration') || '0', 10),
            typeTargets,
            completed: false
          };

          stepMap.get(stepNum).push(itemRecord);
          this.allItems.push(itemRecord);
        });

        const sortedStepKeys = Array.from(stepMap.keys()).sort((a, b) => a - b);
        const steps = sortedStepKeys.map((k) => stepMap.get(k));

        this.sections.push({
          el: secEl,
          index: secIdx,
          steps,
          started: false,
          completed: false,
          unlockedByScroll: secIdx === 0
        });
      });
    }

    /**
     * مراقبة وصول الزائر للقسم الثاني أو الثالث بالتمرير لبدء بنائه
     */
    setupScrollAndObserver() {
      if (this.sectionObserver) {
        this.sectionObserver.disconnect();
      }

      const onUserScroll = () => {
        if (this.allCompleted) return;
        if (global.scrollY > 35) {
          this.hasUserScrolled = true;
        }
        this.checkVisibleSectionsOnScroll();
      };

      global.addEventListener('scroll', onUserScroll, { passive: true });

      if ('IntersectionObserver' in global) {
        this.sectionObserver = new IntersectionObserver(
          (entries) => {
            if (this.allCompleted) return;
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const secIdx = this.sections.findIndex((s) => s.el === entry.target);
                if (secIdx > 0 && (this.hasUserScrolled || this.tourActive || global.scrollY > 35)) {
                  this.unlockSectionByScroll(secIdx);
                }
              }
            });
          },
          { threshold: 0.16 }
        );

        this.sections.forEach((sec, idx) => {
          if (idx > 0) {
            this.sectionObserver.observe(sec.el);
          }
        });
      }
    }

    checkVisibleSectionsOnScroll() {
      if (this.allCompleted || !this.hasUserScrolled) return;
      this.sections.forEach((sec, idx) => {
        if (idx > 0 && !sec.started && !sec.completed) {
          const rect = sec.el.getBoundingClientRect();
          if (rect.top < global.innerHeight * 0.78 && rect.bottom > 80) {
            this.unlockSectionByScroll(idx);
          }
        }
      });
    }

    unlockSectionByScroll(secIdx) {
      const sec = this.sections[secIdx];
      if (!sec || sec.completed || sec.started) return;
      sec.unlockedByScroll = true;

      // إذا مرّر الزائر يدوياً للقسم التالي بينما القسم السابق لا يزال يبني خارج الشاشة،
      // نُكمل عناصر القسم السابق فوراً ونبدأ بناء القسم الذي ينظر إليه الزائر الآن.
      if (!this.tourActive && this.activeSectionIndex >= 0 && this.activeSectionIndex < secIdx) {
        const prevSec = this.sections[this.activeSectionIndex];
        if (prevSec && !prevSec.completed) {
          this.fastForwardSection(this.activeSectionIndex);
        }
      }

      this.tryAdvanceQueue();
    }

    fastForwardSection(secIdx) {
      const sec = this.sections[secIdx];
      if (!sec || sec.completed) return;

      this.activeTasks.forEach((t) => this.completeTask(t));
      this.activeTasks = [];
      this.hideAllGuides();

      sec.steps.forEach((stepItems) => {
        stepItems.forEach((item) => {
          if (!item.completed) {
            item.completed = true;
            this.completedCount += 1;
          }
          item.el.classList.remove('cw-pending', 'cw-building');
          item.el.classList.add('cw-completed');
          item.typeTargets.forEach((t) => {
            t.el.textContent = this.lang === 'ar' ? t.ar : t.en;
          });
        });
      });

      sec.started = true;
      sec.completed = true;
      sec.el.classList.add('is-section-complete');
      this.updateControlBarUI();
    }

    /**
     * إعادة ضبط العرض والبدء من الصفر
     */
    reset(startWithTour = false) {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.tourScrollTimer) {
        clearTimeout(this.tourScrollTimer);
        this.tourScrollTimer = null;
      }

      this.allCompleted = false;
      this.paused = false;
      this.tourActive = Boolean(startWithTour);
      this.hasUserScrolled = false;
      this.completedCount = 0;
      this.activeSectionIndex = -1;
      this.activeStepIndex = -1;
      this.activeTasks = [];

      if (this.audio) {
        this.audio.setPaused(false);
        this.audio.setSpeed(this.speed);
      }

      if (this.overlay) {
        this.overlay.classList.remove('is-hidden');
      }
      this.hideAllGuides();

      Object.keys(this.cursors).forEach((key) => {
        const c = this.cursors[key];
        const initX = Math.round(global.innerWidth * c.cfg.homeX);
        const initY = Math.round(global.innerHeight * c.cfg.homeY);
        this.setCursorPos(key, initX, initY);
      });

      this.sections.forEach((sec, idx) => {
        sec.started = false;
        sec.completed = false;
        sec.unlockedByScroll = idx === 0;
        sec.el.classList.remove('is-section-complete');
      });

      this.allItems.forEach((item) => {
        item.completed = false;
        item.el.classList.remove('cw-building', 'cw-completed');
        item.el.classList.add('cw-pending');

        item.typeTargets.forEach((t) => {
          t.el.textContent = '';
          t.textNode = null;
          t.caretEl = null;
        });
      });

      this.updateControlBarUI();

      // بدء القسم الأول تلقائياً
      this.startSection(0);
      this.lastFrameTime = performance.now();
      this.rafId = requestAnimationFrame((ts) => this.tick(ts));
    }

    startSection(secIdx) {
      const sec = this.sections[secIdx];
      if (!sec || sec.started) return;
      sec.started = true;
      this.activeSectionIndex = secIdx;
      this.activeStepIndex = -1;
      this.updateControlBarUI();
      this.startNextStepInCurrentSection();
    }

    startNextStepInCurrentSection() {
      const sec = this.sections[this.activeSectionIndex];
      if (!sec) return;

      this.activeStepIndex += 1;
      if (this.activeStepIndex >= sec.steps.length) {
        sec.completed = true;
        sec.el.classList.add('is-section-complete');
        this.activeTasks = [];
        this.hideAllGuides();
        this.onSectionCompleted(this.activeSectionIndex);
        return;
      }

      const stepItems = sec.steps[this.activeStepIndex];
      this.activeTasks = stepItems.map((item) => this.createTaskForItem(item));
    }

    createTaskForItem(item) {
      const cursor = this.cursors[item.cursorKey] || this.cursors.cyan;
      let defaultDur = 2100;
      if (item.action === 'draw-image') defaultDur = 2400;
      if (item.action === 'draw-type') defaultDur = 3000;
      if (item.action === 'draw-card') defaultDur = 1900;
      if (item.action === 'clone-card') defaultDur = 2600;

      const totalMs = item.duration > 0 ? item.duration : defaultDur;

      if (item.action === 'draw-type') {
        item.typeTargets.forEach((t) => {
          t.el.innerHTML = '';
          const textNode = document.createTextNode('');
          const caretEl = document.createElement('span');
          caretEl.className = 'cw-caret';
          caretEl.style.display = 'none';
          t.el.appendChild(textNode);
          t.el.appendChild(caretEl);
          t.textNode = textNode;
          t.caretEl = caretEl;
        });
      }

      return {
        item,
        cursor,
        startX: cursor.x,
        startY: cursor.y,
        elapsedMs: 0,
        totalMs,
        lastTypedChars: -1,
        snapSoundPlayed: false,
        done: false
      };
    }

    onSectionCompleted(completedSecIdx) {
      const allDone = this.sections.every((s) => s.completed);
      if (allDone) {
        this.finishAll(false);
        return;
      }

      const nextSecIdx = completedSecIdx + 1;
      if (nextSecIdx >= this.sections.length) {
        this.finishAll(false);
        return;
      }

      // إذا كانت الجولة التلقائية مفعّلة، مرّر الصفحة تلقائياً للقسم التالي وانتظر اكتمال بنائه قبل المتابعة
      if (this.tourActive) {
        this.scrollToSectionAndStart(nextSecIdx);
      } else {
        this.updateControlBarUI();
        this.tryAdvanceQueue();
      }
    }

    scrollToSectionAndStart(secIdx) {
      const sec = this.sections[secIdx];
      if (!sec) return;
      sec.unlockedByScroll = true;
      sec.el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (this.tourScrollTimer) clearTimeout(this.tourScrollTimer);
      this.tourScrollTimer = setTimeout(() => {
        if (!this.allCompleted && !sec.started) {
          this.startSection(secIdx);
        }
      }, Math.max(220, 520 / this.speed));
    }

    tryAdvanceQueue() {
      if (this.allCompleted) return;
      if (this.activeTasks.length > 0) return;

      for (let i = 0; i < this.sections.length; i++) {
        const s = this.sections[i];
        if (!s.completed) {
          if (s.unlockedByScroll && !s.started) {
            this.startSection(i);
          }
          break;
        }
      }
    }

    /**
     * حلقة التوقيت الرئيسية المرتبطة بالسرعة والإيقاف المؤقت
     */
    tick(now) {
      if (this.allCompleted) return;

      const rawDt = Math.min(64, Math.max(0, now - this.lastFrameTime));
      this.lastFrameTime = now;

      if (!this.paused && this.activeTasks.length > 0) {
        const virtualDt = rawDt * this.speed;
        let allStepTasksDone = true;

        this.activeTasks.forEach((task) => {
          if (!task.done) {
            task.elapsedMs = Math.min(task.totalMs, task.elapsedMs + virtualDt);
            this.renderTask(task);
            if (task.elapsedMs >= task.totalMs) {
              this.completeTask(task);
            } else {
              allStepTasksDone = false;
            }
          }
        });

        if (allStepTasksDone) {
          this.startNextStepInCurrentSection();
        }
      } else if (this.paused && this.activeTasks.length > 0) {
        this.activeTasks.forEach((task) => {
          if (!task.done) this.renderTask(task, true);
        });
      }

      if (!this.allCompleted) {
        this.rafId = requestAnimationFrame((ts) => this.tick(ts));
      }
    }

    /**
     * رسم حالة المهمة الحالية بناءً على التقدم (0..1)
     */
    renderTask(task, isPausedRedraw = false) {
      const { item, cursor, elapsedMs, totalMs } = task;
      const p = clamp(elapsedMs / totalMs, 0, 1);
      const rect = item.el.getBoundingClientRect();
      const isRTL = this.lang === 'ar';

      const startCornerX = isRTL ? rect.right : rect.left;
      const endCornerX = isRTL ? rect.left : rect.right;
      const startCornerY = rect.top;
      const endCornerY = rect.bottom;

      if (item.action === 'draw-image' || item.action === 'draw-card') {
        if (p < 0.28) {
          const mp = easeInOutCubic(p / 0.28);
          this.setCursorPos(
            cursor.cfg.id,
            lerp(task.startX, startCornerX, mp),
            lerp(task.startY, startCornerY, mp)
          );
          cursor.dragRect.classList.remove('is-active');
        } else if (p < 0.86) {
          const dp = easeInOutCubic((p - 0.28) / (0.86 - 0.28));
          item.el.classList.remove('cw-pending');
          item.el.classList.add('cw-building');

          const curX = lerp(startCornerX, endCornerX, dp);
          const curY = lerp(startCornerY, endCornerY, dp);
          this.setCursorPos(cursor.cfg.id, curX, curY);

          const left = Math.min(startCornerX, curX);
          const top = Math.min(startCornerY, curY);
          const width = Math.max(8, Math.abs(curX - startCornerX));
          const height = Math.max(8, Math.abs(curY - startCornerY));

          cursor.dragRect.classList.add('is-active');
          cursor.dragRect.style.left = `${Math.round(left)}px`;
          cursor.dragRect.style.top = `${Math.round(top)}px`;
          cursor.dragRect.style.width = `${Math.round(width)}px`;
          cursor.dragRect.style.height = `${Math.round(height)}px`;
          cursor.dimPill.textContent = `${Math.round(width)} × ${Math.round(height)} px`;

          if (!isPausedRedraw && this.audio) {
            this.audio.playDragTick(dp);
          }
        } else {
          if (!task.snapSoundPlayed && !isPausedRedraw) {
            task.snapSoundPlayed = true;
            if (this.audio) this.audio.playSnapPing();
          }
          cursor.dragRect.classList.remove('is-active');
          item.el.classList.remove('cw-pending', 'cw-building');
          item.el.classList.add('cw-completed');
          this.setCursorPos(cursor.cfg.id, endCornerX, endCornerY);
        }
      } else if (item.action === 'draw-type') {
        if (p < 0.18) {
          const mp = easeInOutCubic(p / 0.18);
          this.setCursorPos(
            cursor.cfg.id,
            lerp(task.startX, startCornerX, mp),
            lerp(task.startY, startCornerY, mp)
          );
          cursor.dragRect.classList.remove('is-active');
        } else if (p < 0.42) {
          const dp = easeInOutCubic((p - 0.18) / (0.42 - 0.18));
          const curX = lerp(startCornerX, endCornerX, dp);
          const curY = lerp(startCornerY, endCornerY, dp);
          this.setCursorPos(cursor.cfg.id, curX, curY);

          const left = Math.min(startCornerX, curX);
          const top = Math.min(startCornerY, curY);
          const width = Math.max(12, Math.abs(curX - startCornerX));
          const height = Math.max(12, Math.abs(curY - startCornerY));

          cursor.dragRect.classList.add('is-active');
          cursor.dragRect.style.left = `${Math.round(left)}px`;
          cursor.dragRect.style.top = `${Math.round(top)}px`;
          cursor.dragRect.style.width = `${Math.round(width)}px`;
          cursor.dragRect.style.height = `${Math.round(height)}px`;
          cursor.dimPill.textContent = `${Math.round(width)} × ${Math.round(height)} px`;

          if (!isPausedRedraw && this.audio) {
            this.audio.playDragTick(dp);
          }
        } else {
          cursor.dragRect.classList.remove('is-active');
          item.el.classList.remove('cw-pending');
          item.el.classList.add('cw-building');

          const tp = clamp((p - 0.42) / (0.98 - 0.42), 0, 1);
          const targets = item.typeTargets;
          const totalChars = targets.reduce((acc, t) => {
            const txt = this.lang === 'ar' ? t.ar : t.en;
            return acc + txt.length;
          }, 0);

          const currentCharBudget = Math.floor(tp * totalChars);
          let remaining = currentCharBudget;
          let activeTarget = targets[0] || null;

          targets.forEach((t) => {
            const fullText = this.lang === 'ar' ? t.ar : t.en;
            const len = fullText.length;
            if (remaining >= len) {
              if (t.textNode) t.textNode.nodeValue = fullText;
              if (t.caretEl) t.caretEl.style.display = 'none';
              remaining -= len;
              activeTarget = t;
            } else if (remaining > 0) {
              if (t.textNode) t.textNode.nodeValue = fullText.slice(0, remaining);
              if (t.caretEl) t.caretEl.style.display = 'inline-block';
              remaining = 0;
              activeTarget = t;
            } else {
              if (t.textNode) t.textNode.nodeValue = '';
              if (t.caretEl) t.caretEl.style.display = 'none';
            }
          });

          if (currentCharBudget !== task.lastTypedChars && !isPausedRedraw) {
            task.lastTypedChars = currentCharBudget;
            if (this.audio && currentCharBudget > 0) {
              this.audio.playTypeClick(currentCharBudget);
            }
          }

          if (activeTarget && activeTarget.caretEl) {
            const caretRect = activeTarget.caretEl.getBoundingClientRect();
            if (caretRect.width > 0 || caretRect.height > 0) {
              this.setCursorPos(cursor.cfg.id, caretRect.left + 6, caretRect.bottom + 4);
            } else {
              const tRect = activeTarget.el.getBoundingClientRect();
              const xPos = isRTL
                ? lerp(tRect.right - 20, tRect.left + 30, tp)
                : lerp(tRect.left + 20, tRect.right - 30, tp);
              this.setCursorPos(cursor.cfg.id, xPos, tRect.top + tRect.height * 0.6);
            }
          }
        }
      } else if (item.action === 'clone-card') {
        const srcEl = item.cloneFromSelector ? document.querySelector(item.cloneFromSelector) : null;
        const srcRect = srcEl ? srcEl.getBoundingClientRect() : rect;

        const srcCenterX = srcRect.left + srcRect.width * 0.5;
        const srcCenterY = srcRect.top + srcRect.height * 0.5;
        const dstCenterX = rect.left + rect.width * 0.5;
        const dstCenterY = rect.top + rect.height * 0.5;

        if (p < 0.24) {
          const mp = easeInOutCubic(p / 0.24);
          this.setCursorPos(
            cursor.cfg.id,
            lerp(task.startX, srcCenterX, mp),
            lerp(task.startY, srcCenterY, mp)
          );
          this.cloneGhost.classList.remove('is-active');
          this.snapLineTop.classList.remove('is-active');
          this.snapLineBottom.classList.remove('is-active');
          this.distanceMarker.classList.remove('is-active');
        } else if (p < 0.86) {
          const dp = easeInOutCubic((p - 0.24) / (0.86 - 0.24));
          const curCenterX = lerp(srcCenterX, dstCenterX, dp);
          const curCenterY = lerp(srcCenterY, dstCenterY, dp);
          this.setCursorPos(cursor.cfg.id, curCenterX, curCenterY);

          const ghostLeft = lerp(srcRect.left, rect.left, dp);
          const ghostTop = lerp(srcRect.top, rect.top, dp);
          const ghostW = lerp(srcRect.width, rect.width, dp);
          const ghostH = lerp(srcRect.height, rect.height, dp);

          if (!this.cloneGhost.classList.contains('is-active')) {
            this.cloneGhost.innerHTML = srcEl ? srcEl.innerHTML : '';
            this.cloneGhost.classList.add('is-active');
          }
          this.cloneGhost.style.left = `${Math.round(ghostLeft)}px`;
          this.cloneGhost.style.top = `${Math.round(ghostTop)}px`;
          this.cloneGhost.style.width = `${Math.round(ghostW)}px`;
          this.cloneGhost.style.height = `${Math.round(ghostH)}px`;

          const minX = Math.min(srcRect.left, ghostLeft) - 12;
          const maxX = Math.max(srcRect.right, ghostLeft + ghostW) + 12;
          const lineW = Math.max(20, maxX - minX);

          this.snapLineTop.classList.add('is-active');
          this.snapLineTop.style.left = `${Math.round(minX)}px`;
          this.snapLineTop.style.top = `${Math.round(rect.top)}px`;
          this.snapLineTop.style.width = `${Math.round(lineW)}px`;

          this.snapLineBottom.classList.add('is-active');
          this.snapLineBottom.style.left = `${Math.round(minX)}px`;
          this.snapLineBottom.style.top = `${Math.round(rect.bottom)}px`;
          this.snapLineBottom.style.width = `${Math.round(lineW)}px`;

          let distValue;
          if (ghostLeft >= srcRect.left) {
            distValue = Math.round(Math.max(0, ghostLeft - srcRect.right));
          } else {
            distValue = Math.round(Math.max(0, srcRect.left - (ghostLeft + ghostW)));
          }
          const deltaCenter = Math.round(Math.hypot(curCenterX - srcCenterX, curCenterY - srcCenterY));

          this.distanceMarker.classList.add('is-active');
          this.distanceMarker.style.left = `${Math.round(Math.min(srcCenterX, curCenterX))}px`;
          this.distanceMarker.style.top = `${Math.round(rect.top + rect.height * 0.5)}px`;
          this.distanceMarker.style.width = `${Math.round(Math.max(28, Math.abs(curCenterX - srcCenterX)))}px`;
          this.distancePill.textContent = `${distValue} px gap • Δ ${deltaCenter} px`;

          if (!isPausedRedraw && this.audio) {
            this.audio.playDragTick(dp);
          }
        } else {
          if (!task.snapSoundPlayed && !isPausedRedraw) {
            task.snapSoundPlayed = true;
            if (this.audio) this.audio.playSnapPing();
          }
          this.cloneGhost.classList.remove('is-active');
          this.snapLineTop.classList.remove('is-active');
          this.snapLineBottom.classList.remove('is-active');
          this.distanceMarker.classList.remove('is-active');

          item.el.classList.remove('cw-pending', 'cw-building');
          item.el.classList.add('cw-completed');
          this.setCursorPos(cursor.cfg.id, dstCenterX, dstCenterY);
        }
      }
    }

    completeTask(task) {
      if (task.done) return;
      task.done = true;
      const { item, cursor } = task;

      cursor.dragRect.classList.remove('is-active');
      if (item.action === 'clone-card') {
        this.cloneGhost.classList.remove('is-active');
        this.snapLineTop.classList.remove('is-active');
        this.snapLineBottom.classList.remove('is-active');
        this.distanceMarker.classList.remove('is-active');
      }

      if (item.action === 'draw-type') {
        item.typeTargets.forEach((t) => {
          const fullText = this.lang === 'ar' ? t.ar : t.en;
          t.el.textContent = fullText;
        });
      }

      item.el.classList.remove('cw-pending', 'cw-building');
      item.el.classList.add('cw-completed');

      if (!item.completed) {
        item.completed = true;
        this.completedCount += 1;
        this.updateControlBarUI();
      }
    }

    hideAllGuides() {
      Object.values(this.cursors).forEach((c) => {
        c.dragRect.classList.remove('is-active');
      });
      if (this.cloneGhost) this.cloneGhost.classList.remove('is-active');
      if (this.snapLineTop) this.snapLineTop.classList.remove('is-active');
      if (this.snapLineBottom) this.snapLineBottom.classList.remove('is-active');
      if (this.distanceMarker) this.distanceMarker.classList.remove('is-active');
    }

    /**
     * إنهاء العرض بالكامل أو تخطّيه وإخفاء المؤشرات والقياسات
     */
    finishAll(silent = false) {
      this.allCompleted = true;
      this.paused = false;
      this.tourActive = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.tourScrollTimer) {
        clearTimeout(this.tourScrollTimer);
        this.tourScrollTimer = null;
      }

      this.hideAllGuides();
      if (this.overlay) {
        this.overlay.classList.add('is-hidden');
      }

      this.sections.forEach((sec) => {
        sec.started = true;
        sec.completed = true;
        sec.el.classList.add('is-section-complete');
      });

      this.allItems.forEach((item) => {
        item.completed = true;
        item.el.classList.remove('cw-pending', 'cw-building');
        item.el.classList.add('cw-completed');
        item.typeTargets.forEach((t) => {
          t.el.textContent = this.lang === 'ar' ? t.ar : t.en;
        });
      });

      this.completedCount = this.allItems.length;
      this.updateControlBarUI();

      if (!silent && this.audio) {
        this.audio.playCompletionChord();
      }
    }

    skipToComplete(silent = false) {
      this.finishAll(silent);
    }

    togglePause() {
      if (this.allCompleted) {
        this.reset(false);
        return;
      }
      this.paused = !this.paused;
      if (this.audio) {
        this.audio.setPaused(this.paused);
      }
      if (!this.paused) {
        this.lastFrameTime = performance.now();
      }
      this.updateControlBarUI();
    }

    setSpeed(newSpeed) {
      const s = Number(newSpeed) || 1;
      this.speed = s;
      if (this.audio) {
        this.audio.setSpeed(s);
      }
      this.updateControlBarUI();
    }

    toggleTour() {
      if (this.allCompleted) {
        global.scrollTo({ top: 0, behavior: 'smooth' });
        this.reset(true);
        return;
      }

      this.tourActive = !this.tourActive;
      if (this.tourActive) {
        if (this.paused) {
          this.paused = false;
          if (this.audio) this.audio.setPaused(false);
          this.lastFrameTime = performance.now();
        }
        const nextUnstartedIdx = this.sections.findIndex((s) => !s.started && !s.completed);
        const anyRunning = this.activeTasks.some((t) => !t.done);
        if (!anyRunning && nextUnstartedIdx > 0) {
          this.scrollToSectionAndStart(nextUnstartedIdx);
        }
      }
      this.updateControlBarUI();
    }

    toggleAudio() {
      if (!this.audio) return;
      this.audio.toggle();
      this.updateControlBarUI();
    }

    /**
     * تبديل اللغة بين العربية (RTL) والإنجليزية (LTR) مع الحفاظ على حالة العرض
     */
    setLanguage(newLang) {
      this.lang = newLang === 'en' ? 'en' : 'ar';
      const isAr = this.lang === 'ar';
      document.documentElement.lang = isAr ? 'ar' : 'en';
      document.documentElement.dir = isAr ? 'rtl' : 'ltr';

      document.querySelectorAll('[data-i18n-ar]').forEach((el) => {
        el.textContent = isAr ? el.getAttribute('data-i18n-ar') : el.getAttribute('data-i18n-en');
      });

      Object.values(this.cursors).forEach((c) => {
        c.tagEl.textContent = isAr ? c.cfg.labelAr : c.cfg.labelEn;
      });

      this.allItems.forEach((item) => {
        if (item.completed) {
          item.typeTargets.forEach((t) => {
            t.el.textContent = isAr ? t.ar : t.en;
          });
        }
      });

      this.activeTasks.forEach((task) => {
        if (!task.done) {
          this.renderTask(task, true);
        }
      });

      this.updateControlBarUI();
    }

    toggleLanguage() {
      this.setLanguage(this.lang === 'ar' ? 'en' : 'ar');
    }

    bindControls() {
      const pauseBtn = document.getElementById('cw-btn-pause');
      const tourBtn = document.getElementById('cw-btn-tour');
      const replayBtn = document.getElementById('cw-btn-replay');
      const skipBtn = document.getElementById('cw-btn-skip');
      const audioBtn = document.getElementById('cw-btn-audio');
      const langBtn = document.getElementById('cw-btn-lang');
      const speedBtns = document.querySelectorAll('[data-cw-speed]');

      if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());
      if (tourBtn) tourBtn.addEventListener('click', () => this.toggleTour());
      if (replayBtn) {
        replayBtn.addEventListener('click', () => {
          global.scrollTo({ top: 0, behavior: 'smooth' });
          this.reset(false);
        });
      }
      if (skipBtn) skipBtn.addEventListener('click', () => this.skipToComplete(false));
      if (audioBtn) audioBtn.addEventListener('click', () => this.toggleAudio());
      if (langBtn) langBtn.addEventListener('click', () => this.toggleLanguage());

      speedBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const sp = parseInt(btn.getAttribute('data-cw-speed'), 10);
          this.setSpeed(sp);
        });
      });

      // روابط التنقل بين الأقسام تفتح القسم عند النقر عليها
      document.querySelectorAll('[data-cw-goto-section]').forEach((navEl) => {
        navEl.addEventListener('click', () => {
          const targetIdx = parseInt(navEl.getAttribute('data-cw-goto-section'), 10);
          if (!isNaN(targetIdx) && targetIdx > 0) {
            this.hasUserScrolled = true;
            this.unlockSectionByScroll(targetIdx);
          }
        });
      });
    }

    updateControlBarUI() {
      const isAr = this.lang === 'ar';
      const total = this.allItems.length;
      const done = this.completedCount;

      const counterText = document.getElementById('cw-counter-text');
      const progressFill = document.getElementById('cw-progress-fill');
      const statusDot = document.getElementById('cw-status-dot');
      const statusLabel = document.getElementById('cw-status-label');

      if (counterText) {
        counterText.textContent = isAr
          ? `${done} / ${total} عناصر`
          : `${done} / ${total} built`;
      }
      if (progressFill) {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        progressFill.style.width = `${pct}%`;
      }

      const waitingForScroll =
        !this.allCompleted &&
        !this.paused &&
        this.activeTasks.length === 0 &&
        this.sections.some((s) => !s.completed);

      if (statusDot && statusLabel) {
        statusDot.classList.remove('is-paused', 'is-done');
        if (this.allCompleted) {
          statusDot.classList.add('is-done');
          statusLabel.textContent = isAr ? 'اكتمل البناء • الواجهة جاهزة' : 'Build Complete • Interactive';
        } else if (this.paused) {
          statusDot.classList.add('is-paused');
          statusLabel.textContent = isAr ? 'متوقف مؤقتاً' : 'Paused';
        } else if (waitingForScroll) {
          statusDot.classList.add('is-paused');
          statusLabel.textContent = isAr
            ? 'مرّر للأسفل أو اضغط «جولة» لبناء القسم التالي'
            : 'Scroll down or click Auto Tour for next section';
        } else {
          statusLabel.textContent = isAr ? 'يبني الواجهة الآن...' : 'Building UI Live...';
        }
      }

      const pauseBtn = document.getElementById('cw-btn-pause');
      if (pauseBtn) {
        pauseBtn.classList.toggle('is-active', this.paused);
        pauseBtn.textContent = this.paused
          ? (isAr ? '▶ استئناف' : '▶ Resume')
          : (isAr ? '⏸ إيقاف مؤقت' : '⏸ Pause');
      }

      const tourBtn = document.getElementById('cw-btn-tour');
      if (tourBtn) {
        tourBtn.classList.toggle('is-tour-active', this.tourActive);
        tourBtn.textContent = this.tourActive
          ? (isAr ? '🧭 جولة نشطة' : '🧭 Tour Active')
          : (isAr ? '🧭 جولة' : '🧭 Auto Tour');
      }

      const replayBtn = document.getElementById('cw-btn-replay');
      if (replayBtn) {
        replayBtn.textContent = isAr ? '↺ إعادة' : '↺ Replay';
      }

      const skipBtn = document.getElementById('cw-btn-skip');
      if (skipBtn) {
        skipBtn.textContent = isAr ? '⏭ تخطّي' : '⏭ Skip';
      }

      const audioBtn = document.getElementById('cw-btn-audio');
      if (audioBtn) {
        const audioOn = Boolean(this.audio && this.audio.enabled);
        audioBtn.classList.toggle('is-audio-on', audioOn);
        audioBtn.textContent = audioOn
          ? (isAr ? '🔊 الصوت: مفعّل' : '🔊 Audio: ON')
          : (isAr ? '🔇 الصوت: صامت' : '🔇 Audio: Muted');
      }

      const langBtn = document.getElementById('cw-btn-lang');
      if (langBtn) {
        langBtn.textContent = isAr ? '🌐 English' : '🌐 العربية';
      }

      document.querySelectorAll('[data-cw-speed]').forEach((btn) => {
        const sp = parseInt(btn.getAttribute('data-cw-speed'), 10);
        btn.classList.toggle('is-selected', sp === this.speed);
      });
    }
  }

  global.CursorWorkshopEngine = CursorWorkshopEngine;

  document.addEventListener('DOMContentLoaded', () => {
    const engine = new CursorWorkshopEngine();
    engine.init();
    global.cwEngine = engine;
  });
})(window);

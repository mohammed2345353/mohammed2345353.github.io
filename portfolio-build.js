(() => {
  const byId = id => document.getElementById(id);
  const hero = byId('hero');
  const name = byId('name');
  const replay = byId('replay');
  const skip = byId('skip');
  const sound = byId('build-sound');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const audio = window.CursorAudioEngine ? new CursorAudioEngine() : null;
  const cursors = hero.querySelectorAll('.cursor');
  const targets = [name, byId('portrait'), byId('bio'), byId('profile')];
  let frame = 0;
  let fullName = '';
  let sounds = new Set();

  function refresh() {
    const arabic = document.documentElement.lang === 'ar';
    replay.hidden = motion.matches;
    sound.hidden = motion.matches || !audio;
    sound.textContent = audio?.enabled ? (arabic ? 'كتم الصوت' : 'Mute sound') : (arabic ? 'فعّل الصوت' : 'Enable sound');
    sound.setAttribute('aria-pressed', String(Boolean(audio?.enabled)));
  }

  function finish() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (fullName) name.textContent = fullName;
    fullName = '';
    name.style.removeProperty('min-height');
    for (const item of targets) {
      item.style.removeProperty('opacity');
      item.style.removeProperty('clip-path');
    }
    for (const cursor of cursors) {
      cursor.style.removeProperty('opacity');
      cursor.style.removeProperty('transform');
    }
    skip.hidden = true;
  }

  const clamp = value => Math.max(0, Math.min(1, value));
  function playOnce(key, play) {
    if (sounds.has(key)) return;
    sounds.add(key);
    if (audio) play(audio);
  }

  function build() {
    finish();
    if (motion.matches) return;
    sounds = new Set();
    fullName = name.textContent;
    const letters = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(document.documentElement.lang).segment(fullName), item => item.segment)
      : Array.from(fullName);
    const arabic = document.documentElement.dir === 'rtl';
    const area = hero.getBoundingClientRect();
    const boxes = targets.map(item => item.getBoundingClientRect());
    name.style.minHeight = boxes[0].height + 'px';
    const started = performance.now();
    const label = cursors[1].querySelector('span');
    label.textContent = `${Math.round(boxes[1].width)} × ${Math.round(boxes[1].height)}`;
    skip.hidden = false;
    for (const item of targets) item.style.opacity = '0';
    let previousCount = 0;

    function draw(now) {
      const elapsed = now - started;
      const typeProgress = clamp((elapsed - 460) / 1050);
      const pictureProgress = clamp((elapsed - 510) / 970);
      const count = Math.floor(typeProgress * letters.length);
      name.style.opacity = count ? '1' : '0';
      const visible = letters.slice(0, count).join('');
      if (name.textContent !== visible) name.textContent = visible;
      if (count > previousCount) audio?.playTypeClick(count);
      previousCount = count;
      targets[1].style.opacity = pictureProgress ? '1' : '0';
      targets[1].style.clipPath = `inset(0 0 ${(1 - pictureProgress) * 100}% 0)`;
      if (pictureProgress > 0 && pictureProgress < 1) audio?.playDragTick(pictureProgress);
      if (pictureProgress === 1) playOnce('snap', engine => engine.playSnapPing());
      targets[2].style.opacity = String(clamp((elapsed - 1480) / 400));
      targets[3].style.opacity = String(clamp((elapsed - 1670) / 300));
      cursors.forEach((cursor, index) => {
        const box = boxes[index];
        const delay = index ? 510 : 460;
        const arrival = clamp(elapsed / delay);
        const progress = index ? pictureProgress : typeProgress;
        const x = box.left - area.left + box.width * (index ? progress : arabic ? 1 - progress : progress);
        const y = box.top - area.top + box.height * (index ? progress : .58);
        cursor.style.transform = `translate(${Math.min(area.width - 22, x * arrival)}px,${y * arrival}px)`;
        cursor.style.opacity = String(clamp(elapsed / 180) * (1 - clamp((elapsed - 1650) / 250)));
      });
      if (elapsed < 2000) frame = requestAnimationFrame(draw);
      else {
        playOnce('complete', engine => engine.playCompletionChord());
        finish();
      }
    }

    frame = requestAnimationFrame(draw);
  }

  byId('language').addEventListener('click', finish, { capture: true });
  byId('language').addEventListener('click', refresh);
  hero.addEventListener('focusin', finish);
  motion.addEventListener('change', () => { finish(); refresh(); });
  window.addEventListener('resize', finish);
  replay.addEventListener('click', build);
  skip.addEventListener('click', finish);
  sound.addEventListener('click', () => { audio?.toggle(); refresh(); });
  refresh();
  build();
})();


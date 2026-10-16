// Animated starfield with occasional shooting stars.
export function initSky(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let w = 0, h = 0, stars = [], shooters = [], raf = 0, last = 0, nextShoot = performance.now() + 9000;
  let speed = 1;

  const COLORS = { white: '236,234,251', warm: '255,228,184', cool: '190,205,255' };

  function seed() {
    const n = Math.min(320, Math.round((w * h) / 2300));
    stars = Array.from({ length: n }, () => {
      const big = Math.random() < 0.07;
      const r = Math.random();
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: big ? 1.1 + Math.random() * 0.8 : 0.35 + Math.random() * 0.75,
        a: 0.3 + Math.random() * 0.65,
        s: 0.3 + Math.random() * 1.4,
        p: Math.random() * Math.PI * 2,
        c: COLORS[r < 0.12 ? 'warm' : r < 0.3 ? 'cool' : 'white'],
        big,
      };
    });
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    draw(performance.now(), 0);
  }

  function shoot() {
    if (reduce.matches) return;
    const fromLeft = Math.random() < 0.5;
    const angle = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.25;
    const v = 0.9 + Math.random() * 0.5; // px per ms
    shooters.push({
      x: fromLeft ? Math.random() * w * 0.5 : w * 0.5 + Math.random() * w * 0.5,
      y: Math.random() * h * 0.35,
      vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      life: 0, max: 700 + Math.random() * 500,
    });
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, w, h);
    const still = reduce.matches;
    for (const s of stars) {
      if (!still) { s.x += 0.004 * dt * speed * (0.3 + s.r); if (s.x > w + 2) s.x = -2; }
      const tw = still ? 1 : 0.6 + 0.4 * Math.sin((t / 1000) * s.s + s.p);
      const fade = 1 - (s.y / h) * 0.55;
      const alpha = s.a * tw * fade;
      ctx.fillStyle = `rgba(${s.c},${alpha})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.big) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
        g.addColorStop(0, `rgba(${s.c},${alpha * 0.35})`);
        g.addColorStop(1, `rgba(${s.c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (let i = shooters.length - 1; i >= 0; i--) {
      const m = shooters[i];
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      const k = m.life / m.max;
      if (k >= 1) { shooters.splice(i, 1); continue; }
      const a = Math.sin(Math.PI * k);
      const tail = 110;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail);
      g.addColorStop(0, `rgba(255,244,214,${a})`);
      g.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail); ctx.stroke();
    }
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(64, t - last);
    if (dt < 30) return; // ~30fps is plenty for twinkling, and kinder to the battery
    last = t;
    if (t > nextShoot) { shoot(); nextShoot = t + 12000 + Math.random() * 16000; }
    draw(t, dt);
  }

  function start() { if (!raf && !reduce.matches) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  resize();
  start();
  window.addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduce.addEventListener?.('change', () => { stop(); start(); draw(performance.now(), 0); });

  return {
    /** Fire a little celebration: a few shooting stars. */
    celebrate(count = 3) { for (let i = 0; i < count; i++) setTimeout(shoot, i * 260); },
    setCalm(on) { speed = on ? 0.4 : 1; },
  };
}

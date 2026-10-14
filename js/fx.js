/* THREADS — motion and 3D. Everything here is decoration: the store works without it.
   - the intro: the logo's three bars lock together (CSS, so it starts on first paint), then the curtain lifts
   - page changes: a black wipe with the E
   - the stand: the hero's 3D stage, the shop's own product cutouts on a turning ring in front of the giant E
   - the E as a live 3D object in the footer */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
  let threeP = null;
  const three = () => threeP || (threeP = import(THREE_URL));
  const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  const GSAP = () => window.gsap && window.ScrollTrigger;
  if (GSAP()) gsap.registerPlugin(ScrollTrigger);
  const GREEN = 0x39ff14;

  // things the current page set up, undone on the next route change
  let disposers = [];
  const own = fn => disposers.push(fn);

  // ---------- intro ----------
  const root = document.documentElement;
  const t0 = performance.now();
  function introDone() {
    const el = document.getElementById('intro');
    if (!root.classList.contains('th-intro') || !el) return;
    const wait = Math.max(0, 1500 - (performance.now() - t0));   // let the bars finish locking
    setTimeout(() => {
      el.classList.add('done');
      setTimeout(() => { root.classList.remove('th-intro'); el.remove(); }, 820);
      try { sessionStorage.setItem('th_intro', '1'); } catch {}
    }, wait);
  }

  // ---------- page change: black wipe with the E ----------
  function transition(swap) {
    const w = document.getElementById('wipe');
    if (reduce || !w || !w.animate) return swap();
    const ease = 'cubic-bezier(.7,0,.2,1)';
    let swapped = false;
    const doSwap = () => { if (!swapped) { swapped = true; swap(); } };
    const done = () => { w.hidden = true; w.getAnimations().forEach(a => a.cancel()); };
    // never hold the page behind the panel: swap and clear on a timer even if the animation stalls
    const safety = setTimeout(() => { doSwap(); done(); }, 1400);
    w.hidden = false;
    w.animate([{ transform: 'scaleY(0)', transformOrigin: '50% 100%' }, { transform: 'scaleY(1)', transformOrigin: '50% 100%' }], { duration: 340, easing: ease, fill: 'forwards' })
      .finished.then(() => {
        if (swapped) return;
        doSwap();
        return w.animate([{ transform: 'scaleY(1)', transformOrigin: '50% 0%' }, { transform: 'scaleY(0)', transformOrigin: '50% 0%' }], { duration: 460, delay: 90, easing: ease, fill: 'forwards' }).finished;
      })
      .then(() => { clearTimeout(safety); done(); })
      .catch(() => { clearTimeout(safety); doSwap(); done(); });
  }

  // ---------- a render loop that sleeps while its canvas is off screen ----------
  function stage(THREE, host, { fov = 35, z = 8.6 } = {}) {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
    camera.position.set(0, 0, z);
    let visible = false, alive = true, tick = null;
    const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) resize(); });
    io.observe(host);
    addEventListener('resize', resize);
    const start = performance.now();
    let last = start;
    const loop = now => {
      if (!alive) return;
      requestAnimationFrame(loop);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (tick) tick((now - start) / 1000, dt);
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
    resize();
    const dispose = () => {
      alive = false; io.disconnect(); removeEventListener('resize', resize);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) [].concat(m).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); });
      renderer.dispose(); canvas.remove();
    };
    return { canvas, renderer, scene, camera, onTick: fn => { tick = fn; }, dispose };
  }

  // pointer, -1..1 from the centre of the window, shared by every scene
  const ptr = { x: 0, y: 0 };
  addEventListener('pointermove', e => { ptr.x = e.clientX / innerWidth * 2 - 1; ptr.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  // the logo's slanted bar, extruded
  function barGeometry(THREE) {
    const sh = new THREE.Shape();
    const w = 3.6, h = 0.82, slant = 0.45;
    sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2 + slant, h / 2); sh.lineTo(-w / 2 + slant, h / 2); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 });
    g.center();
    return g;
  }
  function makeE(THREE, outerColor) {
    const outer = new THREE.MeshStandardMaterial({ color: outerColor, metalness: 0.45, roughness: 0.35 });
    const green = new THREE.MeshStandardMaterial({ color: GREEN, emissive: 0x1f8f0a, emissiveIntensity: 0.7, roughness: 0.4 });
    const group = new THREE.Group();
    const bars = [[0.35, 1.2, outer], [0, 0, green], [-0.35, -1.2, outer]].map(([x, y, m]) => { const b = new THREE.Mesh(barGeometry(THREE), m); b.position.set(x, y, 0); b.userData.home = [x, y]; group.add(b); return b; });
    return { group, bars };
  }
  // soft round texture: glows and contact shadows
  function radial(THREE, rgb, alpha) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},${alpha})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---------- the stand: the hero's 3D stage ----------
  // One brand at a time on a lit plinth, in front of the E as a dark sculpted backdrop with its green bar lit.
  // The next logo spins in from the side while the last one spins out, like a turntable.
  // Everything is sized from the visible frame, so it sits right on a phone, a laptop or a wide monitor.
  // items: [{ logo, cut }]; onFront(i) is called when a new brand turns to the front. Returns { go(step) }.
  function stand(hero, items, onFront) {
    const host = hero.querySelector('.hero-gl');
    const n = items.length;
    let target = 0, front = 0, held = 0;
    const api = { go: d => { target = Math.round(target) + d; held = performance.now(); setFront(); } };
    const setFront = () => { const i = ((Math.round(target) % n) + n) % n; if (i !== front) { front = i; onFront(i); } };
    if (reduce || !hasGL || !host || !n) return api;

    three().then(THREE => {
      if (!hero.isConnected) return;
      const CAM_Z = 12;
      const s = stage(THREE, host, { fov: 30, z: CAM_Z });
      const { scene, camera } = s;
      const tanF = Math.tan(camera.fov * Math.PI / 360);
      const halfAt = z => (CAM_Z - z) * tanF;              // half the visible height at depth z

      // light: a soft key from the upper left, a cool fill, the green from below and behind
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-5, 7, 9); scene.add(key);
      const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6); fill.position.set(6, 2, 6); scene.add(fill);
      const rim = new THREE.PointLight(GREEN, 90, 26); rim.position.set(2, -3, -2); scene.add(rim);

      // the E, dark and sculpted, far behind the plinth
      const E_Z = -6;
      const E = makeE(THREE, 0x3b3c41);
      E.bars.forEach(b => { if (b.material.color.getHex() !== GREEN) { b.material.metalness = 0.3; b.material.roughness = 0.5; } });
      scene.add(E.group);

      // the logos, extruded like the E
      const LOGOS = window.LOGO_SHAPES || {};
      const loader = new THREE.TextureLoader();
      const logoMat = () => new THREE.MeshStandardMaterial({ color: 0xf6f6f3, emissive: 0x262626, metalness: 0.15, roughness: 0.32, transparent: true });
      const piece = it => {
        const L = it.logo && LOGOS[it.logo];
        if (L) {
          const shapes = L.parts.map(part => {
            const sh = new THREE.Shape(part.outer.map(([x, y]) => new THREE.Vector2(x, y)));
            part.holes.forEach(h => sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y)))));
            return sh;
          });
          const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.014, bevelSegments: 4, curveSegments: 8 });
          geo.center();
          const m = new THREE.Mesh(geo, logoMat());
          m.userData.aspect = L.aspect;
          return m;
        }
        // no outline for this brand: its flat logo on a card
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        m.userData.aspect = 1.6;
        if (it.cut) loader.load(it.cut, t => { t.colorSpace = THREE.SRGBColorSpace; mat.map = t; mat.needsUpdate = true; m.userData.aspect = t.image.width / t.image.height; });
        return m;
      };
      const shadowTex = radial(THREE, '0,0,0', 0.8);
      const pieces = items.map(it => {
        const m = piece(it);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2;
        scene.add(m); scene.add(sh);
        m.userData.shadow = sh;
        return m;
      });

      // the plinth: a dark disc with a green edge and a glow on the floor
      const plinth = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.07, 96), new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.6, roughness: 0.35 }));
      const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: GREEN }));
      edge.rotation.x = Math.PI / 2; edge.position.y = 0.036;
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: radial(THREE, '57,255,20', 0.32), transparent: true, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = -0.04;
      plinth.add(glow, disc, edge);
      scene.add(plinth);

      // drag to turn
      let drag = null;
      const down = e => { if (e.target.closest('a, button')) return; drag = { x: e.clientX, t: target }; held = performance.now(); };
      const move = e => { if (!drag) return; target = drag.t - (e.clientX - drag.x) / (coarse ? 140 : 240); setFront(); };
      const up = () => { if (!drag) return; drag = null; target = Math.round(target); held = performance.now(); setFront(); };
      hero.addEventListener('pointerdown', down);
      addEventListener('pointermove', move, { passive: true });
      addEventListener('pointerup', up);
      own(() => { hero.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); });

      // the next brand every few seconds, unless someone is playing with it
      const auto = setInterval(() => { if (!drag && performance.now() - held > 7000 && !document.hidden) { target = Math.round(target) + 1; setFront(); } }, 4600);
      own(() => clearInterval(auto));

      // scrolling out: the camera eases back and the E opens up
      let out = 0;
      const onScroll = () => { out = Math.min(1, Math.max(0, scrollY / (hero.offsetHeight || innerHeight))); };
      addEventListener('scroll', onScroll, { passive: true }); onScroll();
      own(() => removeEventListener('scroll', onScroll));

      let turn = 0;
      const born = performance.now() + (root.classList.contains('th-intro') ? Math.max(0, 1700 - (performance.now() - t0)) : 150);
      const ease = v => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 3);
      s.onTick(t => {
        turn += (target - turn) * (drag ? 0.25 : 0.065);
        const rise = ease((performance.now() - born) / 1400);

        // the frame at the plinth's depth decides every size and position
        const hH = halfAt(0), hW = hH * camera.aspect;
        const wide = camera.aspect > 1.1;
        const cx = wide ? hW * 0.47 : 0;                          // desktop: centre of the right half; phone: centre
        const cy = wide ? -hH * 0.12 : -hH * 0.36;                // phone: under the headline, above the caption
        const boxW = wide ? Math.min(hW * 0.6, hH * 1.45) : hW * 1.05;
        const boxH = wide ? hH * 0.42 : hH * 0.22;
        const floorY = cy - boxH * 0.62;

        // plinth under the front logo
        const pr = wide ? Math.min(boxW * 0.42, hH * 0.55) : boxW * 0.36;
        plinth.position.set(cx, floorY - (1 - rise) * 2, 0.2);
        plinth.scale.set(pr, 1, pr * 0.92);
        edge.material.opacity = 1;

        pieces.forEach((m, i) => {
          let d = i - turn; d = ((d % n) + n) % n; if (d > n / 2) d -= n;   // -n/2 .. n/2, 0 is the front
          const ad = Math.abs(d);
          const fit = Math.min(boxW / m.userData.aspect, boxH);
          const k = Math.max(0, 1 - ad);                                  // 1 at the front
          const vis = Math.max(0, 1 - ad * 1.35) * rise;
          m.visible = vis > 0.01;
          m.scale.setScalar(fit * (0.55 + 0.45 * k));
          m.position.set(cx + d * boxW * 0.75, cy + Math.sin(t * 1.2 + i) * hH * 0.012 - (1 - rise) * hH * 0.4, -ad * 2.4);
          const spin = ad < 0.5 ? Math.sin(t * 0.55 + i) * 0.42 + ptr.x * 0.22 : 0;
          m.rotation.set(ptr.y * 0.07 * k, -d * 1.4 + spin, 0);
          m.material.opacity = vis;
          m.renderOrder = Math.round(k * 100);
          const sh = m.userData.shadow;
          sh.position.set(m.position.x, floorY + 0.045 - (1 - rise) * 2, m.position.z + 0.2);
          sh.scale.set(fit * m.userData.aspect * 0.9, fit * 0.5, 1);
          sh.material.opacity = vis * 0.85;
        });

        // the E behind it all, sized from the frame at its own depth
        const eH = halfAt(E_Z), eW = eH * camera.aspect, depth = (CAM_Z - E_Z) / CAM_Z;
        const eScale = wide ? Math.min(eH * 1.1 / 3.4, eW * 0.85 / 4.8) : Math.min(eH * 0.4 / 3.4, eW * 1.3 / 4.8);
        E.group.scale.setScalar(eScale * (0.85 + 0.15 * rise));
        E.group.position.set(cx * depth + (wide ? eW * 0.02 : 0), (wide ? cy * depth + eH * 0.3 : cy * depth + eH * 0.13), E_Z);   // the logo stands in front of the E's lower half
        E.group.rotation.set(0.06 + ptr.y * 0.05, -0.28 + ptr.x * 0.1 + Math.sin(t * 0.3) * 0.05, 0);
        E.bars.forEach((b, i) => {
          const [hx, hy] = b.userData.home;
          b.position.set(hx + (i - 1) * -out * 1.6, hy * (1 + out * 0.5), Math.sin(t * 0.9 + i * 1.3) * 0.22);
        });
        rim.position.set(cx, floorY - 1, -1.5);

        camera.position.set(ptr.x * 0.25, ptr.y * -0.15 + out * 1.2, CAM_Z + out * 3);
        camera.lookAt(ptr.x * 0.25, out * 0.8, 0);
      });
      hero.classList.add('ready');
      own(() => s.dispose());
    }).catch(() => {});
    return api;
  }

  // ---------- one piece in 3D, for the product page ----------
  // The cutout floats on the green spot in front of the E and leans toward the pointer.
  function showcase(fig, cut) {
    const host = fig.querySelector('.g3d-gl');
    if (reduce || !hasGL || !host) return;
    three().then(THREE => {
      if (!fig.isConnected) return;
      const s = stage(THREE, host, { fov: 30, z: 11 });
      const { scene, camera } = s;
      const E = makeE(THREE, 0xecebe8);
      E.group.scale.setScalar(1.5);
      E.group.position.set(0.4, 0.9, -5);
      E.group.rotation.set(0.05, -0.4, 0);
      scene.add(E.group);
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 8); scene.add(key);
      const rim = new THREE.PointLight(GREEN, 50, 30); rim.position.set(-6, -2, 2); scene.add(rim);

      const FLOOR = -2.4;
      const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      const piece = new THREE.Mesh(geo, mat);
      let lift = 0;
      new THREE.TextureLoader().load(cut, t => {
        t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        mat.map = t; mat.needsUpdate = true;
        const a = t.image.width / t.image.height;
        const h = a < 0.7 ? 4.6 : 3.2 / a;
        piece.scale.set(h * a, h, 1);
        lift = a < 0.7 ? 0 : 1.1;
      });
      scene.add(piece);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshBasicMaterial({ map: radial(THREE, '0,0,0', 0.8), transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, FLOOR + 0.01, 0);
      const spot = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.4, 96), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, side: THREE.DoubleSide }));
      spot.rotation.x = -Math.PI / 2; spot.position.set(0, FLOOR + 0.02, 0);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: radial(THREE, '57,255,20', 0.35), transparent: true, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(0, FLOOR + 0.01, 0);
      scene.add(shadow, spot, glow);

      // lean toward the pointer while it is over the tile; sway gently otherwise
      const local = { x: 0, y: 0, on: false };
      const move = e => { const r = fig.getBoundingClientRect(); local.x = (e.clientX - r.left) / r.width * 2 - 1; local.y = (e.clientY - r.top) / r.height * 2 - 1; local.on = true; };
      const leave = () => { local.on = false; };
      fig.addEventListener('pointermove', move); fig.addEventListener('pointerleave', leave);
      own(() => { fig.removeEventListener('pointermove', move); fig.removeEventListener('pointerleave', leave); });

      let ry = 0, rx = 0;
      s.onTick(t => {
        const tx = local.on ? local.x * 0.45 : Math.sin(t * 0.7) * 0.22;
        const ty = local.on ? local.y * 0.12 : 0;
        ry += (tx - ry) * 0.07; rx += (ty - rx) * 0.07;
        const bob = Math.sin(t * 1.2) * 0.08;
        piece.position.set(0, FLOOR + lift + bob + 0.05, 0);
        piece.rotation.set(rx, ry, 0);
        shadow.material.opacity = 0.9 - bob * 2;
        spot.material.opacity = 0.55 + Math.sin(t * 2) * 0.25;
        E.group.rotation.y = -0.4 + ry * 0.3;
        E.bars.forEach((b, i) => { b.position.z = Math.sin(t * 0.9 + i * 1.3) * 0.25; });
        camera.position.x += (ry * -1.2 - camera.position.x) * 0.05;
        camera.lookAt(0, -0.4, 0);
      });
      fig.classList.add('ready');
      own(() => s.dispose());
    }).catch(() => {});
  }

  // ---------- add to bag: the photo flies into the bag ----------
  function fly(fromImg, toEl) {
    if (reduce || !fromImg || !toEl || !fromImg.animate) return Promise.resolve();
    const a = fromImg.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const size = Math.min(a.width, 220);
    const ghost = fromImg.cloneNode();
    ghost.removeAttribute('loading'); ghost.removeAttribute('srcset');
    ghost.className = 'fly';
    Object.assign(ghost.style, { left: `${a.left + a.width / 2 - size / 2}px`, top: `${a.top + Math.min(a.height, innerHeight) / 2 - size * 0.625}px`, width: `${size}px`, height: `${size * 1.25}px` });
    document.body.appendChild(ghost);
    const gx = b.left + b.width / 2 - (a.left + a.width / 2), gy = b.top + b.height / 2 - (parseFloat(ghost.style.top) + size * 0.625);
    const flight = ghost.animate([
      { transform: 'translate(0, 0) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(${gx * 0.55}px, ${gy * 0.35 - 120}px) scale(.55) rotate(-8deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${gx}px, ${gy}px) scale(.08) rotate(-14deg)`, opacity: 0.6 },
    ], { duration: 720, easing: 'cubic-bezier(.5, 0, .3, 1)' });
    // the bag opens on time even if the browser holds the animation back
    return Promise.race([flight.finished.catch(() => {}), new Promise(r => setTimeout(r, 900))])
      .then(() => { ghost.remove(); toEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' }); });
  }

  // ---------- the product page ----------
  function product(app) {
    const g3d = app.querySelector('.g3d');
    if (g3d) showcase(g3d, g3d.querySelector('.g3d-flat').getAttribute('src'));
    magnets(app);
    if (!GSAP() || reduce) return;
    const tws = [];
    own(() => tws.forEach(t => { if (t.scrollTrigger) t.scrollTrigger.kill(); t.kill(); }));
    const info = app.querySelector('.pdp-info');
    if (info) {
      const tl = gsap.timeline({ delay: 0.15, defaults: { ease: 'expo.out' } });
      tws.push(tl);
      tl.from(splitWords(info.querySelector('.pdp-title')), { yPercent: 110, skewY: 6, duration: 1, stagger: 0.06 })
        .from([...info.children].filter(c => !c.classList.contains('pdp-title')), { y: 24, opacity: 0, duration: 0.8, stagger: 0.05 }, 0.15)
        .from(app.querySelectorAll('.gal figure'), { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut', stagger: 0.08 }, 0);
    }
    choreograph(app);
  }

  // ---------- the E in the footer ----------
  function emblem(host) {
    if (!host || reduce || !hasGL || host.dataset.live) return;
    host.dataset.live = '1';
    three().then(THREE => {
      const s = stage(THREE, host);
      const E = makeE(THREE, 0xecebe8);
      s.scene.add(E.group);
      s.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 8); s.scene.add(key);
      const rim = new THREE.PointLight(GREEN, 40, 30); rim.position.set(-5, -3, 4); s.scene.add(rim);
      let ry = 0, rx = 0;
      s.onTick(t => {
        ry += ((ptr.x * 0.7 + Math.sin(t * 0.6) * 0.18) - ry) * 0.06;
        rx += ((ptr.y * 0.4) - rx) * 0.06;
        E.group.rotation.set(rx, ry, 0);
        E.bars.forEach((b, i) => { b.position.z = Math.sin(t * 1.3 + i * 1.1) * 0.22; });
      });
      host.classList.add('ready');
    }).catch(() => { delete host.dataset.live; });
  }

  // ---------- entrances ----------
  // wraps each word in a mask so it can slide up from below its own baseline (keeps <em> and <br>)
  function splitWords(el) {
    if (el.dataset.split) return el.querySelectorAll('.w > span');
    el.dataset.split = '1';
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.textContent = part;
          w.appendChild(i); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.classList.contains('w')) walk(n);
    });
    walk(el);
    return el.querySelectorAll('.w > span');
  }

  function choreograph(app) {
    const tws = [];
    const keep = t => { tws.push(t); return t; };
    own(() => tws.forEach(t => { if (t.scrollTrigger) t.scrollTrigger.kill(); t.kill(); }));
    const once = (trigger, start = 'top 82%') => ({ trigger, start, once: true });

    // the hero arrives as the intro curtain lifts
    const hero = app.querySelector('.hero');
    if (hero) {
      const wait = root.classList.contains('th-intro') ? Math.max(0.2, (1500 - (performance.now() - t0)) / 1000 + 0.35) : 0.1;
      const tl = keep(gsap.timeline({ delay: wait, defaults: { ease: 'expo.out' } }));
      tl.from(splitWords(hero.querySelector('h1')), { yPercent: 115, skewY: 7, duration: 1.1, stagger: 0.08 })
        .from(hero.querySelector('.hero-kicker'), { x: -30, opacity: 0, duration: 0.8 }, 0.1)
        .from(hero.querySelector('.hero-sub'), { y: 24, opacity: 0, duration: 0.9 }, 0.45)
        .from(hero.querySelectorAll('.hero-copy .btn'), { y: 24, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.55)
        .from(hero.querySelectorAll('.hero-brands a'), { y: 14, opacity: 0, duration: 0.7, stagger: 0.06 }, 0.7)
        .from(hero.querySelector('.hero-stand'), { y: 30, opacity: 0, duration: 0.9 }, 0.8);
    }

    // section titles: word by word, with the same italic lean as the logo
    app.querySelectorAll('.h-sec, .banner-copy h2').forEach(h => {
      if (h.closest('.hero')) return;
      keep(gsap.from(splitWords(h), { yPercent: 110, skewY: 6, duration: 0.9, ease: 'expo.out', stagger: 0.06, scrollTrigger: once(h, 'top 88%') }));
    });
    app.querySelectorAll('.banner-copy').forEach(c => {
      keep(gsap.from(c.querySelectorAll('p, .btn'), { y: 26, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.25, scrollTrigger: once(c, 'top 85%') }));
    });

    // photographs open from a slanted wipe, then settle
    app.querySelectorAll('.duo-tile, .banner').forEach(el => {
      keep(gsap.fromTo(el, { clipPath: 'polygon(0 0, 0 0, -20% 100%, -20% 100%)' }, { clipPath: 'polygon(0 0, 120% 0, 100% 100%, -20% 100%)', duration: 1.3, ease: 'expo.inOut', scrollTrigger: once(el, 'top 80%') }));
    });
    app.querySelectorAll('.duo-label').forEach(el => keep(gsap.from(el.children, { y: 40, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.1, delay: 0.5, scrollTrigger: once(el.closest('.duo-tile'), 'top 80%') })));

    // grids and rails arrive in a stagger
    const stagger = (sel, from, each = 0.08) => app.querySelectorAll(sel).forEach(grid => {
      keep(gsap.from(grid.children, { ...from, duration: 1, ease: 'expo.out', stagger: each, scrollTrigger: once(grid, 'top 85%') }));
    });
    stagger('.rail', { x: 80, opacity: 0 }, 0.07);
    stagger('.brand-grid', { y: 70, opacity: 0, clipPath: 'inset(100% 0 0 0)' }, 0.09);
    stagger('.sport-grid', { y: 70, opacity: 0, clipPath: 'inset(100% 0 0 0)' }, 0.09);
    stagger('.how-steps', { y: 50, opacity: 0 }, 0.1);
    app.querySelectorAll('.how-steps b').forEach((b, i) => keep(gsap.from(b, { xPercent: -40, opacity: 0, skewX: -12, duration: 0.9, ease: 'back.out(2)', delay: 0.15 + i * 0.1, scrollTrigger: once(b.closest('.how-steps'), 'top 85%') })));
    stagger('.faq-list', { y: 20, opacity: 0 }, 0.05);

    // the colour picker: the photo slides in from the side
    const pick = app.querySelector('.pick');
    if (pick) {
      keep(gsap.from(pick.querySelector('.pick-photo'), { xPercent: -12, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: once(pick, 'top 75%') }));
      keep(gsap.from(pick.querySelector('.pick-info').children, { x: 40, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06, scrollTrigger: once(pick, 'top 75%') }));
    }
    const ig = app.querySelector('.ig');
    if (ig) keep(gsap.from(ig, { x: -60, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: once(ig, 'top 90%') }));
  }

  // ---------- scroll progress through a tall section (0 → 1 while its sticky stage is pinned) ----------
  function progress(el, cb) {
    if (GSAP()) {
      const st = ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom bottom', onUpdate: s => cb(s.progress) });
      cb(st.progress);
      own(() => st.kill());
      return;
    }
    let raf = 0;
    const read = () => { raf = 0; const r = el.getBoundingClientRect(); const span = r.height - innerHeight; cb(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0); };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    addEventListener('scroll', on, { passive: true }); addEventListener('resize', on);
    read();
    own(() => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); });
  }

  // ---------- the three bars: each one carries a promise ----------
  // The E floats in the middle. While you scroll the bars pull apart one by one, each next to its promise,
  // then lock back into the logo at the end.
  function promises(sec) {
    const marks = [...sec.querySelectorAll('[data-step]')];
    const n = marks.length;
    let p = 0, cur = -1;
    progress(sec, v => {
      p = v;
      const i = v < 0.08 ? -1 : Math.min(n - 1, Math.floor((v - 0.08) / (0.8 / n)));
      if (i !== cur) { cur = i; marks.forEach(m => { const j = +m.dataset.step; m.classList.toggle('on', j === i); m.classList.toggle('past', j < i); }); }
    });
    if (reduce || !hasGL) return;
    three().then(THREE => {
      if (!sec.isConnected) return;
      const s = stage(THREE, sec.querySelector('.promises-gl'), { fov: 32, z: 13 });
      const E = makeE(THREE, 0xe9e9e6);
      E.group.scale.setScalar(1);
      s.scene.add(E.group);
      s.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(4, 6, 8); s.scene.add(key);
      const rim = new THREE.PointLight(GREEN, 70, 40); rim.position.set(-6, -3, 5); s.scene.add(rim);
      // where each bar travels to when its promise is told (x, y, rotation)
      const wide = () => s.camera.aspect > 1.1;
      // wide screens: the bars spread down the right half, the promises read down the left
      const AWAY = () => wide() ? [[0, 2.5, -0.25], [0, 0, 0.25], [0, -2.5, -0.25]] : [[0.25, 1.25, -0.2], [0, 0, 0.2], [-0.25, -1.25, -0.2]];
      let sp = 0;
      s.onTick(t => {
        sp += (p - sp) * 0.08;
        // 0 → 1 → 0 across the section: apart in the middle, the logo again at both ends
        const open = sp < 0.85 ? Math.min(1, sp / 0.12) : Math.max(0, 1 - (sp - 0.85) / 0.12);
        const away = AWAY();
        E.bars.forEach((b, i) => {
          const [hx, hy] = b.userData.home, [ax, ay, ar] = away[i];
          const turn = Math.min(1, Math.max(0, (sp - 0.08 - i * (0.8 / 3)) / 0.12)) * open;   // this bar's moment
          const k = Math.max(turn, open * 0.25);
          b.position.set(hx + (ax - hx) * k - (wide() ? turn * 0.9 : 0), hy + (ay - hy) * k, Math.sin(t * 1.1 + i * 1.4) * 0.3 + turn * 1.4);
          b.rotation.set(Math.sin(t * 0.7 + i) * 0.08, ar * k + Math.sin(t * 0.5 + i) * 0.1, ar * k * 0.4);
        });
        E.group.position.x += ((wide() ? 2.8 * open : 0) - E.group.position.x) * 0.1;
        E.group.position.y += ((wide() ? 0 : 1.15) - E.group.position.y) * 0.1;   // phones: upper middle, the promise reads right under it
        E.group.scale.setScalar(E.group.scale.x + ((wide() ? 1 : 0.5) - E.group.scale.x) * 0.1);
        E.group.rotation.y = ptr.x * 0.25 + Math.sin(t * 0.4) * 0.12;
        E.group.rotation.x = ptr.y * 0.12;
      });
      sec.classList.add('ready');
      own(() => s.dispose());
    }).catch(() => {});
  }

  // ---------- craft: cursor, magnetic buttons, leaning cards, the draggable wall ----------
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let cursor = null;
  function setupCursor() {
    if (!fine || reduce || cursor) return;
    cursor = document.createElement('div');
    cursor.className = 'cursor'; cursor.innerHTML = '<b></b>';
    document.body.appendChild(cursor);
    root.classList.add('has-cursor');
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; cursor.classList.add('on'); }, { passive: true });
    document.addEventListener('pointerleave', () => cursor.classList.remove('on'));
    addEventListener('pointerdown', () => cursor.classList.add('down'));
    addEventListener('pointerup', () => cursor.classList.remove('down'));
    // what a click does here, said in one word
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('[data-cursor], .card, .hero-gl, .wall-item, .cat-index a, .g3d');
      const label = !t ? '' : t.dataset.cursor || (t.matches('.hero-gl, .g3d') ? (t.matches('.g3d') ? '3D' : 'Drag') : t.matches('.wall-item') ? 'Drag' : 'View');
      cursor.classList.toggle('big', !!label);
      cursor.firstChild.textContent = label;
    });
    const loop = () => { cx += (x - cx) * 0.22; cy += (y - cy) * 0.22; cursor.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // buttons lean toward the pointer, a little
  function magnets(app) {
    if (!fine || reduce) return;
    app.querySelectorAll('.hero-copy .btn, .banner-copy .btn, .visit .btn, .stand-nav .icon-btn, .pick-info .btn').forEach(b => {
      const move = e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`; };
      const out = () => { b.style.transform = ''; };
      b.addEventListener('pointermove', move); b.addEventListener('pointerleave', out);
      b.style.transition = 'transform .35s cubic-bezier(.2,.8,.2,1), background .2s, color .2s, border-color .2s';
      own(() => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerleave', out); });
    });
  }

  // product photos lean toward the pointer and catch a soft light (delegated, works on every page)
  if (fine && !reduce) {
    document.addEventListener('pointermove', e => {
      const m = e.target.closest && e.target.closest('.card-media');
      if (!m) return;
      const r = m.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      m.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 8}deg) rotateX(${(0.5 - py) * 8}deg)`;
      m.style.setProperty('--mx', `${px * 100}%`); m.style.setProperty('--my', `${py * 100}%`);
    }, { passive: true });
    document.addEventListener('pointerout', e => {
      const m = e.target.closest && e.target.closest('.card-media');
      if (m && !m.contains(e.relatedTarget)) m.style.transform = '';
    });
  }

  // the wall: drag it sideways with the mouse; it keeps gliding and leans while it moves
  function wall(app) {
    const w = app.querySelector('#wall'); if (!w) return;
    const items = [...w.children];
    let down = false, sx = 0, sl = 0, v = 0, last = 0, lastX = 0, raf = 0, moved = false;
    const lean = () => { const k = Math.max(-8, Math.min(8, -v * 0.5)); items.forEach(i => i.style.setProperty('--skew', `${k}deg`)); };
    const glide = () => { v *= 0.94; w.scrollLeft -= v; lean(); if (Math.abs(v) > 0.3) raf = requestAnimationFrame(glide); else { v = 0; lean(); } };
    const dn = e => { if (e.pointerType !== 'mouse' || e.button) return; down = true; moved = false; sx = lastX = e.clientX; sl = w.scrollLeft; last = performance.now(); cancelAnimationFrame(raf); };
    const mv = e => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 4) { moved = true; w.classList.add('dragging'); }
      w.scrollLeft = sl - dx;
      const now = performance.now(); v = (e.clientX - lastX) / Math.max(1, now - last) * 16; lastX = e.clientX; last = now; lean();
    };
    const up = () => { if (!down) return; down = false; setTimeout(() => w.classList.remove('dragging'), 0); if (!reduce) raf = requestAnimationFrame(glide); };
    const click = e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } };
    w.addEventListener('pointerdown', dn); addEventListener('pointermove', mv); addEventListener('pointerup', up); w.addEventListener('click', click, true);
    own(() => { w.removeEventListener('pointerdown', dn); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); cancelAnimationFrame(raf); });
  }

  // ---------- smooth scrolling (mouse and trackpad only; touch keeps the phone's own scrolling) ----------
  let lenis = null;
  function setupSmooth() {
    if (reduce || coarse || !window.Lenis || lenis) return;
    lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true });
    if (GSAP()) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
    else { const f = t => { lenis.raf(t); requestAnimationFrame(f); }; requestAnimationFrame(f); }
    // when the bag, the menu or a dialog locks the page, the smooth scroller stops too
    new MutationObserver(() => { (root.style.overflow === 'hidden' || root.classList.contains('th-intro')) ? lenis.stop() : lenis.start(); }).observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  // ---------- the home page ----------
  function home(app) {
    const pr = app.querySelector('#promises'); if (pr) promises(pr);
    magnets(app);
    wall(app);
    // the ticker runs faster while you scroll, in the direction you scroll
    const run = app.querySelector('.ticker-run');
    if (run && !reduce && run.getAnimations) {
      let boost = 0, raf = 0, lastY = scrollY;
      const step = () => {
        const dy = scrollY - lastY; lastY = scrollY;
        boost = boost * 0.9 + dy * 0.06;
        run.getAnimations().forEach(a => { a.playbackRate = Math.max(-6, Math.min(6, 1 + boost)); });
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      own(() => cancelAnimationFrame(raf));
    }
    if (GSAP() && !reduce) choreograph(app);
    // campaign banners: the photograph drifts slower than the page
    if (GSAP() && !reduce) {
      app.querySelectorAll('.banner > img').forEach(img => {
        const tw = gsap.fromTo(img, { yPercent: -8, scale: 1.12 }, { yPercent: 8, scale: 1.12, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
        own(() => { tw.scrollTrigger && tw.scrollTrigger.kill(); tw.kill(); });
      });
      // lazy photographs change the page height as they arrive: measure again once they settle
      let t = 0;
      const again = e => { if (e.target.tagName !== 'IMG') return; clearTimeout(t); t = setTimeout(() => ScrollTrigger.refresh(), 150); };
      app.addEventListener('load', again, true);
      own(() => { app.removeEventListener('load', again, true); clearTimeout(t); });
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }
  }

  // ---------- route hooks, called by store.js ----------
  function leave() { disposers.forEach(fn => { try { fn(); } catch {} }); disposers = []; }
  function enter(path, app) {
    if (lenis) lenis.resize();
    if (path === '/') home(app);
    else if (path.startsWith('/p/')) product(app);
  }

  // the footer is on every page: its E wakes when the footer comes near
  const fE = document.querySelector('.f-e[data-emblem]');
  if (fE && !reduce && hasGL) {
    const ob = new IntersectionObserver(([en]) => { if (!en.isIntersecting) return; ob.disconnect(); emblem(fE); }, { rootMargin: '400px' });
    ob.observe(fE);
  }

  setupCursor();
  setupSmooth();

  window.FX = { introDone, transition, leave, enter, stand, fly };
})();

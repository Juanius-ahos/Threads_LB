/* THREADS — the one 3D object: the logo's three-bar E, live inside the footer wordmark.
   Decorative only: the flat SVG E stays in place if WebGL or the script is unavailable. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = document.querySelector('.f-e[data-emblem]');
  if (!host || reduce) return;

  const loadThree = () => new Promise((res, rej) => {
    if (window.THREE) return res(window.THREE);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = () => res(window.THREE); s.onerror = rej;
    document.head.appendChild(s);
  });

  function mount(THREE) {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { canvas.remove(); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
    camera.position.set(0, 0, 8.6);

    const bar = () => {
      const s = new THREE.Shape();
      const w = 3.6, h = .82, slant = .45;
      s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2 + slant, h / 2); s.lineTo(-w / 2 + slant, h / 2); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: .6, bevelEnabled: true, bevelThickness: .06, bevelSize: .05, bevelSegments: 3 });
      g.center(); return g;
    };
    const light = new THREE.MeshStandardMaterial({ color: 0xecebe8, metalness: .35, roughness: .35 });
    const green = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x39ff14).convertSRGBToLinear(), emissive: new THREE.Color(0x1f8f0a).convertSRGBToLinear(), emissiveIntensity: .5, roughness: .4 });
    const group = new THREE.Group();
    const bars = [[.35, 1.2, light], [0, 0, green], [-.35, -1.2, light]].map(([x, y, m]) => { const b = new THREE.Mesh(bar(), m); b.position.set(x, y, 0); group.add(b); return b; });
    scene.add(group);
    scene.add(new THREE.AmbientLight(0xffffff, .45));
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(4, 6, 8); scene.add(key);
    const rim = new THREE.PointLight(0x39ff14, 1.6, 30); rim.position.set(-5, -3, 4); scene.add(rim);

    let tx = 0, ty = 0, visible = false;
    const t0 = performance.now();
    const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize(); addEventListener('resize', resize);
    const footer = host.closest('footer');
    footer.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 500)); ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 400)); });
    footer.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) resize(); }).observe(host);

    const loop = now => {
      requestAnimationFrame(loop);
      if (!visible) return;
      const t = (now - t0) / 1000;
      group.rotation.y += ((tx * .9 + Math.sin(t * .6) * .18) - group.rotation.y) * .06;
      group.rotation.x += ((ty * .5) - group.rotation.x) * .06;
      bars.forEach((b, i) => { b.position.z = Math.sin(t * 1.3 + i * 1.1) * .22; });
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
    host.classList.add('ready');
  }

  // load three.js only when the footer comes near
  const ob = new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) return;
    ob.disconnect();
    loadThree().then(mount).catch(() => {});
  }, { rootMargin: '400px' });
  ob.observe(host);
})();

# Rich media: the libraries, and how not to get burned by them

**Target S only.** A local file has no content security policy, so these load fine. A published artifact blocks every one of them except native mermaid and Google Fonts, and a Target-B page that reaches for a CDN renders broken. `check-artifact.sh` enforces the split.

Which form fits which information is settled in `information-design.md`. This file is only the how.

## Rules of the road

- **Pin an exact version.** Never `@latest`. A demo that worked in April and breaks in August is worse than one that never worked.
- **Fall back gracefully.** Wrap init in `try`/`catch`, check the global exists, and make sure the page still reads when the library never arrives. Offline should degrade, not blank.
- **Never hide content in base CSS waiting for a library to reveal it.** Same rule as `interaction.md`, and it is the single most common way these pages die.
- **Theme from the pack tokens.** Read the CSS custom properties and pass them in. A library's default palette is exactly what makes generated work look generated.
- **Respect `prefers-reduced-motion`.** Ambient and looping motion does not start. Motion that carries meaning stays, kept short.
- **Load with `defer`** or at the end of `<body>`.

## three.js

Pin `0.160.0`. Import map plus an ES module, all in one file.

```html
<canvas id="scene"></canvas>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
}}
</script>
<script type="module">
try {
  const T = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const css = getComputedStyle(document.documentElement);
  const accent = new T.Color(css.getPropertyValue('--accent').trim() || '#6d28d9');

  const cv = document.getElementById('scene');
  const r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));          // retina otherwise renders 4x the pixels

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.z = 4;
  scene.add(new T.AmbientLight(0xffffff, 0.6));
  const key = new T.DirectionalLight(accent, 1.4);
  key.position.set(3, 3, 4);
  scene.add(key);

  const mesh = new T.Mesh(
    new T.IcosahedronGeometry(1.3, 1),
    new T.MeshStandardMaterial({ color: accent, roughness: 0.35, flatShading: true })
  );
  scene.add(mesh);

  const controls = new OrbitControls(cam, cv);
  controls.enableZoom = false;
  controls.enablePan = false;

  const resize = () => {                                    // size to the container, never the window
    const w = cv.clientWidth, h = cv.clientHeight;
    r.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); running = false; });

  (function loop() {
    requestAnimationFrame(loop);
    if (!running) return;
    if (!reduce) { mesh.rotation.y += 0.004; mesh.rotation.x += 0.002; }
    controls.update();
    r.render(scene, cam);
  })();
} catch (e) {
  console.warn('three.js unavailable, static hero shown', e);
  document.getElementById('scene')?.classList.add('gl-fallback');
}
</script>
```

Give `.gl-fallback` a real background so a failed load looks deliberate rather than empty.

Reach for it when the idea is genuinely spatial: layers of a system pulled apart, a rotatable object that stands for the subject, a field of points that carries scale. One heavy scene per page, and never two.

## gsap and ScrollTrigger

Pin `3.12.5`. Best for scroll-driven narrative and orchestrated reveals.

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js" defer></script>
<script defer>
addEventListener('load', () => {
  if (!window.gsap) return;                       // content is visible already, so nothing to undo
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray('.reveal').forEach(el =>
    gsap.from(el, { opacity: 0, y: 24, duration: 0.6, ease: 'power2.out',
                    scrollTrigger: { trigger: el, start: 'top 82%' } }));
});
</script>
```

Note it uses `gsap.from`, so the resting state is the authored one. Never `gsap.to` from a CSS-hidden start; that is the blank-page failure again.

For a count-up, the dependency-free version in `interaction.md` is better, and it already handles the two gotchas that bite here.

## mermaid, rendered live

Pin `10.9.0`. A published artifact renders mermaid natively and needs none of this; a local file does.

```html
<pre class="mermaid">flowchart LR
  A[Client] --> B[Service] --> C[(Store)]
</pre>
<script type="module">
try {
  const m = (await import('https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.esm.min.mjs')).default;
  const c = getComputedStyle(document.documentElement);
  // a dynamic import resolves after DOMContentLoaded, so startOnLoad would never fire
  m.initialize({ startOnLoad: false, theme: 'base', themeVariables: {
    fontFamily: c.getPropertyValue('--sans').trim(),
    primaryColor: c.getPropertyValue('--surface-2').trim(),
    primaryTextColor: c.getPropertyValue('--ink').trim(),
    lineColor: c.getPropertyValue('--accent').trim()
  }});
  await m.run();
} catch (e) { console.warn('mermaid unavailable', e); }
</script>
```

Re-run it on theme change, or the diagram keeps the palette it was born with. For full control in both themes, hand-authored inline SVG beats mermaid.

## KaTeX

Pin `0.16.9`.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body, { delimiters: [
    {left:'$$', right:'$$', display:true}, {left:'$', right:'$', display:false}]})"></script>
```

## Charts

**Load `dataviz` before writing a single line of chart code.** It owns colour, form and the accessibility rules, and it is not optional.

ECharts `5.5.0` for rich interactive work, Chart.js `4.4.1` for something simple, D3 `7` when the chart is bespoke. Whichever you pick, take the palette from the pack tokens and set the font to the pack family. Handle the empty series and the single-point series, because both are where charts throw.

## Inline SVG

Still the right answer more often than a library. It tracks `currentColor` and the CSS variables for free, so it themes correctly with no JavaScript, it animates with `stroke-dasharray` for a draw-on effect, and it has no version to pin and nothing to fall back from. `artifact-diagramming` covers how to draw one that shows the real mechanism.

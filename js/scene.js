// =====================================================
// scene.js — 3D-зуб из трёх деталей (библиотека Three.js)
//
// Зуб собран из коронки, абатмента и импланта. Он один на весь сайт
// и «путешествует» по первым трём блокам:
//   1. первый экран — собран, поворачивается за мышкой;
//   2. блок про имплант — разбирается на детали при прокрутке;
//   3. блок отбеливания — остаётся одна коронка, её цвет меняет ползунок.
// Дальше зуб плавно исчезает, чтобы не мешать читать.
// =====================================================

(function () {
  const canvas = document.getElementById('scene');
  const storyEl = document.getElementById('implant');
  const whiteEl = document.getElementById('whitening');
  const shadeInput = document.getElementById('shade');

  // Если 3D не поддерживается — сайт просто остаётся без зуба (класс no-3d прячет холст)
  function fallback() {
    document.body.classList.add('no-3d');
  }

  if (!window.THREE || !canvas) return fallback();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (error) {
    return fallback();
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Не рисуем больше пикселей, чем нужно — чтобы не тормозило на слабых устройствах
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  // ---------- Помощники ----------
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // Плавное начало и конец движения
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function smoothstep(a, b, v) {
    return smooth(clamp((v - a) / (b - a), 0, 1));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Цвет из привычной записи #RRGGBB в формат, в котором считает свет
  function color(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  }

  // ---------- Окружение: «фотостудия», которая отражается в зубе и металле ----------
  // Тёмная комната с несколькими яркими лампами. Именно блики и тени от них
  // делают керамику и титан похожими на настоящие, а не на пластик.
  function makeEnvironment() {
    const studio = new THREE.Scene();
    studio.add(new THREE.Mesh(
      new THREE.SphereGeometry(30, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x2A2D30, side: THREE.BackSide })
    ));

    function lamp(hex, brightness, w, h, x, y, z) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      material.color.set(hex).multiplyScalar(brightness);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      studio.add(mesh);
    }

    lamp(0xFFFFFF, 9, 12, 12, 0, 16, 6);     // основной свет сверху-спереди
    lamp(0xFFF2E0, 5, 5, 18, -14, 3, 9);     // тёплая полоса слева
    lamp(0xE6EEFF, 3.5, 5, 18, 14, 2, 4);    // холодная полоса справа — контур
    lamp(0xFFFFFF, 1.6, 16, 8, 0, 0, 20);    // слабая подсветка спереди
    lamp(0x0C0D0E, 1, 30, 30, 0, -14, 0);    // чёрный «пол» — даёт тень снизу

    const generator = new THREE.PMREMGenerator(renderer);
    const texture = generator.fromScene(studio, 0.04).texture;
    generator.dispose();
    return texture;
  }

  try {
    scene.environment = makeEnvironment();
  } catch (error) {
    // не получилось — зуб будет чуть проще, но сайт работает
  }

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.05));
  const key = new THREE.DirectionalLight(0xFFF8EE, 0.6);
  key.position.set(5, 7, 8);
  scene.add(key);

  // ---------- Коронка: шар, из которого «вылеплен» жевательный зуб ----------
  // Бугры: [x, z, высота]. Четыре основных разной высоты и два краевых гребня.
  const CUSPS = [
    [0.52, 0.44, 1.0], [-0.5, 0.45, 0.86], [0.5, -0.43, 0.92], [-0.5, -0.42, 0.74],
    [0.68, 0.0, 0.42], [-0.68, 0.02, 0.38]
  ];

  function buildCrown() {
    const W = 96; // сегментов по кругу
    const H = 72; // сегментов по высоте
    const geo = new THREE.SphereGeometry(1, W, H);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const NECK = color(0xE6D3AE);   // у десны эмаль теплее и темнее
    const BODY = color(0xF5EFE2);   // основной цвет зуба
    const TIP = color(0xF2F4F5);    // бугры чуть холоднее и прозрачнее
    const tint = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      let fissure = 0;

      // 1. Сечение из круга делаем «скруглённым прямоугольником», как у моляра
      const theta = Math.atan2(z, x);
      const c = Math.abs(Math.cos(theta));
      const s = Math.abs(Math.sin(theta));
      const squircle = Math.pow(Math.pow(c, 4) + Math.pow(s, 4), -0.25);
      const k = 1 + (squircle - 1) * 0.7;
      x *= k * 1.12;
      z *= k * 0.98;

      if (y > 0) {
        // 2. Верх «плечистый»: бока почти вертикальные, а не как у шара
        const h = Math.sqrt(Math.max(0, 1 - y * y));
        const boxy = Math.pow(Math.pow(y, 3) + Math.pow(h, 3), -1 / 3);
        const b = 1 + (boxy - 1) * 0.75;
        x *= b;
        z *= b;
        const yb = Math.min(1, y * b);
        const top = smoothstep(0.4, 0.92, yb);

        // 3. Бугры — мягкие холмики разной высоты
        let bump = 0;
        for (let n = 0; n < CUSPS.length; n++) {
          const dx = x - CUSPS[n][0];
          const dz = z - CUSPS[n][1];
          bump += CUSPS[n][2] * Math.exp(-(dx * dx + dz * dz) / 0.085);
        }

        // 4. Фиссуры — бороздки между буграми: продольная (слегка извилистая) и поперечная
        const along = Math.exp(-Math.pow(z - 0.04 * Math.sin(x * 6), 2) / 0.008) * Math.exp(-(x * x) / 0.5);
        const across = Math.exp(-Math.pow(x - 0.03, 2) / 0.008) * Math.exp(-(z * z) / 0.45);
        const pit = Math.exp(-(x * x + z * z) / 0.06);
        fissure = Math.min(1, along + across) * top;

        const flat = 0.74 * (1 - Math.pow(1 - yb, 1.8));
        y = flat + (0.19 * bump - 0.09 * along - 0.07 * across - 0.06 * pit) * top;

        // Бороздка, которая спускается на боковую стенку
        const side = Math.exp(-Math.pow(theta - Math.PI / 2, 2) / 0.02) * smoothstep(0.2, 0.8, yb);
        x *= 1 - 0.03 * side;
        z *= 1 - 0.03 * side;
      } else {
        // 5. Низ: лёгкая выпуклость в середине, сужение к шейке и ровный срез
        const t = -y;
        const taper = 1 + 0.03 * Math.sin(Math.min(t, 0.5) * Math.PI) - 0.34 * t * t;
        x *= taper;
        z *= taper;
        y = Math.max(y, -0.72);
      }

      pos.setXYZ(i, x, y, z);

      // 6. Цвет: тёплый у шейки, светлый на буграх, чуть темнее в бороздках
      tint.copy(NECK).lerp(BODY, smoothstep(-0.72, 0.25, y));
      tint.lerp(TIP, smoothstep(0.55, 0.9, y) * 0.8);
      tint.multiplyScalar(1 - 0.2 * fissure);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // У шара есть «шов». Усредняем нормали по шву, чтобы его не было видно на глянце
    const normal = geo.attributes.normal;
    for (let row = 0; row <= H; row++) {
      const a = row * (W + 1);
      const b = a + W;
      const nx = (normal.getX(a) + normal.getX(b)) / 2;
      const ny = (normal.getY(a) + normal.getY(b)) / 2;
      const nz = (normal.getZ(a) + normal.getZ(b)) / 2;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normal.setXYZ(a, nx / len, ny / len, nz / len);
      normal.setXYZ(b, nx / len, ny / len, nz / len);
    }

    return geo;
  }

  // Тело вращения: профиль [радиус, высота] крутится вокруг вертикальной оси
  function lathe(profile, segments) {
    return new THREE.LatheGeometry(profile.map(function (p) {
      return new THREE.Vector2(Math.max(p[0], 0.0001), p[1]);
    }), segments);
  }

  // ---------- Абатмент: с отверстием под винт наверху ----------
  function buildAbutment() {
    return lathe([
      [0, 0], [0.43, 0], [0.5, 0.05], [0.5, 0.13], [0.45, 0.22], [0.33, 0.3],
      [0.25, 0.7], [0.2, 0.78], [0.11, 0.78], [0.11, 0.62], [0, 0.62]
    ], 56);
  }

  // ---------- Шейка импланта: полированное кольцо ----------
  function buildCollar() {
    return lathe([
      [0, -0.1], [0.17, -0.1], [0.17, 0], [0.41, 0], [0.445, -0.035], [0.445, -0.25], [0.43, -0.29]
    ], 56);
  }

  // ---------- Тело импланта: микрорезьба сверху, основная резьба и насечки на кончике ----------
  function buildScrewBody() {
    const TOP = -0.29;
    const BOTTOM = -2.3;
    const LENGTH = TOP - BOTTOM;
    const STEPS = 220;
    const profile = [];

    // Профиль снизу вверх: скруглённый кончик → сужающееся тело
    for (let i = 0; i <= STEPS; i++) {
      const t = 1 - i / STEPS; // 1 на кончике, 0 у шейки
      let r;
      if (t < 0.93) r = 0.43 - 0.17 * (t / 0.93);
      else r = 0.26 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.93) / 0.07, 2)));
      profile.push([r, TOP - t * LENGTH]);
    }

    const geo = lathe(profile, 96);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = (TOP - y) / LENGTH;
      const turn = Math.atan2(x, z) / (Math.PI * 2);
      let k = 1;

      // Микрорезьба у шейки: мелкие частые витки
      let fine = y * -9 + turn;
      fine -= Math.floor(fine);
      k += 0.045 * (1 - Math.abs(fine * 2 - 1)) * smoothstep(0.02, 0.06, t) * (1 - smoothstep(0.2, 0.24, t));

      // Основная резьба: крупные острые витки по спирали
      let coarse = y * -3.2 + turn;
      coarse -= Math.floor(coarse);
      k += 0.22 * Math.pow(1 - Math.abs(coarse * 2 - 1), 1.3) * smoothstep(0.24, 0.3, t) * (1 - smoothstep(0.86, 0.92, t));

      // Три режущие насечки на кончике: ими имплант врезается в кость
      let flute = 0;
      for (let n = 0; n < 3; n++) {
        let d = turn - n / 3;
        d -= Math.round(d);
        flute += Math.exp(-(d * d) / 0.0016);
      }
      k *= 1 - 0.3 * Math.min(1, flute) * smoothstep(0.6, 0.72, t);

      pos.setXYZ(i, x * k, y, z * k);
    }

    geo.computeVertexNormals();
    return geo;
  }

  // ---------- Материалы ----------
  const WHITE = new THREE.Color(1, 1, 1);
  const STAINED = color(0xD9B45A); // во сколько раз «желтеет» эмаль до отбеливания

  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    vertexColors: true,       // цвет записан в каждой точке коронки (см. buildCrown)
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,             // лаковый слой — блеск, как у эмали
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.9,
    emissive: 0x2A2118,       // едва заметное тёплое свечение — имитация полупрозрачности
    emissiveIntensity: 0.35
  });

  // Золотистое покрытие — так выглядят настоящие абатменты
  const gold = new THREE.MeshStandardMaterial({
    color: color(0xCDA662), roughness: 0.24, metalness: 1, side: THREE.DoubleSide
  });

  const polished = new THREE.MeshStandardMaterial({
    color: color(0xD3D7DC), roughness: 0.18, metalness: 1, side: THREE.DoubleSide
  });

  // Тело импланта матовое: его обрабатывают пескоструем, чтобы кость лучше прирастала
  const sandblasted = new THREE.MeshStandardMaterial({
    color: color(0x9A9EA4), roughness: 0.52, metalness: 1, side: THREE.DoubleSide
  });

  // ---------- Сборка зуба ----------
  const tooth = new THREE.Group();  // двигаем и вращаем всё целиком
  const parts = new THREE.Group();  // сдвиг, чтобы центр вращения был посередине
  parts.position.y = 0.2;
  tooth.add(parts);
  scene.add(tooth);

  const crown = new THREE.Mesh(buildCrown(), ceramic);
  crown.scale.setScalar(0.94);

  const abutment = new THREE.Mesh(buildAbutment(), gold);

  const screw = new THREE.Group();
  screw.add(new THREE.Mesh(buildCollar(), polished), new THREE.Mesh(buildScrewBody(), sandblasted));

  const CROWN_Y = 0.88; // коронка сидит на шейке абатмента
  crown.position.y = CROWN_Y;
  parts.add(crown, abutment, screw);

  // ---------- Мягкая тень под зубом ----------
  function makeShadow() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(23,25,28,0.5)');
    g.addColorStop(0.6, 'rgba(23,25,28,0.14)');
    g.addColorStop(1, 'rgba(23,25,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.6), material);
  }

  const shadow = makeShadow();
  scene.add(shadow);

  // ---------- Состояние ----------
  const mouse = { x: 0, y: 0 };
  let intro = reduceMotion ? 1 : 0; // зуб «вырастает» при загрузке
  let mobile = false;
  let halfW = 1;
  let halfH = 1;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    mobile = w < 760;

    // Сколько «единиц сцены» помещается от центра экрана до края
    halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
    halfW = halfH * camera.aspect;
  }

  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('mousemove', function (event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (event.clientY / window.innerHeight) * 2 - 1;
  });

  // ---------- Анимация ----------
  const clock = new THREE.Clock();
  const targetColor = new THREE.Color();
  let running = true;
  let spin = 0;
  let scrollSpin = 0;                 // сколько зуб «накрутила» прокрутка
  let lastScroll = window.scrollY;

  // Вкладка не видна — не тратим ресурсы
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) {
      clock.getDelta();
      requestAnimationFrame(frame);
    }
  });

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const vh = window.innerHeight;

    // --- Где мы на странице ---
    const story = storyEl.getBoundingClientRect();
    const white = whiteEl.getBoundingClientRect();

    // p — прогресс прокрутки блока про имплант: 0 в начале, 1 в конце
    const p = clamp(-story.top / (story.height - vh), 0, 1);
    // toWhite — подъезжаем к блоку отбеливания
    const toWhite = smoothstep(0, 1, (vh * 0.9 - white.top) / (vh * 0.9));
    // out — блок отбеливания закончился, зуб исчезает
    const out = smoothstep(0, 1, (vh - white.bottom) / (vh * 0.35));

    canvas.style.opacity = String(1 - out);
    if (out >= 1) return; // зуба не видно — ничего не рисуем

    // --- Прокрутка раскручивает зуб: чем быстрее листаешь, тем быстрее он вращается ---
    const scrollNow = window.scrollY;
    scrollSpin += clamp(scrollNow - lastScroll, -140, 140) * 0.0045; // ограничение — чтобы прыжок по меню не закрутил зуб волчком
    lastScroll = scrollNow;

    // --- Разборка начинается ещё на первом экране, как только начинаешь листать ---
    // approach — блок про имплант подъезжает снизу: 0 → 1
    const approach = clamp((vh - story.top) / vh, 0, 1);
    const crownLift = smoothstep(0.12, 0.95, approach) * (1 - toWhite);
    const screwDrop = smoothstep(0.04, 0.3, p) * (1 - toWhite);
    const exploded = Math.max(crownLift, screwDrop);

    // Какая деталь сейчас «главная» (те же пороги, что у карточек в main.js)
    const focusCrown = (1 - smoothstep(0.26, 0.34, p)) * crownLift;
    const focusAbutment = smoothstep(0.26, 0.34, p) * (1 - smoothstep(0.58, 0.66, p)) * screwDrop;
    const focusScrew = smoothstep(0.58, 0.66, p) * screwDrop;

    // Главная деталь выдвигается к зрителю и немного увеличивается.
    // На телефоне выдвигаем слабее: места мало, деталь не должна наезжать на текст
    const push = mobile ? 0.3 : 1;
    crown.position.y = CROWN_Y + 1.5 * crownLift;
    crown.position.z = 0.6 * push * focusCrown;
    crown.scale.setScalar(0.94 * (1 + 0.07 * focusCrown));

    screw.position.y = -1.2 * screwDrop;
    screw.position.z = 0.5 * push * focusScrew;
    screw.rotation.y += dt * (0.4 * screwDrop + 2.2 * focusScrew); // имплант «вкручивается»

    abutment.position.z = 0.6 * push * focusAbutment;
    abutment.rotation.y += dt * 1.6 * focusAbutment;

    // В блоке отбеливания остаётся только коронка
    const metalScale = Math.max(0.0001, 1 - toWhite);
    abutment.scale.setScalar(metalScale * (1 + 0.45 * focusAbutment));
    screw.scale.setScalar(metalScale * (1 + 0.07 * focusScrew));

    // --- Положение на экране ---
    // Компьютер: справа от текста, в блоке отбеливания перелетает налево.
    // Телефон: всегда по центру в верхней части экрана.
    const fit = clamp(halfW / 6.4, 0.55, 1); // на узких экранах зуб меньше
    const side = mobile ? 0 : halfW * 0.46;
    const targetX = side * (1 - 2 * toWhite);

    let targetScale;
    let targetY;
    if (mobile) {
      targetScale = lerp(lerp(0.74, 0.47, exploded), 0.9, toWhite);
      targetY = halfH * lerp(lerp(0.48, 0.42, exploded), 0.5, toWhite);
    } else {
      targetScale = lerp(lerp(1.15, 0.86, exploded), 1.5, toWhite) * fit;
      targetY = lerp(0.15, -0.3, exploded); // в разобранном виде чуть ниже, чтобы коронка не ушла под шапку
    }
    // Когда осталась одна коронка — ставим её по центру, а не выше
    targetY -= (CROWN_Y + 0.3) * targetScale * toWhite;

    if (intro < 1) intro = Math.min(1, intro + dt / 1.4);
    const grow = 1 - Math.pow(1 - intro, 3);

    const ease = reduceMotion ? 1 : 0.09;
    const bob = Math.sin(t * 1.2) * 0.11;
    // Зуб слегка смещается за мышкой — появляется ощущение глубины
    const parallaxX = mobile ? 0 : mouse.x * 0.3;
    const parallaxY = mobile ? 0 : -mouse.y * 0.18;
    tooth.position.x += (targetX + parallaxX - tooth.position.x) * ease;
    tooth.position.y += (targetY + parallaxY + bob - tooth.position.y) * ease;
    const scale = tooth.scale.x + (targetScale * grow - tooth.scale.x) * ease;
    tooth.scale.setScalar(Math.max(scale, 0.0001));

    // --- Вращение: крутится сам, от прокрутки и поворачивается за мышкой ---
    if (!reduceMotion) spin += dt * 0.4;
    const rotY = spin + scrollSpin + mouse.x * 0.8 + (1 - grow) * 4;
    const rotX = 0.14 + mouse.y * 0.3 + toWhite * 0.4;
    tooth.rotation.y += (rotY - tooth.rotation.y) * 0.08;
    tooth.rotation.x += (rotX - tooth.rotation.x) * 0.08;
    // Собранный зуб стоит под наклоном и покачивается, разобранный выпрямляется
    tooth.rotation.z = (-0.12 + Math.sin(t * 0.7) * 0.04) * (1 - exploded) * (1 - toWhite);

    // --- Тень: под собранным зубом, пропадает при разборке ---
    shadow.position.set(tooth.position.x, tooth.position.y - bob - 2.75 * tooth.scale.x, -1);
    shadow.scale.setScalar(tooth.scale.x);
    shadow.material.opacity = 0.55 * grow * (1 - exploded) * (1 - toWhite);

    // --- Цвет эмали: в блоке отбеливания им управляет ползунок ---
    const shade = shadeInput ? Number(shadeInput.value) / 100 : 1;
    targetColor.copy(WHITE).lerp(STAINED, (1 - shade) * toWhite);
    ceramic.color.lerp(targetColor, 0.15);

    renderer.render(scene, camera);
  }

  requestAnimationFrame(frame);
})();

// =====================================================
// main.js — меню, карточки деталей, ползунок, запись, появление блоков
// =====================================================

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---------- Шапка и мобильное меню ----------
const header = document.querySelector('.header');

function closeMenu() {
  document.body.classList.remove('menu-open');
}

document.getElementById('burger').addEventListener('click', function () {
  document.body.classList.toggle('menu-open');
});

document.querySelectorAll('.nav a').forEach(function (link) {
  link.addEventListener('click', closeMenu);
});

// ---------- Блок про имплант: какая деталь сейчас подсвечена ----------
const storyEl = document.getElementById('implant');
const partCards = document.querySelectorAll('.part');
const storyBar = document.getElementById('story-bar');

// Прогресс прокрутки блока: 0 в начале, 1 в конце
function storyProgress() {
  const rect = storyEl.getBoundingClientRect();
  return clamp(-rect.top / (rect.height - window.innerHeight), 0, 1);
}

function updateStory() {
  const p = storyProgress();
  // Те же пороги, что и в 3D-сцене: коронка → абатмент → имплант
  const stage = p < 0.3 ? 0 : p < 0.62 ? 1 : 2;
  partCards.forEach(function (card, index) {
    card.classList.toggle('active', index === stage);
  });
  storyBar.style.transform = 'scaleX(' + p + ')';
}

// Клик по карточке прокручивает к нужной детали
const STAGE_POINTS = [0.14, 0.46, 0.86];

partCards.forEach(function (card, index) {
  card.addEventListener('click', function () {
    const top = storyEl.getBoundingClientRect().top + window.scrollY;
    const distance = storyEl.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + distance * STAGE_POINTS[index], behavior: 'smooth' });
  });
});

// ---------- Плавная смена фона: светлый → тёмный → светлый ----------
// Вместо резкой границы между светлым экраном и тёмным блоком про имплант
// перекрашиваем фон всей страницы постепенно, пока блок подъезжает и уезжает.
const LIGHT = [242, 239, 233]; // тот же цвет, что --bg в CSS
const DARK = [19, 21, 23];     // тот же цвет, что --dark в CSS
const lightBlocks = document.querySelectorAll('.hero .container, .blueprint, .hint, .white .pin-grid');
const darkBlock = document.querySelector('.story .pin-grid');

document.documentElement.classList.add('blend'); // делает блоки прозрачными (см. style.css)

function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function updateBlend() {
  const vh = window.innerHeight;
  const rect = storyEl.getBoundingClientRect();

  // enter: блок въезжает снизу (0 → 1). exit: блок уезжает вверх (1 → 0)
  const enter = clamp((vh - rect.top) / (vh * 0.85), 0, 1);
  const exit = clamp(rect.bottom / (vh * 0.85), 0, 1);
  const dark = smoothstep(0, 1, enter) * smoothstep(0, 1, exit); // 0 — светло, 1 — темно

  const mix = LIGHT.map(function (value, i) {
    return Math.round(value + (DARK[i] - value) * dark);
  });
  document.body.style.backgroundColor = 'rgb(' + mix.join(',') + ')';
  document.body.classList.toggle('on-dark', dark > 0.55);

  // Тексты на светлом гаснут, пока фон темнеет, а светлый текст тёмного блока проявляется
  const lightOpacity = String(1 - smoothstep(0.12, 0.6, dark));
  lightBlocks.forEach(function (el) { el.style.opacity = lightOpacity; });
  darkBlock.style.opacity = String(smoothstep(0.45, 0.92, dark));
}

// Чтобы не считать на каждое событие прокрутки, обновляем раз в кадр
let ticking = false;

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function () {
    header.classList.toggle('scrolled', window.scrollY > 10);
    updateStory();
    updateBlend();
    ticking = false;
  });
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);

updateStory();
updateBlend();

// ---------- Ползунок отбеливания: название оттенка ----------
// Шкала оттенков, которой пользуются стоматологи: от тёмного A4 до самого белого BL1
const SHADES = ['A4', 'A3.5', 'A3', 'A2', 'A1', 'B1', 'BL2', 'BL1'];
const shadeInput = document.getElementById('shade');
const shadeName = document.getElementById('shade-name');
const shadeTicks = document.getElementById('shade-ticks');

// Подписи под ползунком: все оттенки шкалы
SHADES.forEach(function (name) {
  const tick = document.createElement('span');
  tick.textContent = name;
  shadeTicks.append(tick);
});

function updateShade() {
  const index = Math.round(Number(shadeInput.value) / 100 * (SHADES.length - 1));
  shadeName.textContent = SHADES[index];
  Array.from(shadeTicks.children).forEach(function (tick, i) {
    tick.classList.toggle('on', i === index);
  });
}

shadeInput.addEventListener('input', updateShade);
updateShade();

// ---------- Окно записи ----------
const modal = document.getElementById('modal');
const form = document.getElementById('book-form');
const serviceSelect = document.getElementById('service-select');

function openModal(service) {
  closeMenu();
  modal.classList.remove('success');
  if (service) serviceSelect.value = service; // сразу выбрать услугу, по которой кликнули
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden'; // не прокручивать страницу под окном
  setTimeout(function () { form.elements.name.focus(); }, 250);
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Любой элемент с data-book открывает запись. Значение — какую услугу выбрать
document.addEventListener('click', function (event) {
  const trigger = event.target.closest('[data-book]');
  if (!trigger) return;
  event.preventDefault();
  openModal(trigger.dataset.book || null);
});

document.querySelectorAll('[data-close]').forEach(function (button) {
  button.addEventListener('click', closeModal);
});

// Клик по тёмному фону и клавиша Esc тоже закрывают окно
modal.addEventListener('click', function (event) {
  if (event.target === modal) closeModal();
});

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    closeModal();
    closeMenu();
  }
});

// Выбор времени: утро / день / вечер
const timeChips = document.querySelectorAll('#time-chips .chip');

timeChips.forEach(function (chip) {
  chip.addEventListener('click', function () {
    timeChips.forEach(function (c) { c.classList.toggle('active', c === chip); });
  });
});

// Отправка: в демо просто показываем «Заявка принята»
form.addEventListener('submit', function (event) {
  event.preventDefault();
  const time = document.querySelector('#time-chips .chip.active').textContent.toLowerCase();
  document.getElementById('done-text').textContent =
    'Администратор перезвонит в течение 15 минут и подберёт время на ' + time + '. Услуга: ' + serviceSelect.value + '.';
  form.reset();
  modal.classList.add('success');
});

// ---------- FAQ: открыт только один вопрос за раз ----------
document.querySelectorAll('.faq details').forEach(function (item) {
  item.addEventListener('toggle', function () {
    if (!item.open) return;
    document.querySelectorAll('.faq details').forEach(function (other) {
      if (other !== item) other.open = false;
    });
  });
});

// ---------- Счётчики цифр ----------
function countUp(el) {
  const target = Number(el.dataset.count);
  const decimals = Number(el.dataset.decimals || 0);
  const suffix = el.dataset.suffix || '';
  const duration = 1400;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // плавное замедление в конце
    el.textContent = (target * eased).toLocaleString('ru-RU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// ---------- Появление блоков и запуск счётчиков при прокрутке ----------
const observer = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    observer.unobserve(el);

    if (el.dataset.count) {
      countUp(el);
      return;
    }

    // Карточки в одной сетке появляются по очереди
    const siblings = Array.from(el.parentElement.children).filter(function (c) {
      return c.classList.contains('reveal');
    });
    el.style.transitionDelay = Math.max(0, siblings.indexOf(el)) * 0.08 + 's';
    el.classList.add('visible');
    setTimeout(function () { el.style.transitionDelay = ''; }, 1400);
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal, [data-count]').forEach(function (el) { observer.observe(el); });

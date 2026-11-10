import { $, html } from './dom.js';

const ORDER = ['hidden', 'peek', 'half', 'full'];
let onHide = null;

export function sheetState() {
  return $('#sheet').dataset.state;
}
export function setSheet(state) {
  const sh = $('#sheet');
  sh.dataset.state = state;
  const fabs = $('#fabs');
  const h = window.innerHeight;
  const lift = state === 'peek' ? 150 - 6 : state === 'half' ? h * 0.46 - 6 : state === 'full' ? h : 0;
  fabs.style.transform = `translateY(${-Math.max(0, Math.min(lift, h * 0.6))}px)`;
  fabs.style.opacity = state === 'full' ? '0' : '1';
  if (state === 'hidden' && onHide) {
    const f = onHide;
    onHide = null;
    f();
  }
}
export function showSheet(content, state = 'half', { hideCb } = {}) {
  html($('#sheetBody'), content);
  $('#sheetBody').scrollTop = 0;
  onHide = hideCb || null;
  setSheet(state);
  return $('#sheetBody');
}

export function initSheet() {
  const sh = $('#sheet');
  const handle = $('#sheetHandle');
  let startY = 0;
  let startT = 0;
  let dragging = false;
  const curT = () => {
    const m = new DOMMatrixReadOnly(getComputedStyle(sh).transform);
    return m.m42;
  };
  const down = (y) => {
    dragging = true;
    startY = y;
    startT = curT();
    sh.classList.add('dragging');
  };
  const move = (y) => {
    if (!dragging) return;
    const t = Math.max(0, startT + (y - startY));
    sh.style.transform = `translateY(${t}px)`;
  };
  const up = (y) => {
    if (!dragging) return;
    dragging = false;
    sh.classList.remove('dragging');
    sh.style.transform = '';
    const dy = y - startY;
    const cur = sheetState();
    let i = ORDER.indexOf(cur);
    if (Math.abs(dy) < 8) i = cur === 'full' ? 2 : cur === 'half' ? 3 : 2;
    else if (dy > 60) i = Math.max(cur === 'peek' ? 0 : 1, i - (dy > 260 ? 2 : 1));
    else if (dy < -60) i = Math.min(3, i + (dy < -260 ? 2 : 1));
    setSheet(ORDER[i]);
  };
  handle.addEventListener('touchstart', (e) => down(e.touches[0].clientY), { passive: true });
  handle.addEventListener('touchmove', (e) => move(e.touches[0].clientY), { passive: true });
  handle.addEventListener('touchend', (e) => up(e.changedTouches[0].clientY));
  handle.addEventListener('mousedown', (e) => {
    down(e.clientY);
    const mm = (ev) => move(ev.clientY);
    const mu = (ev) => {
      up(ev.clientY);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });
  // içerik en üstteyken aşağı çekince çekmece insin
  const body = $('#sheetBody');
  let by = 0;
  let atTop = false;
  body.addEventListener('touchstart', (e) => {
    by = e.touches[0].clientY;
    atTop = body.scrollTop <= 0;
  }, { passive: true });
  body.addEventListener('touchend', (e) => {
    const dy = e.changedTouches[0].clientY - by;
    if (atTop && dy > 90 && body.scrollTop <= 0) {
      const cur = sheetState();
      setSheet(cur === 'full' ? 'half' : 'peek');
    }
  });
}

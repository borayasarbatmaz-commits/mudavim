import {
  createIcons, Search, X, LocateFixed, HandHelping, Map as MapIcon, Trophy, User, ChevronLeft, Star, Camera, Navigation,
  ScanEye, Check, Flag, Plus, Route, Footprints, Car, Clock, Store, ExternalLink, Info, DoorOpen, Pencil, Settings,
  ShieldCheck, Volume2, VolumeX, Image, Compass, Users, Award, Sparkles, CircleHelp, Trash2, RotateCcw, MessageCircle,
  Crosshair, MapPin, Lock, Medal, Crown, Eye, BadgeCheck,
} from 'lucide';
import { esc } from '../lib/text.js';
import { S, userOf, progressOf } from '../lib/state.js';
import { frameOf } from '../lib/game.js';

const ICONS = { Search, X, LocateFixed, HandHelping, Map: MapIcon, Trophy, User, ChevronLeft, Star, Camera, Navigation, ScanEye, Check,
  Flag, Plus, Route, Footprints, Car, Clock, Store, ExternalLink, Info, DoorOpen, Pencil, Settings, ShieldCheck, Volume2, VolumeX,
  Image, Compass, Users, Award, Sparkles, CircleHelp, Trash2, RotateCcw, MessageCircle, Crosshair, MapPin, Lock, Medal, Crown, Eye, BadgeCheck };

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export function icons(root = document) {
  createIcons({ icons: ICONS, root });
}
export const ic = (name) => `<i data-lucide="${name}"></i>`;

export function html(el, str) {
  el.innerHTML = str;
  icons(el);
  return el;
}

export function toast(msg, cls = '', ms = 2600) {
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(inner, { onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${inner}</div>`;
  icons(bg);
  const close = () => {
    bg.remove();
    onClose?.();
  };
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.closest('[data-close]')) close();
  });
  $('#app').appendChild(bg);
  return { el: bg, close };
}

export function confirmBox(text, okText = 'Evet') {
  return new Promise((res) => {
    const m = modal(`<p style="color:var(--ink);font-size:16px">${esc(text)}</p>
      <div style="display:flex;gap:8px"><button class="btn block" data-close>Vazgeç</button><button class="btn primary block" id="cbOk">${esc(okText)}</button></div>`,
    { onClose: () => res(false) });
    $('#cbOk', m.el).onclick = () => {
      m.el.remove();
      res(true);
    };
  });
}

// --- tam ekran sayfa yığını (Android geri tuşu ile kapanır) ---
const stack = [];
export function openPage(title, bodyHtml, { cls = '', onClose, actions = '' } = {}) {
  const el = document.createElement('section');
  el.className = `page ${cls}`;
  el.innerHTML = `<div class="page-head"><button class="icon-btn" data-back aria-label="Geri">${ic('chevron-left')}</button><h1>${esc(title)}</h1>${actions}</div><div class="page-body"></div>`;
  html($('.page-body', el), bodyHtml);
  icons($('.page-head', el));
  $('[data-back]', el).onclick = () => goBack();
  $('#pages').appendChild(el);
  stack.push({ el, onClose });
  if (ignorePop > 0) pendingPush++;
  else history.pushState({ page: stack.length }, '');
  return el;
}
export function closeTopPage() {
  const top = stack.pop();
  if (!top) return false;
  top.el.remove();
  top.onClose?.();
  return true;
}
// Sayfaları kodla kapatırken geçmişi de geri al; oluşacak popstate olayını yok say
let ignorePop = 0;
let pendingPush = 0; // geri gitme tamamlanmadan açılan sayfalar
export function expectPop() {
  ignorePop++;
}
export function consumePop() {
  if (ignorePop > 0) {
    ignorePop--;
    if (!ignorePop && pendingPush) {
      for (let k = stack.length - pendingPush + 1; k <= stack.length; k++) history.pushState({ page: k }, '');
      pendingPush = 0;
    }
    return true;
  }
  return false;
}
export function goBack() {
  if (closeTopPage()) {
    ignorePop++;
    history.back();
  }
}
export function closeAllPages() {
  const n = stack.length;
  if (!n) return;
  while (stack.length) closeTopPage();
  ignorePop++;
  history.go(-n);
}
// popstate (Android geri tuşu): geçmişteki derinliğe göre sayfaları kapat
export function syncPages(depth) {
  while (stack.length > depth) closeTopPage();
}
export const pageCount = () => stack.length;

// Avatar (çerçeveli)
export function avatar(uid, size = '') {
  const u = userOf(uid);
  const lv = progressOf(uid).level.n;
  const fr = frameOf(lv);
  const inner = u.avatar ? `<img src="${u.avatar}" alt="">` : esc(u.emoji || '🙂');
  return `<span class="av ${size} ${fr}" style="background:${u.color}22">${inner}</span>`;
}

export function userLine(uid) {
  const u = userOf(uid);
  const p = progressOf(uid);
  return `${avatar(uid)}<b>${esc(u.nick)}</b><span class="muted">Sv.${p.level.n} ${esc(p.level.name)}</span>${u.sim ? '<span class="pill demo">demo</span>' : ''}`;
}

export function stars(v) {
  const full = Math.round(v * 2) / 2;
  let s = '';
  for (let i = 1; i <= 5; i++) s += full >= i ? '★' : full >= i - 0.5 ? '<span style="opacity:.5">★</span>' : '<span style="color:#d6d3d1">★</span>';
  return `<span class="stars">${s}</span>`;
}

export { esc, S };

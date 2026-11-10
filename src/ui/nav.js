// Uygulama içi yol tarifi (OSRM / OpenStreetMap). Kullanıcı başka uygulamaya geçmez,
// varınca doğrudan "buldum / puanla / AR ile göster" adımına düşer.
import { App } from '../app.js';
import { S, saveSettings, productOf } from '../lib/state.js';
import { catInfo } from '../data/catalog.js';
import { distance, nearestOnLine, lineLength } from '../lib/geo.js';
import { esc, fmtDist } from '../lib/text.js';
import { $, ic, toast, icons } from './dom.js';
import { setRoute } from './map.js';
import { showSheet, setSheet } from './sheet.js';
import { placeLabel, googleUrl } from './views.js';

const SERVERS = {
  foot: ['https://routing.openstreetmap.de/routed-foot/route/v1/driving/'],
  car: ['https://routing.openstreetmap.de/routed-car/route/v1/driving/', 'https://router.project-osrm.org/route/v1/driving/'],
};
let N = null; // aktif yönlendirme
let wakeLock = null;

const MOD = { left: 'sola', right: 'sağa', 'slight left': 'hafif sola', 'slight right': 'hafif sağa', 'sharp left': 'keskin sola', 'sharp right': 'keskin sağa' };
const ARROW = { left: '↰', right: '↱', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↰', 'sharp right': '↱', straight: '↑', uturn: '↶' };

export function instruction(step) {
  const m = step.maneuver || {};
  const mod = m.modifier;
  const name = step.name ? ` · ${step.name}` : '';
  const turn = MOD[mod] ? `${MOD[mod][0].toLocaleUpperCase('tr-TR')}${MOD[mod].slice(1)} dön` : mod === 'uturn' ? 'U dönüşü yap' : 'Düz devam et';
  let text;
  let arrow = ARROW[mod] || '↑';
  switch (m.type) {
    case 'depart': text = `Yola çık${name}`; break;
    case 'arrive': text = mod === 'left' ? 'Varış: hedef solunda' : mod === 'right' ? 'Varış: hedef sağında' : 'Hedefe vardın'; arrow = '🏁'; break;
    case 'roundabout': case 'rotary': text = m.exit ? `Dönel kavşakta ${m.exit}. çıkıştan çık${name}` : `Dönel kavşağa gir${name}`; arrow = '⟳'; break;
    case 'exit roundabout': case 'exit rotary': text = `Kavşaktan çık${name}`; break;
    case 'end of road': text = `Yolun sonunda ${MOD[mod] || ''} dön${name}`.replace('  ', ' '); break;
    case 'fork': text = `Çatalda ${mod?.includes('left') ? 'soldan' : 'sağdan'} devam et${name}`; break;
    case 'merge': text = `Yola katıl${name}`; break;
    case 'on ramp': text = `Bağlantı yoluna gir${name}`; break;
    case 'off ramp': text = `Çıkışa gir${name}`; break;
    case 'new name': case 'continue': text = `${turn}${name}`; break;
    default: text = `${turn}${name}`;
  }
  return { text, arrow };
}

async function fetchRoute(from, to, mode) {
  let lastErr;
  for (const base of SERVERS[mode]) {
    try {
      const url = `${base}${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true&alternatives=false`;
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 12000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(tm);
      const js = await r.json();
      if (js.code !== 'Ok' || !js.routes?.length) throw new Error(js.message || js.code);
      return js.routes[0];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Rota alınamadı');
}

function speak(text) {
  if (!S.settings.voice || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    u.rate = 1.02;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* yok */ }
}

export async function startNav(place, { productId = null } = {}) {
  if (!place) return;
  if (!S.pos) {
    toast('Konumun alınamadı. Konum iznini aç.');
    return;
  }
  const ent = S.entrances.get(place.id);
  const target = ent ? [ent.lat, ent.lon] : [place.lat, place.lon];
  const mode = S.settings.mode || 'foot';
  stopNav(true);
  N = { place, target, mode, productId: productId || App.focusProduct || null, offRoute: 0, lastReroute: 0, spoken: new Set(), arrived: false };
  App.navActive = true;
  renderNavUi({ loading: true });
  await computeRoute();
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* desteklenmiyor */ }
}

async function computeRoute() {
  if (!N) return;
  const from = [S.pos.lat, S.pos.lon];
  try {
    const route = await fetchRoute(from, N.target, N.mode);
    if (!N) return;
    N.route = route;
    N.coords = route.geometry.coordinates;
    N.steps = route.legs[0].steps.map((s) => {
      const [lon, lat] = s.maneuver.location;
      const nn = nearestOnLine(lat, lon, N.coords);
      return { ...s, idx: nn.t > 0.5 ? nn.i + 1 : nn.i };
    });
    N.lastReroute = Date.now();
    setRoute(N.coords);
    follow(true);
    update();
  } catch (e) {
    console.warn(e);
    renderNavUi({ error: true });
  }
}

function follow(first) {
  if (!N || !S.pos) return;
  const opts = { center: [S.pos.lon, S.pos.lat], zoom: N.mode === 'car' ? 16.5 : 17.5, duration: first ? 900 : 500, padding: { top: 140, bottom: 170, left: 0, right: 0 } };
  if (App.heading != null && !first) opts.bearing = App.heading;
  if (first) opts.pitch = 45;
  App.map.easeTo(opts);
}

export function navOnPos() {
  if (!N || !N.coords) return;
  update();
  follow(false);
}

function update() {
  const p = S.pos;
  const near = nearestOnLine(p.lat, p.lon, N.coords);
  // rotadan çıkış kontrolü
  const lim = N.mode === 'car' ? 60 : 35;
  if (near.d > lim + Math.min(40, p.acc || 0)) {
    N.offRoute++;
    if (N.offRoute >= 2 && Date.now() - N.lastReroute > 12000) {
      N.offRoute = 0;
      toast('Rota yeniden hesaplanıyor…');
      speak('Rota yeniden hesaplanıyor');
      computeRoute();
      return;
    }
  } else N.offRoute = 0;
  const toTarget = distance(p.lat, p.lon, N.target[0], N.target[1]);
  const a = N.coords[near.i];
  const b = N.coords[near.i + 1] || a;
  const partial = distance(a[1], a[0], b[1], b[0]) * (1 - near.t);
  const remaining = lineLength(N.coords, near.i + 1) + partial;
  if (!N.arrived && (toTarget < 25 || remaining < 18)) {
    N.arrived = true;
    speak(`${placeLabel(N.place)} hedefine vardın`);
    arrive();
    return;
  }
  const next = N.steps.find((s) => s.idx > near.i && s.maneuver.type !== 'depart') || N.steps[N.steps.length - 1];
  const toNext = next ? lineLength(N.coords.slice(near.i + 1, next.idx + 1)) + partial : remaining;
  const ins = instruction(next);
  const thresholds = N.mode === 'car' ? [400, 100] : [60, 15];
  for (const th of thresholds) {
    const k = `${next.idx}_${th}`;
    if (toNext <= th && !N.spoken.has(k)) {
      N.spoken.add(k);
      speak(`${Math.round(toNext / 10) * 10} metre sonra ${ins.text.replace(' · ', ', ')}`);
    }
  }
  const speed = N.mode === 'car' ? 8.5 : 1.3; // m/s (şehir içi temkinli)
  const eta = Math.max(1, Math.round(remaining / speed / 60));
  renderNavUi({ ins, toNext, remaining, eta });
}

function renderNavUi({ loading, error, ins, toNext, remaining, eta } = {}) {
  const ui = $('#navui');
  ui.hidden = false;
  $('#tabbar').style.visibility = 'hidden';
  $('#app').classList.add('navigating');
  setSheet('hidden');
  const c = catInfo(N.place.cat);
  const top = loading ? `<div class="nav-top"><div class="arr">⏳</div><div><div class="d">Rota hesaplanıyor…</div></div></div>`
    : error ? `<div class="nav-top" style="background:#991b1b"><div class="arr">⚠️</div><div><div class="d" style="font-size:18px">Rota alınamadı</div><div class="i">İnternet bağlantını kontrol et ya da Google Haritalar'da aç.</div></div></div>`
      : `<div class="nav-top"><div class="arr">${ins.arrow}</div><div style="min-width:0"><div class="d">${fmtDist(toNext)}</div><div class="i">${esc(ins.text)}</div></div></div>`;
  ui.innerHTML = `${top}
    <div class="nav-bottom"><div class="eta">${eta ? `<b>${eta} dk</b><span class="muted">${fmtDist(remaining)}</span>` : ''}
      <div class="modes"><button data-m="foot" class="${N.mode === 'foot' ? 'on' : ''}">${ic('footprints')}Yürü</button><button data-m="car" class="${N.mode === 'car' ? 'on' : ''}">${ic('car')}Araç</button></div></div>
      <div style="margin-top:8px;font-weight:600">${c.icon} ${esc(placeLabel(N.place))}${N.productId ? ` <span class="muted" style="font-weight:400">· ${esc(productOf(N.productId).name)}</span>` : ''}</div>
      <div class="row2"><button class="btn" data-ar>${ic('scan-eye')} AR</button>
        <button class="btn" data-voice aria-label="Ses">${ic(S.settings.voice ? 'volume-2' : 'volume-x')}</button>
        ${error ? `<a class="btn" href="${googleUrl(N.place)}" target="_blank" rel="noopener">${ic('external-link')} Google</a>` : ''}
        <button class="btn dark" data-stop>Bitir</button></div></div>`;
  icons(ui);
  ui.querySelectorAll('[data-m]').forEach((b) => (b.onclick = async () => {
    if (N.mode === b.dataset.m) return;
    N.mode = b.dataset.m;
    await saveSettings({ mode: N.mode });
    renderNavUi({ loading: true });
    computeRoute();
  }));
  ui.querySelector('[data-ar]').onclick = () => App.openAR(N.place);
  ui.querySelector('[data-voice]').onclick = async () => {
    await saveSettings({ voice: !S.settings.voice });
    if (N.coords) update();
    else renderNavUi({ loading, error });
  };
  ui.querySelector('[data-stop]').onclick = () => stopNav();
}

function arrive() {
  const place = N.place;
  const pid = N.productId;
  const pr = pid ? productOf(pid) : null;
  stopNav(true);
  const body = showSheet(`<div class="empty" style="padding-top:6px"><div class="big">🎯</div><h2 style="margin:6px 0">Vardın!</h2>
    <div>${catInfo(place.cat).icon} <b>${esc(placeLabel(place))}</b></div><div class="muted" style="margin-top:4px">Dükkanı göremiyor musun? AR ile göster.</div></div>
    <div style="display:grid;gap:8px">
      <button class="btn primary block" data-ar>${ic('scan-eye')} AR ile dükkanı göster</button>
      <button class="btn block" style="background:#0f766e;color:#fff" data-found>${ic('check')} ${pr ? `${esc(pr.name)} burada var` : 'Aradığım burada var'}</button>
      <button class="btn block" data-rate>${ic('star')} Puanla</button>
      <button class="btn ghost block" data-nf>Bulamadım</button></div>`, 'half');
  $('[data-ar]', body).onclick = () => App.openAR(place);
  $('[data-found]', body).onclick = () => App.openConfirm(place.id, pid);
  $('[data-rate]', body).onclick = () => App.openRate(place.id, pid);
  $('[data-nf]', body).onclick = () => {
    if (pid && S.offers.has(`${place.id}|${pid}`)) App.reportOffer(`${place.id}|${pid}`);
    else App.askHelp(pr ? pr.name : '');
  };
}

export function stopNav(silent) {
  if (!N && silent) return;
  N = null;
  App.navActive = false;
  setRoute(null);
  $('#navui').hidden = true;
  $('#navui').innerHTML = '';
  $('#tabbar').style.visibility = '';
  $('#app').classList.remove('navigating');
  App.map?.easeTo({ pitch: 0, bearing: 0, duration: 400 });
  try {
    wakeLock?.release();
  } catch { /* */ }
  wakeLock = null;
  if (!silent && App.selectedPlace) App.openPlace(App.selectedPlace.id);
}

export const navState = () => N;

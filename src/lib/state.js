// Uygulama durumu: açık veriden gelen dükkanlar + (demo) simüle topluluk + kullanıcının kendi katkıları.
// Kullanıcının katkıları olay (event) listesi olarak telefonda saklanır, her açılışta yeniden uygulanır.
import * as db from './db.js';
import { CATEGORIES, PRODUCT_BY_ID } from '../data/catalog.js';
import { computeScores, isTrusted } from './engine.js';
import { makeSimUsers, generateSim, simHelpNear, hash, rng } from './sim.js';
import { distance } from './geo.js';
import { norm } from './text.js';
import { XP, levelOf, emptyStats, noteActivity, badgesFrom, SOUPS, HW, pinLevel, freshness, TITLE_RULES } from './game.js';

export const DEFAULT_SETTINGS = { sim: true, geofence: true, geofenceM: 150, voice: true, mode: 'foot', onboarded: false };

export const S = {
  meta: null, places: [], placeById: new Map(), mahalle: [], districts: [], center: [40.7735, 29.3955],
  offers: new Map(), users: new Map(), help: new Map(), placeReports: new Map(), closedPlaces: new Set(),
  reviewed: new Map(), entrances: new Map(), customProducts: new Map(), photos: new Map(),
  events: [], me: null, settings: { ...DEFAULT_SETTINGS }, scores: null, stats: new Map(), titles: new Map(),
  placeTop: new Map(), pos: null, listeners: new Set(),
};

export function onChange(fn) {
  S.listeners.add(fn);
  return () => S.listeners.delete(fn);
}
function emit() {
  for (const fn of S.listeners) fn();
}

export async function loadData(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Veri dosyası alınamadı (${res.status})`);
  const js = await res.json();
  S.meta = js;
  S.mahalle = js.mahalle || [];
  S.districts = js.districts || [];
  S.places = js.places.map((r) => ({ id: r[0], name: r[1], cat: r[2], lat: r[3], lon: r[4], mah: r[5], addr: r[6], hours: r[7], src: r[8] }));
  // bölge merkezi: dükkanların ortanca noktası
  const lats = S.places.map((p) => p.lat).sort((a, b) => a - b);
  const lons = S.places.map((p) => p.lon).sort((a, b) => a - b);
  if (lats.length) S.center = [lats[lats.length >> 1], lons[lons.length >> 1]];
}

export async function init() {
  S.events = (await db.get('events')) || [];
  S.me = (await db.get('me')) || { nick: '', avatar: null, title: '', createdAt: Date.now() };
  S.settings = { ...DEFAULT_SETTINGS, ...((await db.get('settings')) || {}) };
  const photoIds = S.events.map((e) => e.photo).filter(Boolean);
  for (const id of photoIds) {
    const d = await db.get(`photo:${id}`);
    if (d) S.photos.set(id, d);
  }
  rebuild();
}

export function meUser() {
  return { id: 'me', nick: S.me?.nick || 'Sen', avatar: S.me?.avatar || null, emoji: '🙂', color: '#C2410C', sim: false, baseXp: S.me?.bonusXp || 0 };
}

export function productOf(id) {
  return PRODUCT_BY_ID[id] || S.customProducts.get(id) || { id, name: id.replace(/^c_/, '').replace(/_/g, ' '), cats: [], syn: [] };
}
export const placeOf = (id) => S.placeById.get(id);
export const userOf = (id) => S.users.get(id) || { id, nick: '?', emoji: '👤', color: '#999' };
export const mahName = (i) => (i >= 0 && S.mahalle[i] ? S.mahalle[i][0] : '');
export const districtOfMah = (i) => (i >= 0 && S.mahalle[i] && S.mahalle[i][3] >= 0 ? S.districts[S.mahalle[i][3]] : '');

function getOffer(placeId, productId) {
  const key = `${placeId}|${productId}`;
  let o = S.offers.get(key);
  if (!o) {
    o = { key, placeId, productId, confirms: [], ratings: [], reports: [], closed: false };
    S.offers.set(key, o);
  }
  return o;
}

export function customProductId(name) {
  return `c_${norm(name).replace(/ /g, '_')}`;
}

function ensureCustom(productId, name, place) {
  if (!productId.startsWith('c_') || S.customProducts.has(productId)) return;
  S.customProducts.set(productId, { id: productId, name, cats: place ? [place.cat] : [], syn: [], custom: true });
}

export function rebuild() {
  S.offers = new Map();
  S.help = new Map();
  S.placeReports = new Map();
  S.closedPlaces = new Set();
  S.reviewed = new Map();
  S.entrances = new Map();
  S.customProducts = new Map();
  S.placeById = new Map(S.places.filter((p) => !p.user).map((p) => [p.id, p]));
  S.places = S.places.filter((p) => !p.user);
  const sims = makeSimUsers(S.mahalle.length);
  S.users = new Map(sims.map((u) => [u.id, u]));
  S.users.set('me', meUser());
  if (S.settings.sim) {
    S.offers = generateSim(S.places, sims);
    for (const h of simHelpNear(S.center[0], S.center[1], sims, Date.now(), 5)) S.help.set(h.id, h);
    if (S.pos) for (const h of simHelpNear(S.pos.lat, S.pos.lon, sims, Date.now(), 4)) if (!S.help.has(h.id)) S.help.set(h.id, h);
    // birkaç dükkan için "kapandı" bildirimi (demo onay kuyruğu)
    for (const p of S.places) {
      if (hash(p.id) % 211 === 0) S.placeReports.set(p.id, [{ u: 's3', t: Date.now() - 86400000 * 3, kind: 'kapandi', sim: true }, { u: 's9', t: Date.now() - 86400000, kind: 'kapandi', sim: true }]);
    }
  }
  for (const ev of S.events) apply(ev);
  recompute();
}

export function addNearbyHelp(lat, lon, notify = true) {
  if (!S.settings.sim) return;
  const sims = [...S.users.values()].filter((u) => u.sim);
  const added = new Set();
  for (const h of simHelpNear(lat, lon, sims, Date.now(), 4)) {
    if (!S.help.has(h.id)) {
      S.help.set(h.id, h);
      added.add(h.id);
    }
  }
  // bu çağrılara daha önce verdiğim cevapların durumunu geri yükle
  if (added.size) {
    for (const ev of S.events) if (added.has(ev.helpId)) apply(ev);
    if (notify) {
      recompute();
      emit();
    }
  }
}

function apply(ev) {
  const place = ev.placeId ? S.placeById.get(ev.placeId) : null;
  switch (ev.type) {
    case 'confirm': {
      if (!place) return;
      ensureCustom(ev.productId, ev.name, place);
      getOffer(ev.placeId, ev.productId).confirms.push({ u: 'me', t: ev.t, photo: ev.photo || null, note: ev.note || '', price: ev.price || '' });
      break;
    }
    case 'rate': {
      if (!place) return;
      ensureCustom(ev.productId, ev.name, place);
      const o = getOffer(ev.placeId, ev.productId);
      o.ratings = o.ratings.filter((x) => x.u !== 'me');
      o.ratings.push({ u: 'me', r: ev.r, t: ev.t, text: ev.text || '', photo: ev.photo || null });
      break;
    }
    case 'reportOffer': {
      const o = S.offers.get(ev.key);
      if (o) o.reports.push({ u: 'me', t: ev.t });
      break;
    }
    case 'reportPlace': {
      const arr = S.placeReports.get(ev.placeId) || [];
      arr.push({ u: 'me', t: ev.t, kind: ev.kind });
      S.placeReports.set(ev.placeId, arr);
      break;
    }
    case 'help':
      S.help.set(ev.id, { id: ev.id, u: 'me', lat: ev.lat, lon: ev.lon, text: ev.text, productId: ev.productId || null, t: ev.t, answers: [], status: 'open' });
      break;
    case 'answer': {
      let h = S.help.get(ev.helpId);
      if (!h && ev.req) {
        h = { ...ev.req, answers: [], status: 'open' };
        S.help.set(h.id, h);
      }
      if (!h || h.answers.some((a) => a.id === ev.id)) return;
      h.answers.push({ id: ev.id, u: 'me', placeId: ev.placeId, note: ev.note || '', t: ev.t, status: 'pending' });
      break;
    }
    case 'simAnswer': {
      const h = S.help.get(ev.helpId);
      if (!h || h.answers.some((a) => a.id === ev.id)) return;
      h.answers.push({ id: ev.id, u: ev.u, placeId: ev.placeId, note: ev.note || '', t: ev.t, status: 'pending', sim: true });
      break;
    }
    case 'simResolve':
    case 'resolve': {
      const h = S.help.get(ev.helpId);
      const a = h?.answers.find((x) => x.id === ev.answerId);
      if (!a || a.status !== 'pending') return;
      a.status = ev.ok ? 'ok' : 'wrong';
      if (ev.ok) {
        h.status = 'solved';
        const pid = h.productId || customProductId(h.text);
        const pl = S.placeById.get(a.placeId);
        ensureCustom(pid, h.text, pl);
        if (pl) getOffer(a.placeId, pid).confirms.push({ u: h.u, t: ev.t, note: 'Yardım çağrısıyla bulundu', viaHelp: true });
      }
      break;
    }
    case 'addPlace': {
      const p = { ...ev.place, user: true };
      if (!S.placeById.has(p.id)) {
        S.places.push(p);
        S.placeById.set(p.id, p);
      }
      break;
    }
    case 'entrance':
      S.entrances.set(ev.placeId, { lat: ev.lat, lon: ev.lon, u: 'me', t: ev.t });
      break;
    case 'admin': {
      if (ev.kind === 'offer') {
        const o = S.offers.get(ev.id);
        if (o && ev.decision === 'close') o.closed = true;
      } else if (ev.decision === 'close') S.closedPlaces.add(ev.id);
      S.reviewed.set(ev.id, ev.t);
      break;
    }
    default:
  }
}

export async function addEvent(ev) {
  ev.t = ev.t || Date.now();
  const before = myProgress();
  S.events.push(ev);
  apply(ev);
  recompute();
  await db.set('events', S.events);
  const after = myProgress();
  emit();
  return {
    xp: after.xp - before.xp,
    levelUp: after.level.n > before.level.n ? after.level : null,
    newBadges: [...after.badges].filter((b) => !before.badges.has(b)),
    newTitles: after.titles.filter((t) => !before.titles.includes(t)),
  };
}

export async function savePhoto(dataUrl) {
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  S.photos.set(id, dataUrl);
  await db.set(`photo:${id}`, dataUrl);
  return id;
}

export async function saveMe(patch) {
  S.me = { ...S.me, ...patch };
  await db.set('me', S.me);
  S.users.set('me', meUser());
  recompute();
  emit();
}

export async function saveSettings(patch, rebuildNeeded = false) {
  S.settings = { ...S.settings, ...patch };
  await db.set('settings', S.settings);
  if (rebuildNeeded) rebuild();
  emit();
}

export async function resetAll() {
  await db.clearAll();
  S.events = [];
  S.photos.clear();
  S.me = { nick: '', avatar: null, title: '', createdAt: Date.now() };
  S.settings = { ...DEFAULT_SETTINGS, onboarded: false };
  rebuild();
  emit();
}

// ---- türetilmiş bilgiler -------------------------------------------------

export function offerInfo(o) {
  const count = o.confirms.length;
  const last = count ? o.confirms[o.confirms.length - 1].t : 0;
  let lastT = 0;
  for (const c of o.confirms) if (c.t > lastT) lastT = c.t;
  const reportsOpen = o.reports.filter((r) => r.t > lastT).length;
  return {
    count, last: lastT || last, level: pinLevel(count), fresh: freshness(lastT || last), score: S.scores?.offer.get(o.key),
    reportsOpen, ratings: o.ratings.length, photos: [...o.confirms, ...o.ratings].filter((x) => x.photo).map((x) => x.photo),
  };
}

export function storeScore(placeId) {
  return S.scores?.store.get(placeId);
}

export function offersAt(placeId) {
  const out = [];
  for (const o of S.offers.values()) if (o.placeId === placeId && !o.closed) out.push(o);
  return out;
}

export function adminQueue() {
  const q = [];
  for (const o of S.offers.values()) {
    if (o.closed) continue;
    const inf = offerInfo(o);
    const lastRep = Math.max(0, ...o.reports.map((r) => r.t));
    if (inf.reportsOpen >= 3 && !(S.reviewed.get(o.key) >= lastRep)) q.push({ kind: 'offer', id: o.key, o, inf });
  }
  for (const [pid, reps] of S.placeReports) {
    if (S.closedPlaces.has(pid)) continue;
    const lastRep = Math.max(0, ...reps.map((r) => r.t));
    if (reps.length >= 3 && !(S.reviewed.get(pid) >= lastRep)) q.push({ kind: 'place', id: pid, reps });
  }
  return q;
}

function recompute() {
  S.scores = computeScores(S.offers, (key) => S.offers.get(key).placeId);
  const stats = new Map();
  const st = (u) => stats.get(u) || stats.set(u, emptyStats()).get(u);
  const placeCount = new Map(); // placeId -> Map(u->count)
  const bump = (pid, u, n = 1) => {
    const m = placeCount.get(pid) || placeCount.set(pid, new Map()).get(pid);
    m.set(u, (m.get(u) || 0) + n);
  };
  for (const o of S.offers.values()) {
    const place = S.placeById.get(o.placeId);
    let first = null;
    for (const c of o.confirms) if (!first || c.t < first.t) first = c;
    for (const c of o.confirms) {
      const s = st(c.u);
      s.confirms++;
      if (c.photo) s.photos++;
      if (c === first) s.newPins++;
      if (place && HW.has(place.cat)) s.hw++;
      noteActivity(s, place, c.t);
      bump(o.placeId, c.u);
    }
    for (const r of o.ratings) {
      const s = st(r.u);
      s.rates++;
      if (r.photo) s.photos++;
      if ((r.text || '').length >= 15) s.longText = (s.longText || 0) + 1;
      if (SOUPS.has(o.productId)) s.soups.add(o.productId);
      noteActivity(s, place, r.t);
      bump(o.placeId, r.u);
    }
    for (const r of o.reports) st(r.u).reports++;
  }
  for (const reps of S.placeReports.values()) for (const r of reps) st(r.u).reports++;
  for (const h of S.help.values()) {
    st(h.u).helpsAsked++;
    for (const a of h.answers) {
      const s = st(a.u);
      s.answers++;
      if (a.status === 'ok') {
        s.accepted++;
        const pl = S.placeById.get(a.placeId);
        for (let k = 0; k < 3; k++) noteActivity(s, pl, a.t);
        if (pl) bump(pl.id, a.u, 3);
      }
    }
  }
  for (const p of S.places) if (p.user) st('me').addedPlaces++;
  const myEntr = [...S.entrances.values()].filter((e) => e.u === 'me').length;
  for (const [u, s] of stats) {
    const user = S.users.get(u);
    s.xp = (user?.baseXp || 0) + s.confirms * XP.confirm + s.photos * XP.photo + s.newPins * XP.newPin + s.rates * XP.rate +
      (s.longText || 0) * XP.longText + s.reports * XP.report + s.helpsAsked * XP.help + s.answers * XP.answer +
      s.accepted * XP.answerAccepted + s.addedPlaces * XP.addPlace + (u === 'me' ? myEntr * XP.entrance : 0);
  }
  for (const [u, s] of stats) s.helped = s.accepted + (S.users.get(u)?.baseHelped || 0);
  if (!stats.has('me')) st('me').xp = S.me?.bonusXp || 0;
  for (const u of S.users.keys()) if (!stats.has(u)) {
    st(u).xp = S.users.get(u).baseXp || 0;
    st(u).helped = S.users.get(u).baseHelped || 0;
  }
  S.stats = stats;

  // mekân müdavimi: o mekâna en çok katkı yapan (en az 5)
  S.placeTop = new Map();
  for (const [pid, m] of placeCount) {
    let best = null;
    for (const [u, c] of m) if (c >= 5 && (!best || c > best.c)) best = { u, c };
    if (best) S.placeTop.set(pid, best);
  }
  // mahalle ve semt liderleri
  const titles = new Map();
  const addT = (u, t) => (titles.get(u) || titles.set(u, []).get(u)).push(t);
  for (const [pid, b] of S.placeTop) {
    const pl = S.placeById.get(pid);
    if (pl) addT(b.u, { kind: 'place', id: pid, text: TITLE_RULES.place(pl.name || 'İsimsiz dükkan') });
  }
  const mahBoard = board('mah');
  for (const [m, rows] of mahBoard) if (rows[0] && rows[0].score >= 25) addT(rows[0].u, { kind: 'mah', id: m, text: TITLE_RULES.mah(mahName(m)) });
  const distBoard = board('district');
  for (const [d, rows] of distBoard) if (rows[0] && rows[0].score >= 60) addT(rows[0].u, { kind: 'district', id: d, text: TITLE_RULES.district(S.districts[d]) });
  S.titles = titles;
  S.mahBoard = mahBoard;
  S.distBoard = distBoard;
}

function board(kind) {
  const out = new Map();
  for (const [u, s] of S.stats) {
    for (const [m, c] of s.perMah) {
      const key = kind === 'mah' ? m : S.mahalle[m]?.[3] ?? -1;
      if (key < 0) continue;
      const rows = out.get(key) || out.set(key, new Map()).get(key);
      rows.set(u, (rows.get(u) || 0) + c * 5);
    }
  }
  const res = new Map();
  for (const [k, rows] of out) res.set(k, [...rows].map(([u, score]) => ({ u, score })).sort((a, b) => b.score - a.score));
  return res;
}

export function progressOf(u) {
  const s = S.stats.get(u) || emptyStats();
  const level = levelOf(s.xp);
  const trusted = isTrusted(S.scores?.user.get(u));
  const badges = badgesFrom(s, trusted);
  const titles = (S.titles.get(u) || []).map((t) => t.text);
  return { stats: s, xp: s.xp, level, badges, titles, trusted };
}
export const myProgress = () => progressOf('me');

export function nearestMah(lat, lon) {
  let best = -1;
  let bd = Infinity;
  S.mahalle.forEach((m, i) => {
    const d = distance(lat, lon, m[1], m[2]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return bd < 3000 ? best : -1;
}

export function newId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;
}

export { CATEGORIES, rng, hash };

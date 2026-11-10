import { App } from '../app.js';
import { S, addEvent, savePhoto, productOf, customProductId, myProgress, saveSettings, newId, nearestMah } from '../lib/state.js';
import { PRODUCTS, CATEGORIES, catInfo, PRODUCT_BY_ID } from '../data/catalog.js';
import { BADGE_BY_ID, ADD_PLACE_LEVEL, LEVELS } from '../lib/game.js';
import { distance } from '../lib/geo.js';
import { esc, norm, matchScore, fmtDist, fmtNum } from '../lib/text.js';
import { pickPhoto } from '../lib/photo.js';
import { $, $$, ic, openPage, closeTopPage, toast, modal, confirmBox, goBack } from './dom.js';
import { pickLocation, refreshPlaces } from './map.js';
import { placeLabel } from './views.js';

// ---- kutlama (tek tek, üst üste binmeden) ----
const cq = [];
let showing = false;
function nextCelebration() {
  const inner = cq.shift();
  if (!inner) {
    showing = false;
    return;
  }
  showing = true;
  modal(`${inner}<button class="btn primary block" data-close>Süper</button>`, { onClose: () => setTimeout(nextCelebration, 150) });
}
export function celebrate(res) {
  if (!res) return;
  if (res.xp > 0) toast(`+${res.xp} XP`, 'xp');
  if (res.levelUp) cq.push(`<div class="big">🎉</div><h3>Seviye ${res.levelUp.n}: ${esc(res.levelUp.name)}</h3><p>${res.levelUp.unlock ? esc(res.levelUp.unlock) : 'Mahallede adın duyuluyor.'}</p>`);
  for (const b of res.newBadges) {
    const bd = BADGE_BY_ID[b];
    if (bd) cq.push(`<div class="big">${bd.icon}</div><h3>Yeni rozet: ${esc(bd.name)}</h3><p>${esc(bd.desc)}</p>`);
  }
  for (const t of res.newTitles) cq.push(`<div class="big">👑</div><h3>Yeni unvan</h3><p><b>${esc(t)}</b><br>Profilinden lakap olarak seçebilirsin.</p>`);
  if (!showing && cq.length) setTimeout(nextCelebration, 350);
}

// ---- konum kontrolü ----
export function nearEnough(place) {
  if (!S.settings.geofence) return true;
  if (!S.pos) {
    toast('Konumun alınamadı. Konum iznini aç ya da Profil → Demo araçlarından kontrolü kapat.');
    return false;
  }
  const d = distance(S.pos.lat, S.pos.lon, place.lat, place.lon);
  if (d <= S.settings.geofenceM + Math.min(80, S.pos.acc || 0)) return true;
  const m = modal(`<div class="big">📍</div><h3>Dükkanın yakınında olmalısın</h3>
    <p>Sahte bilgiyi önlemek için ekleme yalnızca dükkanın ${S.settings.geofenceM} m yakınında yapılabilir. Şu an <b>${fmtDist(d)}</b> uzaktasın.</p>
    <button class="btn primary block" data-close>Tamam</button>
    <button class="btn block" id="gfOff" style="margin-top:8px">Demo: kontrolü kapat</button>`);
  $('#gfOff', m.el).onclick = async () => {
    await saveSettings({ geofence: false });
    m.close();
    toast('Konum kontrolü kapatıldı (demo)');
  };
  return false;
}

// ---- ürün seçici ----
function productPicker(container, place, initial) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `<label>Ürün</label><input id="pp" placeholder="Ne gördün? ör. 12'lik cıvata, beyran" value="${esc(initial ? productOf(initial).name : '')}"><div id="ppList"></div>`;
  container.prepend(wrap);
  const inp = $('#pp', wrap);
  const list = $('#ppList', wrap);
  let chosen = initial || null;
  const render = () => {
    const qn = norm(inp.value);
    chosen = null;
    if (!qn) return (list.innerHTML = '');
    const scored = [...PRODUCTS, ...S.customProducts.values()].map((p) => ({ p, s: Math.max(...[p.name, ...(p.syn || [])].map((t) => matchScore(qn, norm(t)))) + (p.cats.includes(place.cat) ? 0.05 : 0) }))
      .filter((x) => x.s >= 0.6).sort((a, b) => b.s - a.s).slice(0, 5);
    const exact = scored.find((x) => norm(x.p.name) === qn);
    if (exact) chosen = exact.p.id;
    list.innerHTML = `<div class="ac-list">${scored.map((x) => `<button type="button" data-p="${x.p.id}">${esc(x.p.name)}</button>`).join('')}
      ${exact ? '' : `<button type="button" data-new>${ic('plus')} “${esc(inp.value.trim())}” yeni ürün olarak ekle</button>`}</div>`;
    $$('[data-p]', list).forEach((b) => (b.onclick = () => {
      chosen = b.dataset.p;
      inp.value = productOf(chosen).name;
      list.innerHTML = '';
    }));
    const nb = $('[data-new]', list);
    if (nb) nb.onclick = () => {
      chosen = customProductId(inp.value.trim());
      list.innerHTML = '';
    };
  };
  inp.addEventListener('input', render);
  return {
    get: () => {
      if (chosen) return { id: chosen, name: chosen.startsWith('c_') ? inp.value.trim() : productOf(chosen).name };
      const v = inp.value.trim();
      if (!v) return null;
      const hit = PRODUCTS.find((p) => norm(p.name) === norm(v));
      return hit ? { id: hit.id, name: hit.name } : { id: customProductId(v), name: v };
    },
  };
}

function photoField(el) {
  let data = null;
  const btn = $('[data-photo]', el);
  btn.onclick = async () => {
    const d = await pickPhoto();
    if (!d) return;
    data = d;
    btn.innerHTML = `<img src="${d}" alt=""><span>Değiştirmek için dokun</span>`;
  };
  return () => data;
}

const PHOTO_HTML = (txt) => `<div class="field"><label>Fotoğraf <span class="muted" style="font-weight:400">(+5 XP)</span></label>
  <button type="button" class="photo-drop" data-photo>${ic('camera')}<b>${txt}</b><span class="muted" style="font-size:12.5px">Fotoğraflı bilgiye herkes daha çok güvenir</span></button></div>`;

// ---- Burada var ----
export function openConfirm(placeId, productId) {
  const place = S.placeById.get(placeId);
  if (!place || !nearEnough(place)) return;
  const pg = openPage('Burada var', `<div class="muted" style="margin-bottom:12px">${catInfo(place.cat).icon} ${esc(placeLabel(place))}</div>
    <div id="pf"></div>
    <div class="field"><label>Not / çeşit <span class="muted" style="font-weight:400">(isteğe bağlı)</span></label><input id="note" placeholder="ör. 12'lik ve 14'lük var, bronz da var"></div>
    <div class="field"><label>Fiyat <span class="muted" style="font-weight:400">(isteğe bağlı)</span></label><input id="price" inputmode="decimal" placeholder="ör. 45 TL"></div>
    ${PHOTO_HTML('Ürünün fotoğrafını çek')}
    <div class="err" id="err" hidden></div>
    <button class="btn primary block" id="go">${ic('check')} Gördüm, burada var</button>
    <p class="muted" style="font-size:12.5px;margin-top:10px">“Burada var” sadece ürünün bulunduğunu söyler. Beğenini ayrıca <b>Puanla</b> ile verirsin.</p>`);
  const picker = productPicker($('#pf', pg), place, productId);
  const getPhoto = photoField(pg);
  $('#go', pg).onclick = async () => {
    const pr = picker.get();
    if (!pr) {
      $('#err', pg).hidden = false;
      $('#err', pg).textContent = 'Önce ürünü yaz.';
      return;
    }
    const ph = getPhoto();
    const photo = ph ? await savePhoto(ph) : null;
    const res = await addEvent({ type: 'confirm', placeId, productId: pr.id, name: pr.name, note: $('#note', pg).value.trim(), price: $('#price', pg).value.trim(), photo });
    goBack();
    celebrate(res);
    setTimeout(() => App.openOffer(`${placeId}|${pr.id}`), 250);
  };
}

// ---- Puanla ----
export function openRate(placeId, productId) {
  const place = S.placeById.get(placeId);
  if (!place || !nearEnough(place)) return;
  const existing = productId ? S.offers.get(`${placeId}|${productId}`)?.ratings.find((r) => r.u === 'me') : null;
  let val = existing?.r || 0;
  const pg = openPage('Puanla', `<div class="muted" style="margin-bottom:12px">${catInfo(place.cat).icon} ${esc(placeLabel(place))}</div>
    <div id="pf"></div>
    <div class="field"><label>Puanın</label><div class="rate-stars" id="rs">${[1, 2, 3, 4, 5].map(() => '<span>★<span class="f">★</span></span>').join('')}</div>
      <div class="rate-val" id="rv"></div><div class="hint" style="text-align:center">Yarım puan için yıldızın soluna dokun</div></div>
    <div class="field"><label>Yorum</label><textarea id="txt" rows="3" placeholder="Nasıldı? Porsiyon, tazelik, fiyat…">${esc(existing?.text || '')}</textarea></div>
    ${PHOTO_HTML('Fotoğraf ekle')}
    <div class="err" id="err" hidden></div>
    <button class="btn primary block" id="go">${ic('star')} Puanı kaydet</button>`);
  const picker = productPicker($('#pf', pg), place, productId);
  const getPhoto = photoField(pg);
  const rs = $('#rs', pg);
  const paint = () => {
    $$('#rs > span', pg).forEach((s, i) => {
      const f = Math.max(0, Math.min(1, val - i));
      s.querySelector('.f').style.width = `${f * 100}%`;
    });
    $('#rv', pg).textContent = val ? `${fmtNum(val)} / 5` : 'Dokunarak puan ver';
  };
  const setFrom = (x) => {
    const r = rs.getBoundingClientRect();
    const v = Math.ceil(((x - r.left) / r.width) * 10) / 2;
    val = Math.max(0.5, Math.min(5, v));
    paint();
  };
  rs.addEventListener('pointerdown', (e) => {
    setFrom(e.clientX);
    rs.setPointerCapture(e.pointerId);
  });
  rs.addEventListener('pointermove', (e) => e.buttons && setFrom(e.clientX));
  paint();
  $('#go', pg).onclick = async () => {
    const pr = picker.get();
    const err = $('#err', pg);
    err.hidden = false;
    if (!pr) return (err.textContent = 'Önce ürünü yaz.');
    if (!val) return (err.textContent = 'Yıldızlara dokunarak puan ver.');
    const ph = getPhoto();
    const photo = ph ? await savePhoto(ph) : null;
    const res = await addEvent({ type: 'rate', placeId, productId: pr.id, name: pr.name, r: val, text: $('#txt', pg).value.trim(), photo });
    goBack();
    celebrate(res);
    setTimeout(() => App.openOffer(`${placeId}|${pr.id}`), 250);
  };
}

// ---- Bildirimler ----
export async function reportOffer(key) {
  const o = S.offers.get(key);
  if (!o) return;
  if (o.reports.some((r) => r.u === 'me' && r.t > Date.now() - 86400000)) return toast('Bunu zaten bildirdin');
  if (!(await confirmBox(`${productOf(o.productId).name} artık burada yok mu? 3 kişi bildirince yönetici onayına düşer ve pin kapanır.`, 'Evet, yok'))) return;
  const res = await addEvent({ type: 'reportOffer', key });
  celebrate(res);
  App.openOffer(key);
}

export function reportPlace(pid) {
  const m = modal(`<h3>Ne oldu?</h3><p>3 kişi bildirince yönetici onayına düşer.</p>
    ${[['kapandi', 'Dükkan kapandı'], ['tasindi', 'Başka yere taşındı'], ['yok', 'Burada böyle bir dükkan yok']].map(([k, t]) => `<button class="btn block" data-k="${k}" style="margin-top:8px">${t}</button>`).join('')}
    <button class="btn ghost block" data-close style="margin-top:8px">Vazgeç</button>`);
  $$('[data-k]', m.el).forEach((b) => (b.onclick = async () => {
    m.close();
    const res = await addEvent({ type: 'reportPlace', placeId: pid, kind: b.dataset.k });
    celebrate(res);
    toast('Bildirimin alındı, teşekkürler');
    App.openPlace(pid);
  }));
}

export async function markEntrance(pid) {
  const p = S.placeById.get(pid);
  App.map.flyTo({ center: [p.lon, p.lat], zoom: 19 });
  const loc = await pickLocation('Haritayı kaydırıp 📍 işaretini dükkanın giriş kapısına getir', 'Giriş burası');
  if (!loc) return App.openPlace(pid);
  if (distance(loc.lat, loc.lon, p.lat, p.lon) > 120) {
    toast('Giriş noktası dükkana çok uzak');
    return App.openPlace(pid);
  }
  const res = await addEvent({ type: 'entrance', placeId: pid, lat: loc.lat, lon: loc.lon });
  celebrate(res);
  App.openPlace(pid);
}

// ---- Dükkan ekle ----
export async function addPlace() {
  const lv = myProgress().level;
  if (lv.n < ADD_PLACE_LEVEL) {
    const need = LEVELS.find((l) => l.n === ADD_PLACE_LEVEL);
    modal(`<div class="big">🔒</div><h3>Seviye ${ADD_PLACE_LEVEL} gerekiyor</h3><p>Yeni dükkan açmak için <b>${need.name}</b> olmalısın. Şu an Seviye ${lv.n} (${myProgress().xp} / ${need.xp} XP).<br>Katkı yaptıkça açılır.</p><button class="btn primary block" data-close>Tamam</button>`);
    return;
  }
  const loc = await pickLocation('Haritayı kaydırıp 📍 işaretini yeni dükkanın üstüne getir', 'Konum bu');
  if (!loc) return;
  const opts = Object.entries(CATEGORIES).sort((a, b) => a[1].name.localeCompare(b[1].name, 'tr')).map(([k, c]) => `<option value="${k}">${c.icon} ${esc(c.name)}</option>`).join('');
  const pg = openPage('Yeni dükkan', `<div class="field"><label>Dükkanın adı</label><input id="nm" placeholder="ör. Yıldız Hırdavat"></div>
    <div class="field"><label>Türü</label><select id="cat">${opts}</select></div>
    <div class="err" id="err" hidden></div><button class="btn primary block" id="go">${ic('plus')} Dükkanı ekle (+20 XP)</button>
    <p class="muted" style="font-size:12.5px">Yeni dükkan, başka kullanıcılar teyit edene kadar “Az teyitli” görünür.</p>`);
  $('#go', pg).onclick = async () => {
    const name = $('#nm', pg).value.trim();
    if (name.length < 2) {
      $('#err', pg).hidden = false;
      $('#err', pg).textContent = 'Dükkanın adını yaz.';
      return;
    }
    const place = { id: newId('u'), name, cat: $('#cat', pg).value, lat: +loc.lat.toFixed(6), lon: +loc.lon.toFixed(6), mah: nearestMah(loc.lat, loc.lon), addr: '', hours: '', src: 4 };
    const res = await addEvent({ type: 'addPlace', place });
    goBack();
    refreshPlaces();
    celebrate(res);
    setTimeout(() => App.openPlace(place.id), 300);
  };
}

export { PRODUCT_BY_ID };

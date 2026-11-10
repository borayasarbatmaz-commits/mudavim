import { App } from '../app.js';
import { S, offerInfo, offersAt, storeScore, productOf, mahName, districtOfMah, userOf } from '../lib/state.js';
import { catInfo, PRODUCTS_BY_CAT, PRODUCT_BY_ID, inSeason } from '../data/catalog.js';
import { distance } from '../lib/geo.js';
import { esc, fmtDist, fmtNum, timeAgo, isOpenNow } from '../lib/text.js';
import { $, $$, ic, avatar, userLine, stars } from './dom.js';
import { showSheet, setSheet } from './sheet.js';
import { setResultMarkers, highlightPlace, fitTo, flyTo } from './map.js';

export const placeLabel = (p) => p?.name || `İsimsiz ${catInfo(p?.cat).name.toLocaleLowerCase('tr-TR')}`;
export const distTo = (p) => (S.pos ? distance(S.pos.lat, S.pos.lon, p.lat, p.lon) : null);

function openPill(p) {
  const o = isOpenNow(p.hours);
  if (o === true) return '<span class="pill open">Şu an açık</span>';
  if (o === false) return '<span class="pill closed">Şu an kapalı</span>';
  return '';
}
function freshPill(inf) {
  if (!inf.last) return '';
  return `<span class="pill ${inf.fresh.cls}">${ic('clock')} ${timeAgo(inf.last)} görüldü</span>`;
}
export function levelPill(inf) {
  return `<span class="pill ${inf.level.cls}">${inf.level.lv ? ic('badge-check') : ''}${inf.level.name}${inf.count ? ` · ${inf.count}` : ''}</span>`;
}

// ---------------- Sonuç listesi ----------------
export function renderResults(q, res) {
  App.lastResults = { q, res };
  const offers = res.results.filter((r) => r.kind === 'offer');
  const infers = res.results.filter((r) => r.kind === 'infer');
  const places = res.results.filter((r) => r.kind === 'place');
  const prodNames = res.products.map((p) => p.name);
  const title = prodNames.length ? prodNames.join(', ') : res.cats.length ? res.cats.map((c) => catInfo(c).name).join(', ') : q;
  let h = `<div class="res-head"><h2>${esc(title)}</h2><small>${res.results.length} yer</small></div>`;
  h += `<div class="seg" id="sortSeg">
    ${[['onerilen', 'Önerilen'], ['yakin', 'En yakın'], ['puan', 'En iyi puan']].map(([k, n]) => `<button data-sort="${k}" class="${App.sort === k ? 'on' : ''}">${n}</button>`).join('')}
    <button data-open class="${App.openNow ? 'on' : ''}">Şu an açık</button></div>`;
  if (!res.results.length) {
    h += `<div class="empty"><div class="big">🧭</div>Bu civarda “${esc(q)}” için bilgi yok.<br>Mahallenin müdavimlerine soralım mı?
      <div style="margin-top:14px"><button class="btn primary" data-askhelp>${ic('hand-helping')} Yardım iste</button></div></div>`;
  }
  if (offers.length) {
    h += `<div class="sec-title">Kullanıcıların gördüğü yerler</div>`;
    h += offers.map(rowOffer).join('');
  }
  if (infers.length) {
    h += `<div class="sec-title">Muhtemelen bulursun</div>`;
    if (!offers.length) h += `<div class="banner-demo" style="background:#fff7ed;color:#9a3412">Burada henüz kimse “${esc(prodNames[0] || q)}” teyit etmedi. Bu dükkanlar türlerine göre tahmin. Gidip bulursan <b>Burada var</b> de, ilk sen işaretle: <b>+10 XP keşif bonusu</b>.</div>`;
    h += infers.map(rowInfer).join('');
  }
  if (places.length) {
    h += `<div class="sec-title">Dükkanlar</div>`;
    h += places.map(rowPlace).join('');
  }
  if (res.results.length) h += `<div style="margin-top:16px"><button class="btn ghost block" data-askhelp>${ic('hand-helping')} Bulamadın mı? Müdavimlere sor</button></div>`;
  const body = showSheet(h, 'half');
  $$('[data-sort]', body).forEach((b) => (b.onclick = () => {
    App.sort = b.dataset.sort;
    App.runSearch(q, { keepView: true });
  }));
  $('[data-open]', body).onclick = () => {
    App.openNow = !App.openNow;
    App.runSearch(q, { keepView: true });
  };
  $$('[data-askhelp]', body).forEach((b) => (b.onclick = () => App.askHelp(q)));
  $$('[data-r]', body).forEach((el) => (el.onclick = () => onResultClick(res.results[+el.dataset.r])));
  setResultMarkers(res.results, onResultClick);
  return body;
}

function onResultClick(r) {
  if (r.kind === 'offer') App.openOffer(r.offer.key);
  else App.openPlace(r.place.id, { product: r.product?.id });
}

let rowIdx = 0;
function idxOf(r) {
  return App.lastResults.res.results.indexOf(r);
}
function rowOffer(r) {
  const c = catInfo(r.place.cat);
  const demo = r.offer.sim && r.offer.confirms.every((x) => x.sim) ? '<span class="pill demo">demo</span>' : '';
  return `<button class="row ${r.inf.fresh.cls === 'stale' ? 'dim' : ''}" data-r="${idxOf(r)}">
    <span class="ico">${c.icon}</span>
    <span class="main"><div class="t1">${esc(placeLabel(r.place))}</div>
      <div class="t2">${esc(r.product.name)} · ${esc(mahName(r.place.mah) || c.name)} · ${fmtDist(r.d)}</div>
      <div class="t3">${levelPill(r.inf)}${freshPill(r.inf)}${openPill(r.place)}${demo}</div>
      ${r.note ? `<div class="t2" style="color:var(--ink)">“${esc(r.note)}”</div>` : ''}</span>
    <span class="side">${r.score ? `<div class="score">${fmtNum(r.score)}★</div><div>${r.inf.ratings} puan</div>` : ''}</span></button>`;
}
function rowInfer(r) {
  const c = catInfo(r.place.cat);
  return `<button class="row" data-r="${idxOf(r)}">
    <span class="ico">${c.icon}</span>
    <span class="main"><div class="t1">${esc(placeLabel(r.place))}</div>
      <div class="t2">${esc(c.name)} · ${esc(mahName(r.place.mah))} · ${fmtDist(r.d)}</div>
      <div class="t3"><span class="pill lv0">Tahmini</span>${r.season ? '' : '<span class="pill season">Mevsimi değil</span>'}${openPill(r.place)}</div></span>
    <span class="side">${r.storeScore ? `<div class="score" style="font-weight:600">${fmtNum(r.storeScore)}★</div><div>dükkan</div>` : ''}</span></button>`;
}
function rowPlace(r) {
  const c = catInfo(r.place.cat);
  return `<button class="row" data-r="${idxOf(r)}">
    <span class="ico">${c.icon}</span>
    <span class="main"><div class="t1">${esc(placeLabel(r.place))}</div>
      <div class="t2">${esc(c.name)} · ${esc(mahName(r.place.mah))} · ${fmtDist(r.d)}</div>
      <div class="t3">${openPill(r.place)}</div></span>
    <span class="side">${r.score ? `<div class="score">${fmtNum(r.score)}★</div>` : ''}</span></button>`;
}

// ---------------- Dükkan ----------------
function placeTopUsers(pid) {
  const m = new Map();
  for (const o of offersAt(pid)) {
    for (const c of o.confirms) m.set(c.u, (m.get(c.u) || 0) + 1);
    for (const r of o.ratings) m.set(r.u, (m.get(r.u) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export function googleUrl(p) {
  const q = p.name ? `${p.name} ${mahName(p.mah)} ${districtOfMah(p.mah)}`.trim() : `${p.lat},${p.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function renderPlace(pid, { product } = {}) {
  const p = S.placeById.get(pid);
  if (!p) return;
  const c = catInfo(p.cat);
  const d = distTo(p);
  const ss = storeScore(pid);
  const offers = offersAt(pid).map((o) => ({ o, inf: offerInfo(o) })).sort((a, b) => b.inf.count - a.inf.count);
  const have = new Set(offers.map((x) => x.o.productId));
  const month = new Date().getMonth() + 1;
  const guesses = (PRODUCTS_BY_CAT[p.cat] || []).filter((id) => !have.has(id)).map((id) => PRODUCT_BY_ID[id]);
  if (product && !have.has(product) && !guesses.some((g) => g.id === product)) guesses.unshift(productOf(product));
  const top = placeTopUsers(pid);
  const closedReq = (S.placeReports.get(pid) || []).length;
  const src = [p.src & 1 ? 'OpenStreetMap' : '', p.src & 2 ? 'Overture/Foursquare' : '', p.user ? 'Müdavim kullanıcısı' : ''].filter(Boolean).join(' + ');
  const focus = product ? productOf(product) : null;

  let h = `<div class="ph"><span class="ico">${c.icon}</span><div style="flex:1;min-width:0">
    <h2>${esc(placeLabel(p))}</h2><div class="sub">${esc(c.name)}${p.mah >= 0 ? ` · ${esc(mahName(p.mah))}` : ''}${d != null ? ` · ${fmtDist(d)}` : ''}</div>
    <div class="meta">${ss ? `<span class="pill lv3">${fmtNum(ss.score)}★ dükkan puanı · ${ss.n}</span>` : ''}${openPill(p)}${p.addr ? `<span class="pill stale">${esc(p.addr)}</span>` : ''}</div></div></div>`;
  if (focus && !have.has(focus.id)) {
    h += `<div class="banner-demo" style="background:#fff7ed;color:#9a3412;margin-top:12px">Burada <b>${esc(focus.name)}</b> olduğu tahmin ediliyor (dükkan türünden). ${inSeason(focus, month) ? '' : 'Ama şu an mevsimi değil. '}Gidip bakarsan teyit et.</div>`;
  }
  h += `<div class="actions">
    <button class="act primary" data-nav>${ic('navigation')}Yol tarifi</button>
    <button class="act" data-ar>${ic('scan-eye')}AR'da gör</button>
    <button class="act teal" data-confirm>${ic('check')}Burada var</button>
    <button class="act" data-rate>${ic('star')}Puanla</button></div>`;
  h += `<div class="sec-title">Burada bulunanlar ${offers.length ? `(${offers.length})` : ''}</div>`;
  if (!offers.length) h += `<div class="muted" style="padding:6px 0 4px">Henüz kimse bir ürün eklemedi. İlk ekleyen sen ol.</div>`;
  h += offers.map(({ o, inf }) => {
    const pr = productOf(o.productId);
    const sc = inf.score?.score;
    return `<button class="row ${inf.fresh.cls === 'stale' ? 'dim' : ''}" data-offer="${esc(o.key)}">
      <span class="main"><div class="t1">${esc(pr.name)}</div><div class="t3">${levelPill(inf)}${freshPill(inf)}${inf.reportsOpen ? `<span class="pill closed">${inf.reportsOpen} “yok” bildirimi</span>` : ''}</div></span>
      <span class="side">${sc ? `<div class="score">${fmtNum(sc)}★</div><div>${inf.ratings} puan</div>` : ''}</span></button>`;
  }).join('');
  if (guesses.length) {
    h += `<div class="sec-title">Muhtemelen vardır (tahmin)</div><div class="legend">${guesses.slice(0, 14).map((g) =>
      `<button class="chip" style="box-shadow:none;border:1px dashed #a8a29e" data-guess="${g.id}">${esc(g.name)}${inSeason(g, month) ? '' : ' · mevsimi değil'}</button>`).join('')}</div>
      <div class="hint muted" style="font-size:12.5px;margin-top:6px">Gördüysen dokun, teyit et.</div>`;
  }
  if (top.length) {
    h += `<div class="sec-title">Bu mekânın müdavimleri</div>`;
    h += top.map(([u, n], i) => `<div class="comment"><div class="who">${userLine(u)}<span style="margin-left:auto" class="muted">${n} katkı${i === 0 && n >= 5 ? ' · 🫖 Müdavim' : ''}</span></div></div>`).join('');
  }
  h += `<div class="foot-links">
    <a href="${googleUrl(p)}" target="_blank" rel="noopener">${ic('external-link')} Google Haritalar'da aç</a>
    <button data-entrance>${ic('door-open')} ${S.entrances.has(pid) ? 'Giriş işaretli · değiştir' : 'Giriş kapısını işaretle (+5 XP)'}</button>
    <button data-preport>${ic('flag')} Kapandı / taşındı / burada değil${closedReq ? ` (${closedReq} bildirim)` : ''}</button>
    <span class="muted" style="font-size:12px">Kaynak: ${esc(src || '—')}</span></div>`;
  const body = showSheet(h, 'half');
  $('[data-nav]', body).onclick = () => App.startNav(p);
  $('[data-ar]', body).onclick = () => App.openAR(p);
  $('[data-confirm]', body).onclick = () => App.openConfirm(pid, product && !have.has(product) ? product : null);
  $('[data-rate]', body).onclick = () => App.openRate(pid, product || null);
  $$('[data-offer]', body).forEach((b) => (b.onclick = () => App.openOffer(b.dataset.offer)));
  $$('[data-guess]', body).forEach((b) => (b.onclick = () => App.openConfirm(pid, b.dataset.guess)));
  $('[data-entrance]', body).onclick = () => App.markEntrance(pid);
  $('[data-preport]', body).onclick = () => App.reportPlace(pid);
  highlightPlace(pid);
  App.selectedPlace = p;
  if (!App.lastResults) flyTo(p.lat, p.lon, 16.5);
  else fitTo([[p.lat, p.lon]]);
}

// ---------------- Ürün @ dükkan ----------------
export function renderOffer(key) {
  const o = S.offers.get(key);
  if (!o) return;
  const p = S.placeById.get(o.placeId);
  const pr = productOf(o.productId);
  const inf = offerInfo(o);
  const sc = inf.score;
  const d = distTo(p);
  const myRating = o.ratings.find((r) => r.u === 'me');
  const comments = [...o.ratings].sort((a, b) => b.t - a.t);
  const confirms = [...o.confirms].sort((a, b) => b.t - a.t);
  const lastNote = confirms.find((c) => c.note)?.note;

  let h = `<button class="btn small ghost" data-back style="margin-bottom:10px">${ic('chevron-left')} ${esc(placeLabel(p))}</button>
    <div class="ph"><span class="ico">${catInfo(p.cat).icon}</span><div style="flex:1;min-width:0"><h2>${esc(pr.name)}</h2>
    <div class="sub">${esc(placeLabel(p))}${d != null ? ` · ${fmtDist(d)}` : ''}</div>
    <div class="meta">${levelPill(inf)}${freshPill(inf)}${openPill(p)}</div></div></div>`;
  if (o.closed) h += `<div class="banner-demo" style="background:#fef2f2;color:#991b1b">Bu pin, kullanıcı bildirimleri sonrası yönetici onayıyla kapatıldı.</div>`;
  h += sc
    ? `<div class="big-score"><span class="n">${fmtNum(sc.score)}</span><div>${stars(sc.score)}<div class="muted" style="font-size:13px">${inf.ratings} değerlendirme${myRating ? ` · senin puanın ${fmtNum(myRating.r)}` : ''}</div></div></div>`
    : `<div class="big-score"><div><b>Henüz puan yok</b><div class="muted" style="font-size:13px">${inf.count} kişi burada olduğunu teyit etti</div></div></div>`;
  if (lastNote) h += `<div class="card" style="padding:10px 12px"><span class="muted">Son not:</span> “${esc(lastNote)}”</div>`;
  if (inf.fresh.cls !== 'fresh' && inf.last) h += `<div class="banner-demo" style="background:#fffbeb;color:#92400e">${inf.fresh.label}: en son ${timeAgo(inf.last)} görüldü. Gidersen güncelle.</div>`;
  h += `<div class="actions">
    <button class="act teal" data-confirm>${ic('check')}Hâlâ var</button>
    <button class="act" data-rate>${ic('star')}${myRating ? 'Puanı değiştir' : 'Puanla'}</button>
    <button class="act primary" data-nav>${ic('navigation')}Yol tarifi</button>
    <button class="act" data-ar>${ic('scan-eye')}AR</button></div>`;
  if (inf.photos.length) h += `<div class="sec-title">Fotoğraflar</div><div class="photos">${inf.photos.map((id) => S.photos.get(id) ? `<img src="${S.photos.get(id)}" alt="">` : '').join('')}</div>`;
  if (comments.length) {
    h += `<div class="sec-title">Değerlendirmeler</div>`;
    h += comments.slice(0, 30).map((r) => `<div class="comment"><div class="who">${userLine(r.u)}<span style="margin-left:auto" class="muted">${timeAgo(r.t)}</span></div>
      <div class="txt">${stars(r.r)} <b>${fmtNum(r.r)}</b>${r.text ? `<br>${esc(r.text)}` : ''}</div>${r.photo && S.photos.get(r.photo) ? `<img src="${S.photos.get(r.photo)}">` : ''}</div>`).join('');
  }
  h += `<div class="sec-title">Teyit geçmişi (${inf.count})</div>`;
  h += confirms.slice(0, 8).map((c) => `<div class="comment"><div class="who">${userLine(c.u)}<span style="margin-left:auto" class="muted">${timeAgo(c.t)}</span></div>
    ${c.note ? `<div class="txt">“${esc(c.note)}”</div>` : ''}${c.photo && S.photos.get(c.photo) ? `<img src="${S.photos.get(c.photo)}">` : ''}</div>`).join('');
  if (inf.count > 8) h += `<div class="muted" style="padding:8px 0">+${inf.count - 8} teyit daha</div>`;
  h += `<div class="foot-links"><button data-report>${ic('flag')} Bu ürün artık burada yok${inf.reportsOpen ? ` (${inf.reportsOpen} bildirim)` : ''}</button></div>`;
  const body = showSheet(h, 'full');
  $('[data-back]', body).onclick = () => App.openPlace(p.id);
  $('[data-confirm]', body).onclick = () => App.openConfirm(p.id, o.productId);
  $('[data-rate]', body).onclick = () => App.openRate(p.id, o.productId);
  $('[data-nav]', body).onclick = () => App.startNav(p);
  $('[data-ar]', body).onclick = () => App.openAR(p);
  $('[data-report]', body).onclick = () => App.reportOffer(key);
  highlightPlace(p.id);
  App.selectedPlace = p;
}

export { setSheet, avatar, userOf };

import './styles.css';
import { App } from './app.js';
import { S, loadData, init, addNearbyHelp, onChange, myProgress, saveMe, saveSettings } from './lib/state.js';
import { search, matchProducts } from './lib/search.js';
import { PRODUCTS } from './data/catalog.js';
import { esc, norm, matchScore } from './lib/text.js';
import { $, $$, html, icons, ic, toast, avatar, openPage, closeAllPages, syncPages, pageCount, goBack, consumePop } from './ui/dom.js';
import { initMap, updateMe, flyTo, clearResultMarkers, setHelpMarkers, setExtraMarkers, fitTo, refreshPlaces } from './ui/map.js';
import { initSheet, setSheet, sheetState } from './ui/sheet.js';
import { renderResults, renderPlace, renderOffer } from './ui/views.js';
import { openConfirm, openRate, reportOffer, reportPlace, markEntrance, addPlace } from './ui/forms.js';
import { openHelpTab, openHelpDetail, askHelp, simTick, visibleHelp } from './ui/help.js';
import { openProfile } from './ui/profile.js';
import { openBoard } from './ui/board.js';
import { startNav, navOnPos, stopNav } from './ui/nav.js';
import { openAR, closeAR } from './ui/ar.js';
import { startCompass, onOrient } from './ui/sensors.js';

const QUICK = ['Beyran', 'Havai pizza', "12'lik cıvata", 'Klima gider borusu', 'Mavi A4', 'Fermuar', 'Erik', 'Gül buketi', 'Perde kornişi', 'Lahmacun'];

// ---- App fonksiyonları ----
App.runSearch = (q, { keepView = false } = {}) => {
  q = q.trim();
  if (!q) return;
  App.query = q;
  App.sheetView = 'results';
  $('#q').value = q;
  $('#qClear').hidden = false;
  $('#suggest').hidden = true;
  $$('.chip').forEach((c) => c.classList.toggle('on', norm(c.textContent) === norm(q)));
  const from = S.pos ? [S.pos.lat, S.pos.lon] : mapCenter();
  const res = search(q, from, { sort: App.sort, openNow: App.openNow });
  App.focusProduct = res.products[0]?.id || null;
  if (App.tab !== 'explore') setTab('explore', true);
  setHelpMarkers([], () => {});
  setExtraMarkers([]);
  renderResults(q, res);
  if (!keepView) {
    const pts = res.results.slice(0, 8).map((r) => [r.place.lat, r.place.lon]);
    if (S.pos) pts.push([S.pos.lat, S.pos.lon]);
    fitTo(pts);
  }
};
App.openPlace = (id, opts = {}) => {
  App.sheetView = 'place';
  if (opts.product) App.focusProduct = opts.product;
  if (App.tab !== 'explore' && App.tab !== 'help') setTab('explore', true);
  renderPlace(id, opts);
};
App.openOffer = (key) => {
  App.sheetView = 'offer';
  const o = S.offers.get(key);
  if (o) App.focusProduct = o.productId;
  renderOffer(key);
};
App.startNav = (p) => startNav(p, { productId: App.focusProduct });
App.openAR = openAR;
App.openConfirm = openConfirm;
App.openRate = openRate;
App.reportOffer = reportOffer;
App.reportPlace = reportPlace;
App.markEntrance = markEntrance;
App.addPlace = addPlace;
App.askHelp = (t) => askHelp(t);
App.setTab = (t) => setTab(t);
App.refreshTab = () => {
  updateHelpDot();
  if (App.tab === 'help' && App.sheetView === 'help' && sheetState() !== 'hidden' && !pageCount()) {
    if (App.helpDetailId) openHelpDetail(App.helpDetailId);
    else openHelpTab();
  }
};
App.updateMeBtn = updateMeBtn;

function mapCenter() {
  const c = App.map?.getCenter();
  return c ? [c.lat, c.lng] : S.center;
}

function setTab(t, silent = false) {
  App.tab = t;
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  closeAllPages();
  if (silent) return;
  if (t === 'explore') {
    setHelpMarkers([], () => {});
    setExtraMarkers([]);
    if (App.query) App.runSearch(App.query, { keepView: true });
    else setSheet('hidden');
  } else if (t === 'help') openHelpTab();
  else if (t === 'board') openBoard();
  else if (t === 'profile') openProfile();
}

function updateMeBtn() {
  html($('#meBtn'), avatar('me', 'md'));
}

function updateHelpDot() {
  const open = visibleHelp().filter((h) => h.u !== 'me' && h.status === 'open' && !h.answers.some((a) => a.u === 'me'));
  const mineNew = visibleHelp().some((h) => h.u === 'me' && h.answers.some((a) => a.status === 'pending'));
  $('#helpDot').hidden = !(open.length || mineNew);
}

// ---- arama kutusu ----
function initSearch() {
  const q = $('#q');
  const sug = $('#suggest');
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    q.blur();
    App.runSearch(q.value);
  });
  q.addEventListener('input', () => {
    $('#qClear').hidden = !q.value;
    const qn = norm(q.value);
    if (qn.length < 2) {
      sug.hidden = true;
      return;
    }
    const items = matchProducts(q.value).map((x) => x.p).slice(0, 5);
    if (!items.length) {
      const loose = PRODUCTS.map((p) => ({ p, s: matchScore(qn, norm(p.name)) })).filter((x) => x.s > 0.5).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.p);
      items.push(...loose);
    }
    if (!items.length) {
      sug.hidden = true;
      return;
    }
    sug.innerHTML = items.map((p) => `<button data-s="${esc(p.name)}">${ic('search')}<span>${esc(p.name)}</span><small>ürün</small></button>`).join('');
    icons(sug);
    sug.hidden = false;
    $$('[data-s]', sug).forEach((b) => (b.onclick = () => {
      q.blur();
      App.runSearch(b.dataset.s);
    }));
  });
  q.addEventListener('blur', () => setTimeout(() => (sug.hidden = true), 200));
  $('#qClear').onclick = () => {
    q.value = '';
    App.query = '';
    App.lastResults = null;
    $('#qClear').hidden = true;
    clearResultMarkers();
    $$('.chip').forEach((c) => c.classList.remove('on'));
    setSheet('hidden');
  };
  $('#quickChips').innerHTML = QUICK.map((t) => `<button class="chip">${esc(t)}</button>`).join('');
  $$('#quickChips .chip').forEach((c) => (c.onclick = () => App.runSearch(c.textContent)));
}

// ---- konum ----
function initGeo() {
  if (!('geolocation' in navigator)) return toast('Bu cihazda konum yok');
  let first = true;
  navigator.geolocation.watchPosition((p) => {
    S.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now(), heading: p.coords.heading };
    if (App.heading == null && p.coords.heading != null && !Number.isNaN(p.coords.heading)) App.heading = p.coords.heading;
    updateMe();
    if (first) {
      first = false;
      const [s, w, n, e] = S.meta.bbox;
      const inside = S.pos.lat >= s && S.pos.lat <= n && S.pos.lon >= w && S.pos.lon <= e;
      if (inside) flyTo(S.pos.lat, S.pos.lon, 15.5);
      else toast('Pilot bölge Darıca–Gebze. Şu an bölge dışındasın; harita bölgeyi gösteriyor.', '', 4500);
      addNearbyHelp(S.pos.lat, S.pos.lon);
      updateHelpDot();
    }
    navOnPos();
  }, (err) => {
    if (first) toast(err.code === 1 ? 'Konum izni verilmedi. Arama bölge merkezine göre yapılacak.' : 'Konum alınamadı', '', 4000);
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

// ---- karşılama ----
function onboarding() {
  if (S.settings.onboarded) return;
  const pg = openPage('Hoş geldin', `<div class="onb"><div class="e">🫖</div><h2>Müdavim</h2>
    <p>Dükkanı değil, <b>ürünü</b> ara. Beyran, 12'lik cıvata, mavi A4 kağıdı… Mahallende nerede olduğunu, oraya gidenler söylesin.</p></div>
    <div class="card"><b>1. Ara</b><div class="muted" style="font-size:13.5px;margin-top:4px">Sonuçlar haritada. Teyit sayısı arttıkça pin renk değiştirir:</div>
      <div class="legend" style="margin-top:8px"><span class="pill lv0">Tahmini</span><span class="pill lv1">Az teyitli · 1-4</span><span class="pill lv2">Teyitli · 5-50</span><span class="pill lv3">Güvenilir · 50+</span></div></div>
    <div class="card"><b>2. Git</b><div class="muted" style="font-size:13.5px;margin-top:4px">Yol tarifi uygulamanın içinde. Dükkanı göremezsen AR ile etrafına bak, dev pin üstünde.</div></div>
    <div class="card"><b>3. Paylaş, müdavim ol</b><div class="muted" style="font-size:13.5px;margin-top:4px">“Burada var” de, fotoğraf çek, puanla. Yardım çağrılarını çöz. XP, rozet ve unvan kazan: mekânın müdavimi, mahallenin kurdu, semtin piri.</div></div>
    <div class="field"><label>Sana ne diyelim?</label><input id="onbNick" maxlength="24" placeholder="İsim ya da mahlas"></div>
    <div class="banner-demo">Bu bir demo. Dükkanlar gerçek (OpenStreetMap + Foursquare/Overture), kullanıcı katkıları “demo” etiketiyle simüle. Senin katkıların sadece bu telefonda saklanır.</div>
    <button class="btn primary block" id="onbGo">Başla</button>`);
  $('#onbGo', pg).onclick = async () => {
    await saveMe({ nick: $('#onbNick', pg).value.trim() || 'Yeni müdavim' });
    await saveSettings({ onboarded: true });
    updateMeBtn();
    startCompass(true);
    goBack();
  };
}

// ---- açılış ----
async function boot() {
  try {
    await loadData('./data/places.json');
  } catch (e) {
    $('#bootMsg').innerHTML = `Dükkan verisi yüklenemedi.<br><small>${esc(e.message)}</small>`;
    return;
  }
  await init();
  initMap();
  initSheet();
  initSearch();
  icons();
  updateMeBtn();
  initGeo();
  startCompass(false);
  onOrient(() => {
    if (!App.navActive) updateMe();
  });
  $$('#tabbar button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $('#meBtn').onclick = () => setTab('profile');
  $('#fabLocate').onclick = () => {
    startCompass(true);
    if (S.pos) flyTo(S.pos.lat, S.pos.lon, 16.5);
    else toast('Konum bekleniyor…');
  };
  $('#fabHelp').onclick = () => askHelp(App.query || '');
  window.addEventListener('popstate', (e) => {
    if (consumePop()) return;
    const st = e.state || {};
    if (App.arOpen && !st.ar) closeAR(true);
    syncPages(st.page || 0);
    if (!pageCount() && (App.tab === 'board' || App.tab === 'profile')) {
      App.tab = 'explore';
      $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'explore'));
    }
  });
  onChange(() => {
    updateMeBtn();
    updateHelpDot();
  });
  setInterval(simTick, 4000);
  updateHelpDot();
  $('#boot').classList.add('out');
  setTimeout(() => $('#boot').remove(), 500);
  onboarding();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.__mudavim = { S, App }; // hata ayıklama
}

boot();

export { myProgress, refreshPlaces, openHelpDetail, stopNav };

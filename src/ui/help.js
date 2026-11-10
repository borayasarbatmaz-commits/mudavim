import { App } from '../app.js';
import { S, addEvent, userOf, newId, productOf } from '../lib/state.js';
import { search, matchProducts } from '../lib/search.js';
import { catInfo } from '../data/catalog.js';
import { distance } from '../lib/geo.js';
import { hash } from '../lib/sim.js';
import { esc, fmtDist, timeAgo, norm } from '../lib/text.js';
import { $, $$, ic, openPage, toast, userLine, avatar, goBack } from './dom.js';
import { showSheet } from './sheet.js';
import { setHelpMarkers, setExtraMarkers, fitTo, pickLocation, flyTo, clearResultMarkers } from './map.js';
import { celebrate } from './forms.js';
import { placeLabel } from './views.js';

const here = () => (S.pos ? [S.pos.lat, S.pos.lon] : S.center);

export function visibleHelp() {
  const [lat, lon] = here();
  return [...S.help.values()].filter((h) => h.u === 'me' || h.answers.some((a) => a.u === 'me') || distance(lat, lon, h.lat, h.lon) < 6000)
    .sort((a, b) => b.t - a.t);
}

export function openHelpTab() {
  App.helpDetailId = null;
  App.sheetView = 'help';
  clearResultMarkers();
  setExtraMarkers([]);
  const list = visibleHelp();
  setHelpMarkers(list, (h) => openHelpDetail(h.id));
  const [lat, lon] = here();
  const mine = list.filter((h) => h.u === 'me');
  const answered = list.filter((h) => h.u !== 'me' && h.answers.some((a) => a.u === 'me'));
  const open = list.filter((h) => h.u !== 'me' && h.status === 'open' && !h.answers.some((a) => a.u === 'me'));
  const row = (h) => {
    const u = userOf(h.u);
    const ans = h.answers.length;
    const myA = h.answers.find((a) => a.u === 'me');
    const st = h.status === 'solved' ? '<span class="pill lv3">Çözüldü</span>' : myA ? `<span class="pill ${myA.status === 'ok' ? 'lv3' : myA.status === 'wrong' ? 'closed' : 'lv1'}">${myA.status === 'ok' ? 'Cevabın doğru çıktı' : myA.status === 'wrong' ? 'Orada bulamamış' : 'Cevabın bekleniyor'}</span>` : ans ? `<span class="pill lv2">${ans} öneri</span>` : '<span class="pill lv1">Cevap bekliyor</span>';
    return `<button class="row" data-h="${esc(h.id)}"><span class="ico" style="background:#ede9fe">${h.status === 'solved' ? '✅' : '❓'}</span>
      <span class="main"><div class="t1">${esc(h.text)}</div><div class="t2">${h.u === 'me' ? 'Senin çağrın' : esc(u.nick)} · ${timeAgo(h.t)} · ${fmtDist(distance(lat, lon, h.lat, h.lon))}</div>
      <div class="t3">${st}${u.sim ? '<span class="pill demo">demo</span>' : ''}</div></span></button>`;
  };
  let h = `<div class="res-head"><h2>Yardım çağrıları</h2><small>${open.length} açık</small></div>
    <button class="btn primary block" id="ask">${ic('hand-helping')} Aradığımı bulamadım, yardım iste</button>
    <p class="muted" style="font-size:13px;line-height:1.45">Haritadaki <b style="color:#7c3aed">?</b> pinler, birinin aradığı şeyler. Nerede bulunacağını biliyorsan dükkanı göster; çağrıyı açan teyit edince <b>+50 XP</b> kazanırsın ve haritaya yeni bir pin eklenir.</p>`;
  if (mine.length) h += `<div class="sec-title">Senin çağrıların</div>${mine.map(row).join('')}`;
  if (open.length) h += `<div class="sec-title">Yakınında yardım bekleyenler</div>${open.map(row).join('')}`;
  if (answered.length) h += `<div class="sec-title">Cevap verdiklerin</div>${answered.map(row).join('')}`;
  if (!list.length) h += `<div class="empty"><div class="big">🤝</div>Yakında açık çağrı yok.</div>`;
  const body = showSheet(h, 'half');
  $('#ask', body).onclick = () => askHelp('');
  $$('[data-h]', body).forEach((b) => (b.onclick = () => openHelpDetail(b.dataset.h)));
  if (list.length) fitTo([[lat, lon], ...list.slice(0, 8).map((x) => [x.lat, x.lon])]);
}

export function openHelpDetail(id) {
  const h = S.help.get(id);
  if (!h) return;
  App.helpDetailId = id;
  App.sheetView = 'help';
  const [lat, lon] = here();
  const mine = h.u === 'me';
  const myA = h.answers.find((a) => a.u === 'me');
  let html = `<button class="btn small ghost" data-back style="margin-bottom:10px">${ic('chevron-left')} Çağrılar</button>
    <div class="ph"><span class="ico" style="background:#ede9fe">${h.status === 'solved' ? '✅' : '❓'}</span><div style="flex:1">
    <h2>${esc(h.text)}</h2><div class="sub">${mine ? 'Senin çağrın' : esc(userOf(h.u).nick)} · ${timeAgo(h.t)} · ${fmtDist(distance(lat, lon, h.lat, h.lon))}</div></div></div>`;
  if (h.answers.length) {
    html += `<div class="sec-title">Öneriler (${h.answers.length})</div>`;
    html += h.answers.map((a) => {
      const p = S.placeById.get(a.placeId);
      if (!p) return '';
      const st = a.status === 'ok' ? '<span class="pill lv3">Doğru çıktı ✓</span>' : a.status === 'wrong' ? '<span class="pill closed">Bulunamadı</span>' : '<span class="pill lv1">Teyit bekliyor</span>';
      return `<div class="card"><div class="comment" style="padding:0;border:0"><div class="who">${userLine(a.u)}<span class="muted" style="margin-left:auto">${timeAgo(a.t)}</span></div></div>
        <div style="margin:10px 0 6px"><b>${catInfo(p.cat).icon} ${esc(placeLabel(p))}</b> · ${fmtDist(distance(lat, lon, p.lat, p.lon))}</div>
        ${a.note ? `<div>“${esc(a.note)}”</div>` : ''}<div class="t3" style="margin:8px 0">${st}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn small" data-go="${esc(a.placeId)}">${ic('navigation')} Git</button>
          <button class="btn small" data-see="${esc(a.placeId)}">${ic('store')} Dükkan</button>
          ${mine && a.status === 'pending' ? `<button class="btn small primary" data-ok="${a.id}">${ic('check')} Buldum</button><button class="btn small" data-no="${a.id}">Yoktu</button>` : ''}
        </div></div>`;
    }).join('');
  } else if (mine) {
    html += `<div class="empty"><div class="big">📣</div>Çağrın bölgedeki müdavimlere iletildi.<br>Öneri gelince burada göreceksin.</div>`;
  }
  if (!mine && h.status === 'open' && !myA) {
    html += `<button class="btn primary block" id="know" style="margin-top:14px">${ic('map-pin')} Ben biliyorum, yerini göstereyim</button>
      <p class="muted" style="font-size:12.5px">Doğru çıkarsa +50 XP. Yanlış önerilerin güvenilirliğini düşürür.</p>`;
  }
  const body = showSheet(html, 'half');
  $('[data-back]', body).onclick = () => openHelpTab();
  $$('[data-go]', body).forEach((b) => (b.onclick = () => App.startNav(S.placeById.get(b.dataset.go))));
  $$('[data-see]', body).forEach((b) => (b.onclick = () => App.openPlace(b.dataset.see)));
  $$('[data-ok]', body).forEach((b) => (b.onclick = async () => {
    const res = await addEvent({ type: 'resolve', helpId: id, answerId: b.dataset.ok, ok: true });
    toast('Teşekkürler! Bu ürün artık haritada bir pin.');
    celebrate(res);
    openHelpDetail(id);
  }));
  $$('[data-no]', body).forEach((b) => (b.onclick = async () => {
    await addEvent({ type: 'resolve', helpId: id, answerId: b.dataset.no, ok: false });
    openHelpDetail(id);
  }));
  const know = $('#know', body);
  if (know) know.onclick = () => answerFlow(h);
  setHelpMarkers([h], () => {});
  const pts = h.answers.map((a) => S.placeById.get(a.placeId)).filter(Boolean);
  setExtraMarkers(pts.map((p) => ({ lat: p.lat, lon: p.lon, html: catInfo(p.cat).icon, onClick: () => App.openPlace(p.id) })));
  fitTo([[h.lat, h.lon], ...pts.map((p) => [p.lat, p.lon])]);
}

// Yardım iste
export function askHelp(text = '') {
  const pg = openPage('Yardım iste', `<div class="field"><label>Ne arıyorsun?</label><input id="ht" value="${esc(text)}" placeholder="ör. 12'lik bronz cıvata"><div class="hint">Ne kadar net yazarsan o kadar iyi: ölçü, renk, marka…</div></div>
    <div class="field"><label>Nerede?</label>
      <button class="btn block ghost" id="hereBtn">${ic('locate-fixed')} Bulunduğum yer</button>
      <button class="btn block ghost" id="mapBtn" style="margin-top:8px">${ic('crosshair')} Haritadan seç</button>
      <div class="hint" id="locHint"></div></div>
    <div class="err" id="err" hidden></div>
    <button class="btn primary block" id="go">${ic('hand-helping')} Müdavimlere sor</button>`);
  let loc = S.pos ? { lat: S.pos.lat, lon: S.pos.lon } : null;
  const hint = () => ($('#locHint', pg).textContent = loc ? `Seçili: ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}` : 'Konum seçilmedi');
  hint();
  $('#hereBtn', pg).onclick = () => {
    if (!S.pos) return toast('Konumun alınamadı, haritadan seç');
    loc = { lat: S.pos.lat, lon: S.pos.lon };
    hint();
  };
  $('#mapBtn', pg).onclick = async () => {
    pg.style.display = 'none';
    const v = await pickLocation('Pini, ürünü aradığın bölgeye getir');
    pg.style.display = '';
    if (v) loc = v;
    hint();
  };
  $('#go', pg).onclick = async () => {
    const t = $('#ht', pg).value.trim();
    const err = $('#err', pg);
    err.hidden = false;
    if (t.length < 2) return (err.textContent = 'Ne aradığını yaz.');
    if (!loc) return (err.textContent = 'Konum seç.');
    const productId = matchProducts(t)[0]?.p.id || null;
    const id = newId('h');
    const res = await addEvent({ type: 'help', id, lat: loc.lat, lon: loc.lon, text: t, productId });
    goBack();
    celebrate(res);
    toast('Çağrın yakındaki müdavimlere iletildi');
    App.setTab('help');
    setTimeout(() => openHelpDetail(id), 300);
  };
}

// Cevap ver: dükkan seç
function answerFlow(h) {
  const res = search(h.text, [h.lat, h.lon]);
  const likely = res.results.filter((r) => r.kind !== 'place').slice(0, 6).map((r) => r.place);
  const near = S.places.map((p) => ({ p, d: distance(h.lat, h.lon, p.lat, p.lon) })).filter((x) => x.d < 3000).sort((a, b) => a.d - b.d).map((x) => x.p);
  const pg = openPage('Nerede bulunur?', `<div class="muted" style="margin-bottom:10px">“${esc(h.text)}”</div>
    <div class="field"><input id="f" placeholder="Dükkan adı ya da türü ile ara"></div><div id="lst"></div>
    <button class="btn ghost block" id="mapPick" style="margin-top:10px">${ic('crosshair')} Haritada göster (dükkana en yakın)</button>`);
  let chosen = null;
  const rowP = (p) => `<button class="row" data-p="${esc(p.id)}"><span class="ico">${catInfo(p.cat).icon}</span><span class="main"><div class="t1">${esc(placeLabel(p))}</div>
    <div class="t2">${esc(catInfo(p.cat).name)} · ${fmtDist(distance(h.lat, h.lon, p.lat, p.lon))}</div></span></button>`;
  const render = () => {
    const q = norm($('#f', pg).value);
    const filt = (p) => !q || norm(p.name).includes(q) || norm(catInfo(p.cat).name).includes(q);
    const a = likely.filter(filt);
    const b = near.filter((p) => !likely.includes(p) && filt(p)).slice(0, 40);
    $('#lst', pg).innerHTML = `${a.length ? `<div class="sec-title">Muhtemel yerler</div>${a.map(rowP).join('')}` : ''}<div class="sec-title">Çevredeki dükkanlar</div>${b.map(rowP).join('') || '<div class="muted">Sonuç yok</div>'}`;
    $$('[data-p]', pg).forEach((x) => (x.onclick = () => choose(S.placeById.get(x.dataset.p))));
  };
  const choose = (p) => {
    chosen = p;
    $('.page-body', pg).innerHTML = `<div class="card"><b>${catInfo(p.cat).icon} ${esc(placeLabel(p))}</b><div class="muted">${esc(catInfo(p.cat).name)}</div></div>
      <div class="field"><label>Not <span class="muted" style="font-weight:400">(isteğe bağlı)</span></label><input id="nt" placeholder="ör. Rafın en altında, ustaya sor"></div>
      <button class="btn primary block" id="send">${ic('map-pin')} Öneriyi gönder</button>`;
    $('#send', pg).onclick = async () => {
      const req = h.sim ? { id: h.id, u: h.u, lat: h.lat, lon: h.lon, text: h.text, productId: h.productId, t: h.t, sim: true } : null;
      const r = await addEvent({ type: 'answer', id: newId('a'), helpId: h.id, placeId: chosen.id, note: $('#nt', pg).value.trim(), req });
      goBack();
      celebrate(r);
      toast(`${userOf(h.u).nick} gidip bakınca haber vereceğiz`);
      openHelpDetail(h.id);
    };
  };
  $('#f', pg).addEventListener('input', render);
  $('#mapPick', pg).onclick = async () => {
    pg.style.display = 'none';
    flyTo(h.lat, h.lon, 16);
    const v = await pickLocation('Pini, ürünün bulunduğu dükkanın üstüne getir');
    pg.style.display = '';
    if (!v) return;
    const best = S.places.map((p) => ({ p, d: distance(v.lat, v.lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d)[0];
    if (!best || best.d > 60) return toast('Orada kayıtlı dükkan yok. Seviye 5 olunca dükkan ekleyebilirsin.');
    choose(best.p);
  };
  render();
}

// ---- Demo: simüle müdavimler cevap verir / teyit eder ----
const noAnswer = new Set();
export function simTick() {
  if (!S.settings.sim) return;
  const now = Date.now();
  for (const h of S.help.values()) {
    // 1) Benim çağrıma simüle bir müdavim cevap verir
    if (h.u === 'me' && h.status === 'open' && !h.answers.length && now - h.t > 15000 && !noAnswer.has(h.id)) {
      const res = search(h.text, [h.lat, h.lon]).results.filter((r) => r.kind !== 'place' && distance(h.lat, h.lon, r.place.lat, r.place.lon) < 4000);
      const pick = res.find((r) => r.kind === 'offer') || res[0];
      if (!pick) {
        noAnswer.add(h.id);
        continue;
      }
      const sims = [...S.users.values()].filter((u) => u.sim && u.persona === 'dengeli');
      const u = sims.find((x) => x.home === pick.place.mah) || sims[hash(h.id) % sims.length];
      const note = pick.kind === 'offer' ? (pick.note || 'Geçen hafta gördüm, vardı.') : 'Kesin değil ama bu tür dükkanlarda olur, bir sor.';
      addEvent({ type: 'simAnswer', id: `sa_${h.id}`, helpId: h.id, u: u.id, placeId: pick.place.id, note }).then(() => {
        toast(`🙋 ${u.nick} çağrına cevap verdi`);
        App.refreshTab?.();
      });
      return;
    }
    // 2) Simüle çağrıya verdiğim cevabı çağrı sahibi teyit eder
    if (h.sim) {
      const a = h.answers.find((x) => x.u === 'me' && x.status === 'pending');
      if (a && now - a.t > 9000) {
        const p = S.placeById.get(a.placeId);
        const prod = h.productId ? productOf(h.productId) : null;
        const fits = p && prod && (prod.cats.includes(p.cat) || S.offers.has(`${p.id}|${prod.id}`));
        const ok = fits ? hash(a.id) % 10 < 9 : hash(a.id) % 10 < 3;
        addEvent({ type: 'simResolve', helpId: h.id, answerId: a.id, ok }).then((res) => {
          if (ok) {
            toast(`✅ ${userOf(h.u).nick}: “Buldum, sağ ol!”`);
            celebrate(res);
          } else toast(`❌ ${userOf(h.u).nick}: “Gittim ama yoktu.”`);
          App.refreshTab?.();
        });
        return;
      }
    }
  }
}

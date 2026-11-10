import { App } from '../app.js';
import { S, myProgress, progressOf, saveMe, saveSettings, resetAll, adminQueue, addEvent, productOf, userOf, mahName, offerInfo } from '../lib/state.js';
import { BADGES, LEVELS, frameOf, ADD_PLACE_LEVEL, XP } from '../lib/game.js';
import { MIN_OTHERS } from '../lib/engine.js';
import { squareAvatar } from '../lib/photo.js';
import { esc, fmtNum } from '../lib/text.js';
import { $, $$, ic, icons, openPage, toast, avatar, confirmBox, modal, goBack } from './dom.js';
import { placeLabel } from './views.js';
import { refreshPlaces } from './map.js';

export function profileHtml() {
  const p = myProgress();
  const st = p.stats;
  const me = S.me;
  const titles = [p.level.name, ...p.titles];
  const shown = titles.includes(me.title) ? me.title : p.titles[0] || p.level.name;
  const next = p.level.next;
  return `<div class="prof">${avatar('me', 'lg')}
    <h2>${esc(me.nick || 'İsimsiz müdavim')}</h2><div class="title">${esc(shown)}</div>
    <div class="muted" style="margin-top:6px">Seviye ${p.level.n} · ${esc(p.level.name)} · ${p.xp} XP</div></div>
    <div class="lvbar"><i style="width:${Math.round(p.level.prog * 100)}%"></i></div>
    <div class="muted" style="font-size:12.5px;text-align:center">${next ? `Seviye ${next.n} (${esc(next.name)}) için ${next.xp - p.xp} XP${next.unlock ? ` · açılır: ${esc(next.unlock)}` : ''}` : 'En yüksek seviye!'}</div>
    <div class="stats">
      <div class="stat"><b>${st.helped || 0}</b><span>kişiye yardım etti</span></div>
      <div class="stat"><b>${st.confirms}</b><span>ürün teyidi</span></div>
      <div class="stat"><b>${st.rates}</b><span>değerlendirme</span></div>
      <div class="stat"><b>${st.photos}</b><span>fotoğraf</span></div>
      <div class="stat"><b>${st.places.size}</b><span>dükkan</span></div>
      <div class="stat"><b>${st.newPins}</b><span>ilk bulduğu</span></div></div>
    <button class="btn block ghost" id="editMe">${ic('pencil')} İsim, fotoğraf, lakap</button>
    <div class="sec-title">Rozetler (${p.badges.size}/${BADGES.length})</div>
    <div class="badges">${BADGES.map((b) => `<div class="badge ${p.badges.has(b.id) ? '' : 'locked'}"><span class="e">${b.icon}</span><b>${esc(b.name)}</b>${esc(b.desc)}</div>`).join('')}</div>
    <div class="sec-title">Unvanlar</div>
    ${p.titles.length ? p.titles.map((t) => `<div class="pill lv3" style="margin:0 6px 6px 0">👑 ${esc(t)}</div>`).join('') : '<div class="muted" style="font-size:13.5px;line-height:1.5">Bir mekâna en çok katkı yapan <b>“… müdavimi”</b>, bir mahallede en çok katkı yapan <b>“… kurdu”</b>, ilçede bir numara olan <b>“… piri”</b> olur.</div>'}
    <div class="sec-title">Seviyeler</div>
    <div class="lv-list">${LEVELS.map((l) => `<div class="row" style="${l.n === p.level.n ? 'background:var(--brand-soft);border-radius:10px;padding-left:8px' : ''}">
      <span class="main"><div class="t1">${l.n}. ${esc(l.name)}</div>${l.unlock ? `<div class="t2">${esc(l.unlock)}</div>` : ''}</span><span class="side">${l.xp} XP</span></div>`).join('')}</div>
    <div class="sec-title">XP nasıl kazanılır?</div>
    <div class="kv"><span>Burada var</span><b>+${XP.confirm} (fotoğrafla +${XP.photo})</b><span>Kimsenin bilmediği ürünü ilk bulmak</span><b>+${XP.newPin}</b>
      <span>Puan + yorum</span><b>+${XP.rate}…${XP.rate + XP.longText + XP.photo}</b><span>Yardım çağrısını çözmek</span><b>+${XP.answerAccepted}</b>
      <span>Yeni dükkan (Sv.${ADD_PLACE_LEVEL}+)</span><b>+${XP.addPlace}</b><span>Eskimiş bilgiyi bildirmek</span><b>+${XP.report}</b></div>
    <div style="margin-top:18px;display:grid;gap:8px">
      <button class="btn block" id="addPlace">${ic('plus')} Yeni dükkan ekle ${p.level.n < ADD_PLACE_LEVEL ? `(Sv.${ADD_PLACE_LEVEL})` : ''}</button>
      <button class="btn block" id="demo">${ic('settings')} Demo araçları & yönetici</button></div>`;
}

export function openProfile() {
  const pg = openPage('Profil', profileHtml(), { cls: 'over-tabs' });
  wireProfile(pg);
  return pg;
}

function wireProfile(pg) {
  $('#editMe', pg).onclick = () => editMe(() => {
    $('.page-body', pg).innerHTML = profileHtml();
    icons(pg);
    wireProfile(pg);
  });
  $('#addPlace', pg).onclick = () => {
    goBack();
    setTimeout(() => App.addPlace(), 200);
  };
  $('#demo', pg).onclick = () => openDemoTools();
}

export function editMe(done) {
  const p = myProgress();
  const titles = [p.level.name, ...p.titles];
  let av = S.me.avatar;
  const pg = openPage('Profilini düzenle', `<div class="prof"><button id="avBtn">${avatar('me', 'lg')}</button><div class="muted" style="font-size:13px">Fotoğrafı değiştirmek için dokun</div></div>
    <div class="field"><label>İsim ya da mahlas</label><input id="nick" maxlength="24" value="${esc(S.me.nick || '')}" placeholder="ör. Darıcalı Bora"></div>
    <div class="field"><label>Görünen lakap</label><select id="title">${titles.map((t) => `<option ${t === S.me.title ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <div class="hint">Yeni unvan kazandıkça burada çıkar.</div></div>
    <button class="btn primary block" id="save">Kaydet</button>`);
  $('#avBtn', pg).onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      av = await squareAvatar(inp.files[0]);
      $('#avBtn', pg).innerHTML = `<span class="av lg ${frameOf(p.level.n)}"><img src="${av}"></span>`;
    };
    inp.click();
  };
  $('#save', pg).onclick = async () => {
    await saveMe({ nick: $('#nick', pg).value.trim(), title: $('#title', pg).value, avatar: av });
    goBack();
    toast('Profil kaydedildi');
    App.updateMeBtn();
    done?.();
  };
}

// ---------------- Demo araçları ----------------
export function openDemoTools() {
  const q = adminQueue();
  const meta = S.meta || {};
  const pg = openPage('Demo araçları', `<div class="banner-demo">Bu bölüm sadece demo için. Gerçek uygulamada kullanıcılar görmez.</div>
    <label class="switch"><span>Simüle topluluk verisi<small>Gerçek dükkanların üstünde “demo” etiketli sahte kullanıcı katkıları</small></span><input type="checkbox" id="sim" ${S.settings.sim ? 'checked' : ''}></label>
    <label class="switch"><span>Konum kontrolü (${S.settings.geofenceM} m)<small>Katkı için dükkanın yakınında olmak gereksin</small></span><input type="checkbox" id="geo" ${S.settings.geofence ? 'checked' : ''}></label>
    <label class="switch"><span>Sesli yönlendirme<small>Yol tarifinde Türkçe sesli komut</small></span><input type="checkbox" id="voice" ${S.settings.voice ? 'checked' : ''}></label>
    <div style="display:grid;gap:8px;margin:14px 0">
      <button class="btn block" id="lv5">${ic('sparkles')} Seviyemi 5 yap (dükkan eklemeyi dene)</button>
      <button class="btn block" id="admin">${ic('shield-check')} Yönetici onay kuyruğu (${q.length})</button>
      <button class="btn block" id="algo">${ic('eye')} Gizli puan algoritmasını gör</button>
      <button class="btn block danger" id="reset">${ic('rotate-ccw')} Bütün verilerimi sıfırla</button></div>
    <div class="sec-title">Veri</div>
    <div class="kv"><span>Dükkan sayısı</span><b>${S.places.length}</b><span>OpenStreetMap</span><b>${meta.counts?.osm ?? '-'}</b>
      <span>Overture / Foursquare</span><b>${meta.counts?.overture ?? '-'}</b><span>Mahalle</span><b>${S.mahalle.length}</b>
      <span>Veri tarihi</span><b>${esc((meta.generated || '').slice(0, 10))}</b></div>
    <p class="muted" style="font-size:12px;line-height:1.5">${esc(meta.attribution || '')}</p>`);
  const sw = (id, key, rebuild) => ($(`#${id}`, pg).onchange = async (e) => {
    await saveSettings({ [key]: e.target.checked }, rebuild);
    if (rebuild) {
      refreshPlaces();
      App.refreshTab?.();
    }
  });
  sw('sim', 'sim', true);
  sw('geo', 'geofence', false);
  sw('voice', 'voice', false);
  $('#lv5', pg).onclick = async () => {
    const need = LEVELS.find((l) => l.n === 5).xp;
    const cur = myProgress().xp;
    if (cur >= need) return toast('Zaten seviye 5 ve üstündesin');
    await saveMe({ bonusXp: (S.me.bonusXp || 0) + (need - cur) });
    toast('Demo: seviye 5 oldun, artık dükkan ekleyebilirsin');
  };
  $('#admin', pg).onclick = () => openAdmin();
  $('#algo', pg).onclick = () => openAlgo();
  $('#reset', pg).onclick = async () => {
    if (!(await confirmBox('Tüm katkıların, fotoğrafların ve profilin silinecek. Emin misin?', 'Sıfırla'))) return;
    await resetAll();
    location.reload();
  };
}

function openAdmin() {
  const render = () => {
    const q = adminQueue();
    if (!q.length) return `<div class="empty"><div class="big">✅</div>Onay bekleyen bildirim yok.<br><span class="muted" style="font-size:13px">Bir pine 3 “burada yok” bildirimi gelince buraya düşer. Demo verisinde bazı eski pinlerde 2 bildirim var; sen 3.yü yapınca görürsün.</span></div>`;
    return q.map((x) => {
      if (x.kind === 'offer') {
        const p = S.placeById.get(x.o.placeId);
        return `<div class="card"><b>${esc(productOf(x.o.productId).name)}</b> @ ${esc(placeLabel(p))}<div class="muted" style="font-size:13px;margin:4px 0 10px">${x.inf.reportsOpen} “burada yok” bildirimi · son teyit ${x.inf.last ? new Date(x.inf.last).toLocaleDateString('tr-TR') : '-'}</div>
          <div style="display:flex;gap:8px"><button class="btn small primary" data-close="${esc(x.id)}" data-kind="offer">Pini kapat</button><button class="btn small" data-keep="${esc(x.id)}" data-kind="offer">Kalsın</button></div></div>`;
      }
      const p = S.placeById.get(x.id);
      return `<div class="card"><b>${esc(placeLabel(p))}</b> (dükkan)<div class="muted" style="font-size:13px;margin:4px 0 10px">${x.reps.length} bildirim: ${x.reps.map((r) => r.kind).join(', ')}</div>
        <div style="display:flex;gap:8px"><button class="btn small primary" data-close="${esc(x.id)}" data-kind="place">Dükkanı kapat</button><button class="btn small" data-keep="${esc(x.id)}" data-kind="place">Kalsın</button></div></div>`;
    }).join('');
  };
  const pg = openPage('Onay kuyruğu', render());
  const wire = () => {
    $$('[data-close],[data-keep]', pg).forEach((b) => (b.onclick = async () => {
      await addEvent({ type: 'admin', kind: b.dataset.kind, id: b.dataset.close || b.dataset.keep, decision: b.dataset.close ? 'close' : 'keep' });
      refreshPlaces();
      $('.page-body', pg).innerHTML = render();
      wire();
      toast(b.dataset.close ? 'Kapatıldı' : 'Bildirimler temizlendi');
    }));
  };
  wire();
}

function openAlgo() {
  const sc = S.scores;
  const rows = [...sc.user.entries()].map(([u, v]) => ({ u, ...v, persona: userOf(u).persona || (u === 'me' ? 'sen' : '') })).sort((a, b) => b.weight - a.weight);
  const PN = { dengeli: 'dengeli', comert: 'cömert (+)', sert: 'sert (−)', rastgele: 'rastgele', hep5: 'hep 5 veren', sen: 'SEN' };
  const meRow = sc.user.get('me');
  const pg = openPage('Gizli puan algoritması', `<div class="banner-demo">Kullanıcılar bu ekranı görmez ve ağırlıklarının nasıl hesaplandığını bilmez.</div>
    <p style="line-height:1.5;font-size:14px">Her kullanıcının puanı, aynı ürünü puanlayan <b>diğerlerinin</b> ortalamasıyla karşılaştırılır (en az ${MIN_OTHERS} başka puan almış ürünlerde). <b>Sapma</b>: hep yüksek ya da hep düşük verme eğilimi. Bu fark düşülerek kullanılır. <b>Ağırlık</b>: sapma düşüldükten sonra ortalamaya ne kadar tutarlı yakınsa o kadar yüksek. Her şeye aynı puanı veren (ör. hep 5) ve rastgele veren düşük ağırlık alır.</p>
    <div class="kv" style="margin-bottom:12px"><span>Genel ortalama</span><b>${fmtNum(sc.global, 2)}</b><span>Senin ağırlığın</span><b>${meRow ? `${fmtNum(meRow.weight, 2)} (${meRow.n} karşılaştırma)` : `henüz ölçülmedi (${MIN_OTHERS}+ puanlı ürün gerek)`}</b></div>
    <table class="algo"><tr><th>Kullanıcı</th><th>Tip (demo)</th><th>Sapma</th><th>Ağırlık</th><th>n</th></tr>
    ${rows.map((r) => `<tr style="${r.u === 'me' ? 'background:var(--brand-soft)' : ''}"><td>${esc(userOf(r.u).nick)}</td><td>${PN[r.persona] || ''}</td><td>${r.bias >= 0 ? '+' : ''}${fmtNum(r.bias, 2)}</td><td><b>${fmtNum(r.weight, 2)}</b></td><td>${r.n}</td></tr>`).join('')}</table>`);
  return pg;
}

export { openAdmin, openAlgo, modal, mahName, offerInfo };

import { App } from '../app.js';
import { S, progressOf, userOf, nearestMah, mahName } from '../lib/state.js';
import { BADGES, TITLE_RULES } from '../lib/game.js';
import { catInfo } from '../data/catalog.js';
import { esc } from '../lib/text.js';
import { $, $$, ic, icons, openPage, avatar, modal, goBack } from './dom.js';
import { placeLabel } from './views.js';

export function boardHtml(mah) {
  const rows = S.mahBoard?.get(mah) || [];
  const dIdx = S.mahalle[mah]?.[3] ?? -1;
  const drows = dIdx >= 0 ? S.distBoard?.get(dIdx) || [] : [];
  const opts = S.mahalle.map((m, i) => ({ i, n: m[0] })).sort((a, b) => a.n.localeCompare(b.n, 'tr'))
    .map((m) => `<option value="${m.i}" ${m.i === mah ? 'selected' : ''}>${esc(m.n)}</option>`).join('');
  const userRow = (r, i, kind) => {
    const u = userOf(r.u);
    const p = progressOf(r.u);
    const crown = i === 0 ? (kind === 'mah' ? `👑 ${esc(TITLE_RULES.mah(mahName(mah)))}` : `👑 ${esc(TITLE_RULES.district(S.districts[dIdx]))}`) : '';
    return `<button class="row" data-u="${r.u}" style="${r.u === 'me' ? 'background:var(--brand-soft);border-radius:10px' : ''}">
      <b style="width:22px;text-align:center;color:${i < 3 ? 'var(--brand)' : 'var(--ink-3)'}">${i + 1}</b>${avatar(r.u, 'md')}
      <span class="main"><div class="t1">${esc(u.nick)} ${u.sim ? '<span class="pill demo">demo</span>' : ''}</div>
      <div class="t2">Sv.${p.level.n} ${esc(p.level.name)} · ${p.stats.helped || 0} kişiye yardım</div>${crown ? `<div class="t3" style="color:var(--brand);font-weight:600">${crown}</div>` : ''}</span>
      <span class="side"><div class="score">${r.score}</div><div>puan</div></span></button>`;
  };
  // mahalledeki mekân müdavimleri
  const placeRows = [...S.placeTop.entries()].map(([pid, b]) => ({ p: S.placeById.get(pid), ...b })).filter((x) => x.p && x.p.mah === mah).sort((a, b) => b.c - a.c).slice(0, 12);
  return `<div class="field"><label>Mahalle</label><select id="mahSel">${opts}</select></div>
    <p class="muted" style="font-size:13px;line-height:1.45;margin-top:-4px">Bir mekâna en çok katkı yapan o mekânın <b>müdavimi</b>, mahallede bir numara olan <b>mahallenin kurdu</b>, ilçede bir numara olan <b>semtin piri</b> olur.</p>
    <div class="sec-title">${esc(mahName(mah))} kurtları</div>
    ${rows.length ? rows.slice(0, 15).map((r, i) => userRow(r, i, 'mah')).join('') : '<div class="muted">Bu mahallede henüz katkı yok. İlk kurt sen ol.</div>'}
    ${drows.length ? `<div class="sec-title">${esc(S.districts[dIdx])} pirleri</div>${drows.slice(0, 5).map((r, i) => userRow(r, i, 'dist')).join('')}` : ''}
    ${placeRows.length ? `<div class="sec-title">Mekânların müdavimleri</div>${placeRows.map((x) => `<button class="row" data-p="${esc(x.p.id)}"><span class="ico">${catInfo(x.p.cat).icon}</span>
      <span class="main"><div class="t1">${esc(placeLabel(x.p))}</div><div class="t2">🫖 ${esc(userOf(x.u).nick)} · ${x.c} katkı</div></span></button>`).join('')}` : ''}`;
}

export function openBoard() {
  const start = S.pos ? nearestMah(S.pos.lat, S.pos.lon) : nearestMah(S.center[0], S.center[1]);
  let mah = start >= 0 ? start : 0;
  const pg = openPage('Müdavimler', boardHtml(mah), { cls: 'over-tabs' });
  const wire = () => {
    $('#mahSel', pg).onchange = (e) => {
      mah = +e.target.value;
      $('.page-body', pg).innerHTML = boardHtml(mah);
      icons(pg);
      wire();
    };
    $$('[data-u]', pg).forEach((b) => (b.onclick = () => userCard(b.dataset.u)));
    $$('[data-p]', pg).forEach((b) => (b.onclick = () => {
      goBack();
      setTimeout(() => App.openPlace(b.dataset.p), 200);
    }));
  };
  wire();
  return pg;
}

export function userCard(uid) {
  const u = userOf(uid);
  const p = progressOf(uid);
  const m = modal(`${avatar(uid, 'lg')}<h3 style="margin-top:12px">${esc(u.nick)}</h3>
    <div style="color:var(--brand);font-weight:600">${esc(p.titles[0] || p.level.name)}</div>
    <p>Seviye ${p.level.n} · ${p.xp} XP<br>${p.stats.helped || 0} kişiye yardım · ${p.stats.confirms} teyit · ${p.stats.rates} değerlendirme</p>
    <div style="font-size:26px;letter-spacing:4px">${BADGES.filter((b) => p.badges.has(b.id)).map((b) => b.icon).join('') || '—'}</div>
    ${p.titles.length > 1 ? `<p style="font-size:13px">${p.titles.slice(1, 5).map(esc).join(' · ')}</p>` : ''}
    ${uid !== 'me' ? `<button class="btn primary block" id="ask">${ic('message-circle')} Bir şey sor</button><p class="muted" style="font-size:12px">Mesajlaşma yok; sorun bir yardım çağrısı olarak açılır ve ${esc(u.nick)} da görür.</p>` : ''}
    <button class="btn block" data-close>Kapat</button>`);
  const a = $('#ask', m.el);
  if (a) a.onclick = () => {
    m.close();
    App.askHelp(`@${u.nick} `);
  };
}

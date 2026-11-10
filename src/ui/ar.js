// AR: kamera + GPS + pusula ile dükkanın üstüne dev bir pin koyar.
// Pusula sapmasını düzeltmek için "Hizala": dükkana dokununca pin oraya oturur.
import { App } from '../app.js';
import { S } from '../lib/state.js';
import { catInfo } from '../data/catalog.js';
import { distance, bearing, angleDiff } from '../lib/geo.js';
import { esc, fmtDist } from '../lib/text.js';
import { $, ic, icons, toast, expectPop } from './dom.js';
import { startCompass } from './sensors.js';
import { placeLabel } from './views.js';

let stream = null;
let raf = 0;
let offset = 0; // elle hizalama düzeltmesi (derece)
let aligning = false;

export async function openAR(place) {
  if (!place) return;
  const ui = $('#arui');
  ui.hidden = false;
  const c = catInfo(place.cat);
  const ent = S.entrances.get(place.id);
  ui.innerHTML = `<video playsinline muted autoplay></video>
    <div class="ar-layer">
      <div class="ar-pin" id="arPin"><div class="card"><b>${c.icon} ${esc(placeLabel(place))}</b><span id="arDist"></span></div><div class="head"><i>${c.icon}</i></div><div class="stem"></div></div>
      ${ent ? '<div class="ar-pin door" id="arDoor"><div class="card"><b>🚪 Giriş</b></div><div class="head"><i>🚪</i></div><div class="stem"></div></div>' : ''}
      <div class="ar-edge" id="arEdge" hidden></div>
      <div class="ar-radar" id="arRadar"><i id="arDot"></i>${ent ? '<i id="arDotDoor" style="background:#0f766e"></i>' : ''}</div>
    </div>
    <div class="ar-top"><div class="ar-info" id="arInfo"><b>${esc(placeLabel(place))}</b><br><span id="arStat">Kamera açılıyor…</span></div>
      <button class="ar-btn" id="arClose" aria-label="Kapat">${ic('x')}</button></div>
    <div class="ar-bottom"><div class="ar-hint" id="arHint">Telefonu dik tut ve etrafında yavaşça dön.</div>
      <div style="display:flex;gap:8px"><button class="btn block" id="arAlign" style="background:rgba(255,255,255,.92)">${ic('crosshair')} Hizala</button>
      <button class="btn primary block" id="arFound">${ic('check')} Buldum</button></div></div>`;
  icons(ui);
  const video = ui.querySelector('video');
  $('#arClose').onclick = closeAR;
  $('#arFound').onclick = () => {
    closeAR();
    App.openConfirm(place.id, App.focusProduct || null);
  };
  $('#arAlign').onclick = () => {
    aligning = true;
    $('#arHint').textContent = 'Ekranda dükkanın tabelasına / kapısına dokun. Pin oraya oturacak.';
  };
  ui.querySelector('.ar-layer').style.pointerEvents = 'none';
  video.addEventListener('click', (e) => alignAt(e.clientX));
  ui.addEventListener('click', (e) => {
    if (aligning && !e.target.closest('button')) alignAt(e.clientX);
  });
  history.pushState({ ar: 1, page: (history.state && history.state.page) || 0 }, '');
  App.arOpen = true;

  const okCompass = await startCompass(true);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch (e) {
    $('#arStat').textContent = 'Kamera açılamadı (izin verilmedi). Pusula ve radar yine çalışır.';
  }
  if (!okCompass) toast('Pusula izni verilmedi');

  const target = [place.lat, place.lon];
  const pin = $('#arPin');
  const door = $('#arDoor');
  const edge = $('#arEdge');
  const dot = $('#arDot');
  const dotDoor = $('#arDotDoor');
  let lastStat = 0;

  const place1 = (el, lat, lon, W, H, hfov, heading, horizonY) => {
    const d = distance(S.pos.lat, S.pos.lon, lat, lon);
    const rel = angleDiff(bearing(S.pos.lat, S.pos.lon, lat, lon), heading);
    const vis = Math.abs(rel) < hfov / 2 + 8;
    const x = W / 2 + (rel / hfov) * W;
    const scale = Math.max(0.45, Math.min(1.35, 1.55 - Math.log10(Math.max(5, d)) * 0.42));
    const depress = Math.min(H * 0.25, ((Math.atan(1.4 / Math.max(3, d)) * 180) / Math.PI / (hfov * (H / W))) * H);
    const y = horizonY + depress;
    el.style.opacity = vis ? '1' : '0';
    el.style.transform = `translate(${x - el.offsetWidth / 2}px, ${y - el.offsetHeight}px) scale(${scale})`;
    return { d, rel };
  };

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (!S.pos || App.heading == null) {
      $('#arStat').textContent = !S.pos ? 'Konum bekleniyor…' : 'Pusula bekleniyor… Telefonu 8 çizerek salla.';
      pin.style.opacity = '0';
      return;
    }
    const landscape = W > H;
    const hfov = landscape ? 63 : 48;
    const heading = (App.heading + offset + 360) % 360;
    // ufuk çizgisi: telefon dikken (beta≈90) ekranın ortası
    const tilt = landscape ? 0 : (App.beta || 90) - 90;
    const vfov = hfov * (H / W);
    const horizonY = H / 2 + (tilt / vfov) * H;
    const main = place1(pin, target[0], target[1], W, H, hfov, heading, horizonY);
    if (door && ent) place1(door, ent.lat, ent.lon, W, H, hfov, heading, horizonY);
    pin.querySelector('#arDist').textContent = fmtDist(main.d);
    // ekran dışındaysa yön oku
    if (Math.abs(main.rel) > hfov / 2) {
      edge.hidden = false;
      edge.className = `ar-edge ${main.rel > 0 ? 'r' : 'l'}`;
      edge.innerHTML = main.rel > 0 ? `Sağa dön ${Math.round(main.rel)}° →` : `← Sola dön ${Math.round(-main.rel)}°`;
    } else edge.hidden = true;
    // radar
    const rr = 40 * Math.min(1, main.d / 250);
    const a = (main.rel * Math.PI) / 180;
    dot.style.left = `${48 + Math.sin(a) * rr}px`;
    dot.style.top = `${48 - Math.cos(a) * rr}px`;
    if (dotDoor && ent) {
      const d2 = distance(S.pos.lat, S.pos.lon, ent.lat, ent.lon);
      const a2 = (angleDiff(bearing(S.pos.lat, S.pos.lon, ent.lat, ent.lon), heading) * Math.PI) / 180;
      const r2 = 40 * Math.min(1, d2 / 250);
      dotDoor.style.left = `${48 + Math.sin(a2) * r2}px`;
      dotDoor.style.top = `${48 - Math.cos(a2) * r2}px`;
    }
    const now = performance.now();
    if (now - lastStat > 500) {
      lastStat = now;
      const acc = Math.round(S.pos.acc || 0);
      $('#arStat').innerHTML = `${fmtDist(main.d)} uzakta · GPS ±${acc} m${offset ? ` · hizalandı (${Math.round(offset)}°)` : ''}${acc > 25 ? '<br>GPS zayıf: pin birkaç metre kayabilir, “Hizala” ile düzelt.' : ''}`;
      if (!aligning) $('#arHint').textContent = main.d < 30 ? 'Çok yakınsın! Pin dükkanın üstünde.' : Math.abs(main.rel) > hfov / 2 ? 'Okun gösterdiği yöne dön.' : 'Dev pin dükkanın üstünde. Kaymışsa “Hizala”.';
    }
    App._arRel = main.rel;
    App._arHfov = hfov;
  };
  loop();
}

function alignAt(x) {
  if (!aligning || App._arRel == null) return;
  const W = window.innerWidth;
  const tapRel = ((x - W / 2) / W) * App._arHfov;
  offset += App._arRel - tapRel;
  aligning = false;
  $('#arHint').textContent = 'Hizalandı. Pin artık dükkanın üstünde.';
  toast('AR hizalandı');
}

export function closeAR(fromPop = false) {
  if (!App.arOpen) return;
  App.arOpen = false;
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  const ui = $('#arui');
  ui.hidden = true;
  ui.innerHTML = '';
  aligning = false;
  if (!fromPop) {
    expectPop();
    history.back();
  }
}

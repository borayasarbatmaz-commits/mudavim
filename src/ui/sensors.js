// Pusula ve eğim. Android Chrome: deviceorientationabsolute (kuzeye göre), iOS: webkitCompassHeading.
import { App } from '../app.js';
import { compassHeading } from '../lib/geo.js';

let started = false;
let hx = 0;
let hy = 0;
let hasAbs = false;
const subs = new Set();

export function onOrient(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function screenAngle() {
  return (screen.orientation && screen.orientation.angle) || window.orientation || 0;
}

function handle(e, absolute) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if ((absolute || e.absolute) && e.alpha != null) h = compassHeading(e.alpha, e.beta, e.gamma);
  if (absolute) hasAbs = true;
  if (!absolute && hasAbs && e.webkitCompassHeading == null) return; // mutlak olanı tercih et
  App.beta = e.beta;
  App.gamma = e.gamma;
  if (h == null || Number.isNaN(h)) return;
  h = (h + screenAngle() + 360) % 360;
  const r = (h * Math.PI) / 180;
  hx = hx * 0.8 + Math.cos(r) * 0.2;
  hy = hy * 0.8 + Math.sin(r) * 0.2;
  App.heading = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
  App.headingRaw = h;
  App.compassOk = true;
  for (const fn of subs) fn();
}

export async function startCompass(fromGesture = false) {
  if (started) return true;
  try {
    if (fromGesture && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const st = await DeviceOrientationEvent.requestPermission();
      if (st !== 'granted') return false;
    }
  } catch {
    return false;
  }
  started = true;
  window.addEventListener('deviceorientationabsolute', (e) => handle(e, true), true);
  window.addEventListener('deviceorientation', (e) => handle(e, false), true);
  return true;
}

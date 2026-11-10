const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distance(lat1, lon1, lat2, lon2) {
  const dp = rad(lat2 - lat1);
  const dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Kuzeyden saat yönünde derece
export function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function angleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

// Noktanın çoklu çizgiye en yakın uzaklığı (metre) ve indeks. coords: [[lon,lat],...]
export function nearestOnLine(lat, lon, coords) {
  let best = { d: Infinity, i: 0, t: 0 };
  const kx = Math.cos(rad(lat)) * 111320;
  const ky = 110540;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][0] - lon) * kx;
    const ay = (coords[i][1] - lat) * ky;
    const bx = (coords[i + 1][0] - lon) * kx;
    const by = (coords[i + 1][1] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let t = -(ax * dx + ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(px, py);
    if (d < best.d) best = { d, i, t };
  }
  return best;
}

export function lineLength(coords, from = 0) {
  let s = 0;
  for (let i = from; i < coords.length - 1; i++) s += distance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  return s;
}

// W3C örneği: cihazın arka kamerasının baktığı pusula yönü
export function compassHeading(alpha, beta, gamma) {
  const x = rad(beta || 0);
  const y = rad(gamma || 0);
  const z = rad(alpha || 0);
  const cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z);
  const sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
  const Vx = -cZ * sY - sZ * sX * cY;
  const Vy = -sZ * sY + cZ * sX * cY;
  let h = Math.atan(Vx / Vy);
  if (Vy < 0) h += Math.PI;
  else if (Vx < 0) h += 2 * Math.PI;
  return deg(h);
}

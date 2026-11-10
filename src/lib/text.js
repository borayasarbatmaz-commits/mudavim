// Türkçe metin normalleştirme ve bulanık eşleme
const TR = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function norm(s) {
  return (s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıiöşüâîû]/g, (c) => TR[c] || c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// 0..1 arası benzerlik. q: arama metni, t: hedef (ikisi de normalize)
export function matchScore(q, t) {
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.startsWith(q) && q.length >= 3) return 0.92;
  if (q.startsWith(t) && t.length >= 4) return 0.9; // "beyran corbasi" -> "beyran"
  const qt = q.split(' ');
  const tt = t.split(' ');
  // hedefin tüm kelimeleri sorguda varsa (sıra fark etmez)
  if (tt.every((w) => qt.some((x) => x === w || (w.length > 4 && lev(x, w) <= 1)))) return 0.88;
  if (t.includes(q) && q.length >= 4) return 0.8;
  // kelime bazlı bulanık
  let best = 0;
  for (const a of qt) {
    if (a.length < 3) continue;
    for (const b of tt) {
      if (b.length < 3) continue;
      const d = lev(a, b);
      const s = 1 - d / Math.max(a.length, b.length);
      if (s > best) best = s;
    }
  }
  if (tt.length > 1) best *= 0.92;
  return best >= 0.72 ? best * 0.85 : 0;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function timeAgo(ts, now = Date.now()) {
  const d = Math.max(0, now - ts) / 1000;
  if (d < 60) return 'az önce';
  if (d < 3600) return `${Math.floor(d / 60)} dk önce`;
  if (d < 86400) return `${Math.floor(d / 3600)} saat önce`;
  const days = Math.floor(d / 86400);
  if (days < 30) return `${days} gün önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
}

export function fmtDist(m) {
  if (m == null || !isFinite(m)) return '';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

export function fmtNum(x, d = 1) {
  return x.toFixed(d).replace('.', ',');
}

// Basit opening_hours yorumlayıcı. Bilinmeyen biçimlerde null döner.
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export function isOpenNow(oh, date = new Date()) {
  if (!oh) return null;
  const s = oh.trim();
  if (s === '24/7') return true;
  const day = date.getDay();
  const mins = date.getHours() * 60 + date.getMinutes();
  let result = null;
  try {
    for (const rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
      const m = rule.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)?\s*(.*)$/);
      if (!m) return null;
      const dayPart = m[1];
      const timePart = (m[2] || '').trim();
      let applies = !dayPart;
      if (dayPart) {
        for (const seg of dayPart.split(',')) {
          const [a, b] = seg.split('-');
          const ia = DAYS.indexOf(a);
          const ib = b ? DAYS.indexOf(b) : ia;
          if (ia < 0 || ib < 0) return null;
          if (ia <= ib ? day >= ia && day <= ib : day >= ia || day <= ib) applies = true;
        }
      }
      if (!applies) continue;
      if (/^off$|^closed$/i.test(timePart)) {
        result = false;
        continue;
      }
      if (!timePart) {
        result = true;
        continue;
      }
      let open = false;
      for (const rng of timePart.split(',')) {
        const t = rng.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
        if (!t) return null;
        const a = +t[1] * 60 + +t[2];
        let b = +t[3] * 60 + +t[4];
        if (b <= a) b += 1440;
        if ((mins >= a && mins < b) || (mins + 1440 >= a && mins + 1440 < b)) open = true;
      }
      result = open;
    }
  } catch {
    return null;
  }
  return result;
}

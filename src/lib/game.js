// Seviye, XP, rozet, çerçeve ve lakap kuralları
export const LEVELS = [
  { n: 1, xp: 0, name: 'Yolcu' },
  { n: 2, xp: 40, name: 'Meraklı' },
  { n: 3, xp: 120, name: 'Gezgin' },
  { n: 4, xp: 250, name: 'Tanıdık yüz' },
  { n: 5, xp: 450, name: 'Esnaf dostu', unlock: 'Dükkan ekleyebilirsin · Bronz çerçeve' },
  { n: 6, xp: 750, name: 'Bilirkişi' },
  { n: 7, xp: 1150, name: 'Yerli', unlock: 'Gümüş çerçeve' },
  { n: 8, xp: 1700, name: 'Eski kurt' },
  { n: 9, xp: 2400, name: 'Pir', unlock: 'Altın çerçeve' },
  { n: 10, xp: 3300, name: 'Efsane', unlock: 'Efsane çerçeve' },
];
export const ADD_PLACE_LEVEL = 5;

export const XP = {
  confirm: 5, photo: 5, newPin: 10, rate: 8, longText: 4, report: 2, help: 2,
  answer: 5, answerAccepted: 50, addPlace: 20, entrance: 5,
};

export function levelOf(xp) {
  let L = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) L = l;
  const next = LEVELS.find((l) => l.xp > xp);
  const prog = next ? (xp - L.xp) / (next.xp - L.xp) : 1;
  return { ...L, next, prog };
}

export function frameOf(level) {
  if (level >= 10) return 'efsane';
  if (level >= 9) return 'altin';
  if (level >= 7) return 'gumus';
  if (level >= 5) return 'bronz';
  return '';
}

// Pin güven seviyesi (teyit sayısına göre)
export function pinLevel(confirmCount) {
  if (!confirmCount) return { lv: 0, name: 'Tahmini', cls: 'lv0' };
  if (confirmCount < 5) return { lv: 1, name: 'Az teyitli', cls: 'lv1' };
  if (confirmCount <= 50) return { lv: 2, name: 'Teyitli', cls: 'lv2' };
  return { lv: 3, name: 'Güvenilir', cls: 'lv3' };
}

export const FRESH_DAYS = 30;
export const STALE_DAYS = 90;
export function freshness(lastSeen, now = Date.now()) {
  if (!lastSeen) return { cls: 'none', label: '' };
  const days = (now - lastSeen) / 86400000;
  if (days <= FRESH_DAYS) return { cls: 'fresh', label: 'Güncel' };
  if (days <= STALE_DAYS) return { cls: 'aging', label: 'Bir süredir teyit edilmedi' };
  return { cls: 'stale', label: 'Güncel değil' };
}

export const BADGES = [
  { id: 'ilk_adim', name: 'İlk adım', icon: '👣', desc: 'İlk katkını yaptın' },
  { id: 'fotografci', name: 'Fotoğrafçı', icon: '📸', desc: '10 fotoğraf ekle' },
  { id: 'dedektif', name: 'Dedektif', icon: '🕵️', desc: 'Kimsenin bilmediği 5 ürünü ilk sen bul' },
  { id: 'yardimsever', name: 'Yardımsever', icon: '🤝', desc: 'Bir yardım çağrısını çöz' },
  { id: 'benden_sorulur', name: 'Buralar benden sorulur', icon: '🧭', desc: '10 yardım çağrısını çöz' },
  { id: 'kasif', name: 'Kaşif', icon: '🗺️', desc: '10 farklı dükkana katkı yap' },
  { id: 'gece_kusu', name: 'Gece kuşu', icon: '🦉', desc: 'Gece 00:00–05:00 arası katkı yap' },
  { id: 'corbaci', name: 'Çorba ustası', icon: '🥣', desc: '3 farklı çorbayı puanla' },
  { id: 'usta', name: 'Usta eli', icon: '🔩', desc: 'Hırdavat/tesisat/elektrikte 5 ürün teyit et' },
  { id: 'goz_kulak', name: 'Göz kulak', icon: '👀', desc: 'Eskimiş 3 bilgiyi bildir' },
  { id: 'guvenilir', name: 'Güvenilir', icon: '🛡️', desc: 'Değerlendirmelerin güven veriyor' },
  { id: 'mudavim', name: 'Müdavim', icon: '🫖', desc: 'Aynı mekâna 5 katkı yap' },
];
export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

const SOUPS = new Set(['beyran', 'mercimek_corbasi', 'iskembe', 'kelle_paca']);
const HW = new Set(['hirdavat', 'yapi_market', 'tesisat', 'elektrik', 'boya']);

/**
 * Kullanıcının olay geçmişinden istatistik, rozet ve lakapları üretir.
 * stats girişi: { confirms, rates, photos, newPins, reports, accepted, places:Set, perPlace:Map, nightOwl, soups:Set, hw }
 */
export function badgesFrom(st, trusted) {
  const got = new Set();
  const total = st.confirms + st.rates + st.reports + st.helpsAsked + st.answers + st.addedPlaces;
  if (total > 0) got.add('ilk_adim');
  if (st.photos >= 10) got.add('fotografci');
  if (st.newPins >= 5) got.add('dedektif');
  if (st.accepted >= 1) got.add('yardimsever');
  if (st.accepted >= 10) got.add('benden_sorulur');
  if (st.places.size >= 10) got.add('kasif');
  if (st.nightOwl) got.add('gece_kusu');
  if (st.soups.size >= 3) got.add('corbaci');
  if (st.hw >= 5) got.add('usta');
  if (st.reports >= 3) got.add('goz_kulak');
  if (trusted) got.add('guvenilir');
  if ([...st.perPlace.values()].some((c) => c >= 5)) got.add('mudavim');
  return got;
}

export function emptyStats() {
  return {
    confirms: 0, rates: 0, photos: 0, newPins: 0, reports: 0, helpsAsked: 0, answers: 0, accepted: 0,
    addedPlaces: 0, xp: 0, places: new Set(), perPlace: new Map(), perMah: new Map(), nightOwl: false,
    soups: new Set(), hw: 0,
  };
}

export function noteActivity(st, place, t) {
  if (!place) return;
  st.places.add(place.id);
  st.perPlace.set(place.id, (st.perPlace.get(place.id) || 0) + 1);
  if (place.mah >= 0) st.perMah.set(place.mah, (st.perMah.get(place.mah) || 0) + 1);
  const h = new Date(t).getHours();
  if (h < 5) st.nightOwl = true;
}

export { SOUPS, HW };

// Unvan isimleri: mekân -> Müdavim, mahalle -> Kurdu, semt (ilçe) -> Piri
export const TITLE_RULES = {
  place: (name) => `${name} müdavimi`,
  mah: (name) => `${name} kurdu`,
  district: (name) => `${name} piri`,
};

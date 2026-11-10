// DEMO: simüle topluluk verisi. Gerçek dükkanların üzerine, açıkça "demo" etiketli,
// sahte kullanıcıların katkılarını üretir. Her açılışta aynı (deterministik) çıkar.
import { CATEGORIES, PRODUCTS_BY_CAT, PRODUCT_BY_ID, inSeason } from '../data/catalog.js';

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const DAY = 86400000;

const NICKS = [
  'beyrancı_41', 'Çaycı Abi', 'Nalbur Necmi', 'kebapkurdu', 'Simitçi Selin', 'Gezgin Gamze', 'Hırdavat Hakan',
  'pizza_avcısı', 'Manav Meltem', 'Darıcalı Deniz', 'Gebzeli Gökhan', 'Bayramoğlu Bilge', 'tamirci_tarık',
  'Kırtasiye Kader', 'Terzi Tülay', 'Çiçekçi Çiğdem', 'sokak_lezzeti', 'Gece Kuşu', 'Usta Ufuk', 'Lokantacı Leyla',
  'km0_kaşif', 'çorbasever', 'Oto Orhan', 'Pazar Perisi', 'Kitap Kurdu Kerem', 'Esnaf Dostu Eda', 'ızgara_ilker',
  'Tatlı Tutkunu', 'Balıkçı Barış', 'Mahallenin Kızı', 'şehir_faresi', 'Yürüyüşçü Yasin', 'kahve_molası',
  'Fırıncı Fatma', 'Akşamcı Ahmet', 'Sabahçı Sena',
];
const EMOJI = ['🦊', '🐻', '🦉', '🐢', '🐝', '🦁', '🐧', '🐙', '🦄', '🐼', '🐸', '🐨', '🦔', '🐳', '🦜', '🐞', '🐺', '🐯'];
const COLORS = ['#F97316', '#0EA5E9', '#22C55E', '#A855F7', '#EF4444', '#14B8A6', '#EAB308', '#EC4899', '#6366F1', '#84CC16'];
// persona: bias = cömertlik, sd = dağınıklık
const PERSONAS = { dengeli: { bias: 0, sd: 0.35 }, comert: { bias: 0.9, sd: 0.35 }, sert: { bias: -0.8, sd: 0.4 }, rastgele: { bias: 0, sd: 0, random: true }, hep5: { bias: 0, sd: 0, always5: true } };

const FOOD_TEXT = ['Taze ve sıcaktı.', 'Porsiyonu doyurucu.', 'Fiyatına göre gayet iyi.', 'Tekrar gelirim.', 'Lezzeti yerindeydi.', 'Biraz bekledik ama değdi.', 'Mahallenin en iyilerinden.', 'Sıcak servis edildi, güzeldi.', 'Akşam saatinde de vardı.', 'Ustası işini biliyor.'];
const ITEM_TEXT = ['Stokta vardı, çeşit fazla.', 'Esnaf yardımcı oldu.', 'Fiyat makul.', 'Rafta gördüm.', 'Birkaç boy seçeneği var.', 'Sorunca depodan getirdi.', 'Hemen buldum.'];
const NOTES = { civata: ["12'lik ve 14'lük var, bronz da var", 'M8-M10 çelik, paslanmaz da var', "Bronz cıvata 12'lik mevcut"], klima_gider: ['16 mm ve 20 mm var', 'Metre ile satıyor'], renkli_a4: ['Mavi, sarı, pembe var', 'Mavi A4 paket ve tek tek'], fermuar: ['Gizli fermuar 60 cm var', 'Mont fermuarı da takıyor'], kornis: ['2 m ve 3 m rustik var', 'Ölçüye kesiyor'], gul_buketi: ['11 ve 21 gül buket var', 'Gece 22:00’ye kadar açık'], erik: ['Can erik vardı (yaz)'] };

// Öne çıkan ürünler: bu kategorilerde görünme olasılığı yüksek
const SHOWCASE = { corbaci: { beyran: 0.55 }, kebapci: { beyran: 0.25 }, lokanta: { beyran: 0.15 }, pizzaci: { havai_pizza: 0.5 }, tesisat: { klima_gider: 0.6 }, hirdavat: { klima_gider: 0.35, civata: 0.7, kornis: 0.2 }, yapi_market: { civata: 0.5, kornis: 0.4, klima_gider: 0.3 }, kirtasiye: { renkli_a4: 0.6 }, tuhafiye: { fermuar: 0.7 }, terzi: { fermuar: 0.5 }, perde: { kornis: 0.6 }, cicekci: { gul_buketi: 0.75 }, manav: { erik: 0.5, domates: 0.8, biber: 0.7, salatalik: 0.7 } };

export function makeSimUsers(mahCount) {
  const r = rng(42);
  const users = [];
  NICKS.forEach((nick, i) => {
    const persona = i < 22 ? 'dengeli' : i < 27 ? 'comert' : i < 30 ? 'sert' : i < 33 ? 'rastgele' : 'hep5';
    users.push({
      id: `s${i}`, nick, sim: true, persona, emoji: EMOJI[i % EMOJI.length], color: COLORS[i % COLORS.length],
      home: mahCount ? Math.floor(r() * mahCount) : -1, baseXp: Math.floor(r() ** 2 * 2600), active: 0.3 + r() * 0.7,
    });
    users[users.length - 1].baseHelped = Math.floor((users[users.length - 1].baseXp / 90) * r());
  });
  return users;
}

function ratingFor(r, persona, q) {
  const p = PERSONAS[persona];
  let v;
  if (p.always5) v = 5;
  else if (p.random) v = 2 + r() * 3;
  else {
    // yaklaşık normal gürültü
    const n = (r() + r() + r() - 1.5) * 1.2;
    v = q + p.bias + n * p.sd * 1.2;
  }
  v = Math.round(v * 2) / 2;
  return Math.max(2, Math.min(5, v));
}

/** places: [{id,cat,mah,...}], users: sim users. Döner: offers Map, reports */
export function generateSim(places, users, now = Date.now()) {
  const offers = new Map();
  const byMah = new Map();
  for (const u of users) (byMah.get(u.home) || byMah.set(u.home, []).get(u.home)).push(u);
  const month = new Date(now).getMonth() + 1;

  for (const pl of places) {
    const cat = CATEGORIES[pl.cat];
    if (!cat) continue;
    const r = rng(hash(pl.id));
    const pChoose = cat.food ? 0.32 : 0.2;
    const show = SHOWCASE[pl.cat] || {};
    const showHit = Object.entries(show).filter(([, p]) => r() < p).map(([pid]) => pid);
    if (r() > pChoose && !showHit.length) continue;
    const pool = (PRODUCTS_BY_CAT[pl.cat] || []).filter((x) => !showHit.includes(x));
    const extra = Math.floor(r() * 3) + (showHit.length ? 0 : 1);
    const chosen = [...showHit];
    for (let k = 0; k < extra && pool.length; k++) {
      const pid = pool.splice(Math.floor(r() * pool.length), 1)[0];
      chosen.push(pid);
    }
    const storeQ = 3.3 + r() * 1.3; // dükkanın gerçek (gizli) kalitesi
    for (const pid of chosen) {
      const prod = PRODUCT_BY_ID[pid];
      const key = `${pl.id}|${pid}`;
      const rr = rng(hash(key));
      const x = rr();
      const count = x < 0.58 ? 1 + Math.floor(rr() * 4) : x < 0.92 ? 5 + Math.floor(rr() * 40) : 51 + Math.floor(rr() * 40);
      let lastAgo;
      const f = rr();
      if (!inSeason(prod, month)) {
        // mevsim dışı: en son, mevsimin son ayında görüldü
        let k = 1;
        while (k < 12 && !prod.season.includes((((month - k - 1) % 12) + 12) % 12 + 1)) k++;
        lastAgo = (k * 30 - 15 + rr() * 10) * DAY;
      } else lastAgo = f < 0.7 ? rr() * 20 * DAY : f < 0.9 ? (20 + rr() * 40) * DAY : (60 + rr() * 90) * DAY;
      const last = now - lastAgo;
      const span = (10 + rr() * 200) * DAY;
      const local = byMah.get(pl.mah) || [];
      const confirms = [];
      for (let k = 0; k < count; k++) {
        const u = local.length && rr() < 0.6 ? pick(rr, local) : pick(rr, users);
        const t = k === count - 1 ? last : last - rr() * span;
        const note = NOTES[pid] && rr() < 0.4 ? pick(rr, NOTES[pid]) : '';
        confirms.push({ u: u.id, t, sim: true, note, photo: false });
      }
      confirms.sort((a, b) => a.t - b.t);
      const ratings = [];
      if (cat.food || rr() < 0.25) {
        const q = Math.max(2.6, Math.min(4.9, storeQ + (rr() - 0.5) * 0.8));
        const nR = cat.food ? Math.min(users.length - 1, Math.round(count * (0.3 + rr() * 0.6))) : Math.min(3, Math.floor(count / 3));
        const used = new Set();
        for (let k = 0; k < nR; k++) {
          let u = local.length && rr() < 0.5 ? pick(rr, local) : pick(rr, users);
          let guard = 0;
          while (used.has(u.id) && guard++ < 10) u = pick(rr, users);
          if (used.has(u.id)) continue;
          used.add(u.id);
          const text = rr() < 0.5 ? pick(rr, cat.food ? FOOD_TEXT : ITEM_TEXT) : '';
          ratings.push({ u: u.id, r: ratingFor(rr, u.persona, q), t: last - rr() * span, text, sim: true, photo: false });
        }
      }
      const reports = [];
      if (now - last > 60 * DAY && rr() < 0.5) {
        const nRep = 1 + Math.floor(rr() * 2);
        for (let k = 0; k < nRep; k++) reports.push({ u: pick(rr, users).id, t: now - rr() * 20 * DAY, sim: true });
      }
      offers.set(key, { key, placeId: pl.id, productId: pid, confirms, ratings, reports, closed: false, sim: true });
    }
  }
  return offers;
}

// Sabit simüle yardım çağrıları (bölgedeki gerçek dükkanların yakınına)
const HELP_TEXTS = [
  ["12'lik bronz cıvata lazım, 20 tane", 'civata'], ['Klima gider borusu (16 mm) nereden bulurum?', 'klima_gider'],
  ['Gece erik bulan var mı? Eşim hamile 🙏', 'erik'], ['Mavi A4 kağıdı, 1 paket', 'renkli_a4'],
  ['2 metrelik perde kornişi', 'kornis'], ['Mont için 60 cm gizli fermuar', 'fermuar'], ['Yakında havai pizza yapan yer?', 'havai_pizza'],
  ['Akşam 9’dan sonra gül buketi', 'gul_buketi'], ['Golf için H7 far ampulü', 'far_ampulu'], ['Usb-c şarj kablosu, acil', 'sarj_kablosu'],
];

export function simHelpNear(lat, lon, users, now = Date.now(), count = 4) {
  const cell = `${Math.round(lat * 100)}_${Math.round(lon * 100)}`;
  const day = Math.floor(now / DAY);
  const r = rng(hash(`help_${cell}_${day}`));
  const out = [];
  for (let k = 0; k < count; k++) {
    const [text, pid] = HELP_TEXTS[Math.floor(r() * HELP_TEXTS.length)];
    if (out.some((h) => h.productId === pid)) continue;
    const ang = r() * Math.PI * 2;
    const dist = 150 + r() * 1100;
    out.push({
      id: `nh_${cell}_${day}_${k}`, u: pick(r, users).id, sim: true, text, productId: pid,
      lat: lat + (Math.cos(ang) * dist) / 111000, lon: lon + (Math.sin(ang) * dist) / (111000 * Math.cos((lat * Math.PI) / 180)),
      t: now - r() * 5 * 3600000, answers: [], status: 'open',
    });
  }
  return out;
}

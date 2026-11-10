// Müdavim puan motoru (kullanıcıya gösterilmeyen, gizli algoritma)
//
// 1) Kullanıcı sapması (cömertlik/sertlik): kişinin puanı ile AYNI ürünü puanlayan diğerlerinin
//    ortalaması arasındaki ortalama fark. Sadece en az MIN_OTHERS başka puan almış ürünler sayılır,
//    kişinin kendi puanı ortalamaya katılmaz.
// 2) Kullanıcı ağırlığı (isabet): sapma düzeltildikten sonra kalan dağınıklık ne kadar azsa ağırlık o kadar yüksek.
//    Az karşılaştırması olan yeni kullanıcı varsayılan ağırlığa (1) yakın tutulur.
// 3) Ürün puanı: düzeltilmiş puanların ağırlıklı ortalaması, az puanlı üründe dükkan puanına yaslanır (Bayes).
// 4) Dükkan puanı: dükkanın ürün puanlarının kanıt (toplam ağırlık) oranında ortalaması; genel ortalamaya yaslanır.
//    Dışarıdan (Google vb.) puan alınmaz, tamamen içeriden büyür.

export const MIN_OTHERS = 5;
const BIAS_SHRINK = 5; // sapma tahmininde kaç karşılaştırmadan sonra tam güvenilir
const WEIGHT_SHRINK = 6;
const ITEM_PRIOR_M = 1.5; // ürün puanının dükkan puanına yaslanma gücü
const STORE_PRIOR_M = 3;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * @param {Map<string, {ratings: {u:string, r:number}[]}>} offers  key -> offer
 * @returns {{ user: Map, offer: Map, store: Map, global: number }}
 */
export function computeScores(offers, placeOf) {
  // tüm puanları düz liste
  const items = [];
  for (const [key, o] of offers) {
    if (o.closed || !o.ratings.length) continue;
    items.push({ key, place: placeOf(key), ratings: o.ratings });
  }
  const user = new Map(); // u -> {bias, weight, n, rmse}
  const W = (u) => user.get(u)?.weight ?? 1;
  const B = (u) => user.get(u)?.bias ?? 0;

  let global = 3.8;
  for (let iter = 0; iter < 4; iter++) {
    // a) ürün bazında ağırlıklı toplamlar
    const sums = new Map();
    let gs = 0;
    let gw = 0;
    for (const it of items) {
      let sw = 0;
      let sr = 0;
      for (const x of it.ratings) {
        const w = W(x.u);
        const r = clamp(x.r - B(x.u), 0.5, 5);
        sw += w;
        sr += w * r;
      }
      sums.set(it.key, { sw, sr });
      gs += sr;
      gw += sw;
    }
    if (gw > 0) global = gs / gw;
    // b) kullanıcı sapma ve ağırlıkları
    const resid = new Map(); // u -> [{d, own, other}]
    for (const it of items) {
      if (it.ratings.length < MIN_OTHERS + 1) continue;
      const { sw, sr } = sums.get(it.key);
      for (const x of it.ratings) {
        const w = W(x.u);
        const r = clamp(x.r - B(x.u), 0.5, 5);
        const otherMean = (sr - w * r) / (sw - w); // kişinin kendi puanı hariç
        if (!isFinite(otherMean)) continue;
        (resid.get(x.u) || resid.set(x.u, []).get(x.u)).push({ d: x.r - otherMean, own: x.r, other: otherMean });
      }
    }
    const std = (arr) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
    };
    const next = new Map();
    for (const [u, rs] of resid) {
      const n = rs.length;
      const ds = rs.map((x) => x.d);
      const mean = ds.reduce((a, b) => a + b, 0) / n;
      const bias = (mean * n) / (n + BIAS_SHRINK);
      const v = ds.reduce((a, d) => a + (d - bias) ** 2, 0) / n;
      // Ayırt edicilik: her şeye aynı puanı veren (ör. hep 5) kişinin puanı bilgi taşımaz
      const disc = n >= 3 ? clamp(std(rs.map((x) => x.own)) / Math.max(0.25, std(rs.map((x) => x.other))), 0, 1) : 1;
      const raw = clamp((0.75 / (v + 0.25)) * (0.15 + 0.85 * disc), 0.15, 2.5);
      const weight = (n * raw + WEIGHT_SHRINK * 1) / (n + WEIGHT_SHRINK);
      const rmse = Math.sqrt(ds.reduce((a, d) => a + d * d, 0) / n);
      next.set(u, { bias, weight, n, rmse, spread: Math.sqrt(v), disc });
    }
    user.clear();
    for (const [u, v] of next) user.set(u, v);
  }

  // c) dükkan puanları (ürünlerin ham ağırlıklı ortalamalarından)
  const raw = new Map();
  const storeAcc = new Map();
  for (const it of items) {
    let sw = 0;
    let sr = 0;
    for (const x of it.ratings) {
      const w = W(x.u);
      sw += w;
      sr += w * clamp(x.r - B(x.u), 0.5, 5);
    }
    raw.set(it.key, { sw, mean: sr / sw, n: it.ratings.length });
    const acc = storeAcc.get(it.place) || { sw: 0, sr: 0, n: 0, items: 0 };
    acc.sw += sw;
    acc.sr += sr;
    acc.n += it.ratings.length;
    acc.items += 1;
    storeAcc.set(it.place, acc);
  }
  const store = new Map();
  for (const [p, a] of storeAcc) {
    const score = (a.sr + STORE_PRIOR_M * global) / (a.sw + STORE_PRIOR_M);
    store.set(p, { score, n: a.n, items: a.items });
  }
  // d) ürün puanları: dükkan puanına yaslanan Bayes ortalaması
  const offer = new Map();
  for (const it of items) {
    const r = raw.get(it.key);
    const prior = store.get(it.place)?.score ?? global;
    const score = (r.mean * r.sw + ITEM_PRIOR_M * prior) / (r.sw + ITEM_PRIOR_M);
    offer.set(it.key, { score, n: r.n, rawMean: r.mean, prior });
  }
  return { user, offer, store, global };
}

// Kullanıcıya görünen "güvenilir" rozeti için (nedeni gösterilmez)
export function isTrusted(u) {
  return !!u && u.n >= MIN_OTHERS && u.weight >= 1.25;
}

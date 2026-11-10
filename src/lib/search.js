import { PRODUCTS, CATEGORIES, inSeason } from '../data/catalog.js';
import { S, offerInfo, storeScore, productOf } from './state.js';
import { norm, matchScore, isOpenNow } from './text.js';
import { distance } from './geo.js';

const syn = (p) => [p.name, ...(p.syn || [])].map(norm);

export function matchProducts(q) {
  const qn = norm(q);
  if (qn.length < 2) return [];
  const all = [...PRODUCTS, ...S.customProducts.values()];
  const scored = [];
  for (const p of all) {
    let best = 0;
    for (const t of syn(p)) best = Math.max(best, matchScore(qn, t));
    if (best >= 0.7) scored.push({ p, s: best });
  }
  scored.sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  const top = scored[0].s;
  return scored.filter((x) => x.s >= top - 0.06).slice(0, 4);
}

export function matchCategories(q) {
  const qn = norm(q);
  const out = [];
  for (const [k, c] of Object.entries(CATEGORIES)) {
    const s = Math.max(matchScore(qn, norm(c.name)), matchScore(qn, norm(c.name.split(' ')[0])));
    if (s >= 0.8) out.push({ k, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 2);
}

// Sorgudaki ürün adı dışındaki kelimeler (ör. "12'lik bronz") – notlarda aranır
function variantTokens(qn, prods) {
  const words = new Set(prods.flatMap((x) => syn(x.p).flatMap((t) => t.split(' '))));
  return qn.split(' ').filter((w) => w.length >= 2 && !words.has(w));
}

/**
 * @returns {{products, cats, results:Array}}
 */
export function search(q, from, { sort = 'onerilen', openNow = false } = {}) {
  const qn = norm(q);
  const prods = matchProducts(q);
  const cats = prods.length ? [] : matchCategories(q);
  const [lat, lon] = from;
  const results = [];
  const vt = variantTokens(qn, prods);
  const month = new Date().getMonth() + 1;

  const placeOk = (pl) => pl && !S.closedPlaces.has(pl.id);
  const openState = (pl) => isOpenNow(pl.hours);

  for (const { p } of prods) {
    const have = new Set();
    for (const o of S.offers.values()) {
      if (o.productId !== p.id || o.closed) continue;
      const pl = S.placeById.get(o.placeId);
      if (!placeOk(pl)) continue;
      const d = distance(lat, lon, pl.lat, pl.lon);
      if (d > 20000) continue;
      have.add(pl.id);
      const inf = offerInfo(o);
      const fresh = { fresh: 1, aging: 0.6, stale: 0.2, none: 0.5 }[inf.fresh.cls];
      const sc = inf.score?.score;
      const notes = o.confirms.map((c) => c.note).filter(Boolean);
      const vHit = vt.length ? notes.find((n) => vt.every((w) => norm(n).includes(w))) : null;
      const rank = inf.level.lv * 1.2 * fresh + (sc ? (sc - 3.6) * 0.9 : 0) + 1.5 + (vHit ? 1 : 0) - 0.9 * Math.log(1 + d / 1000);
      results.push({ kind: 'offer', place: pl, product: p, offer: o, inf, score: sc, d, rank, note: vHit || notes[notes.length - 1] || '', open: openState(pl) });
    }
    // Veri yoksa: kategoriden tahmin
    const season = inSeason(p, month);
    for (const pl of S.places) {
      if (!placeOk(pl) || have.has(pl.id) || !p.cats.includes(pl.cat)) continue;
      const d = distance(lat, lon, pl.lat, pl.lon);
      if (d > 6000) continue;
      const ss = storeScore(pl.id)?.score;
      const rank = 0.3 + (ss ? (ss - 3.6) * 0.4 : 0) - 0.9 * Math.log(1 + d / 1000) - (season ? 0 : 1.2) - p.cats.indexOf(pl.cat) * 0.15;
      results.push({ kind: 'infer', place: pl, product: p, score: null, storeScore: ss, d, rank, season, open: openState(pl) });
    }
  }
  for (const { k } of cats) {
    for (const pl of S.places) {
      if (!placeOk(pl) || pl.cat !== k) continue;
      const d = distance(lat, lon, pl.lat, pl.lon);
      if (d > 15000) continue;
      const ss = storeScore(pl.id)?.score;
      results.push({ kind: 'place', place: pl, d, score: ss, rank: (ss ? (ss - 3.6) * 0.5 : 0) - 0.9 * Math.log(1 + d / 1000), open: openState(pl) });
    }
  }
  // dükkan adıyla arama (ürün bulunduysa sadece çok güçlü isim eşleşmeleri)
  if (qn.length >= 3) {
    const minS = prods.length || cats.length ? 0.88 : 0.75;
    for (const pl of S.places) {
      if (!placeOk(pl) || !pl.name) continue;
      const s = matchScore(qn, norm(pl.name));
      if (s < minS) continue;
      const d = distance(lat, lon, pl.lat, pl.lon);
      results.push({ kind: 'place', place: pl, d, score: storeScore(pl.id)?.score, rank: s * 2 - 0.9 * Math.log(1 + d / 1000), open: openState(pl) });
    }
  }
  let list = results;
  if (openNow) list = list.filter((r) => r.open !== false);
  if (sort === 'yakin') list.sort((a, b) => a.d - b.d);
  else if (sort === 'puan') list.sort((a, b) => (b.score ?? b.storeScore ?? 0) - (a.score ?? a.storeScore ?? 0) || a.d - b.d);
  else list.sort((a, b) => b.rank - a.rank);
  // tahminleri sınırla
  let inferN = 0;
  list = list.filter((r) => r.kind !== 'infer' || inferN++ < 30).slice(0, 80);
  return { products: prods.map((x) => x.p), cats: cats.map((c) => c.k), results: list, variant: vt };
}

export function productName(id) {
  return productOf(id).name;
}

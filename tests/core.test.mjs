import fs from 'fs';
import { S, rebuild, init, addEvent, offerInfo, myProgress, adminQueue, progressOf } from '../src/lib/state.js';
import { search } from '../src/lib/search.js';
import { isOpenNow, norm, matchScore } from '../src/lib/text.js';
const js = JSON.parse(fs.readFileSync('tests/places_fixture.json'));
S.meta = js; S.mahalle = js.mahalle; S.districts = js.districts;
S.places = js.places.map(r => ({ id: r[0], name: r[1], cat: r[2], lat: r[3], lon: r[4], mah: r[5], addr: r[6], hours: r[7], src: r[8] }));
S.center = [40.79, 29.40];
let t = Date.now();
await init();
console.log('init ms', Date.now() - t, 'offers', S.offers.size, 'help', S.help.size, 'users', S.users.size);
let nr = 0; for (const o of S.offers.values()) nr += o.ratings.length; console.log('ratings', nr);
// engine: persona checks
const u = [...S.scores.user.entries()].map(([id, v]) => ({ id, persona: S.users.get(id)?.persona, ...v }));
const by = {}; for (const x of u) { (by[x.persona] ||= []).push(x); }
for (const [p, arr] of Object.entries(by)) console.log(p.padEnd(9), 'n', arr.length, 'bias', (arr.reduce((a, b) => a + b.bias, 0) / arr.length).toFixed(2), 'weight', (arr.reduce((a, b) => a + b.weight, 0) / arr.length).toFixed(2), 'cmp', Math.round(arr.reduce((a, b) => a + b.n, 0) / arr.length));
for (const q of ['beyran', 'beyran çorbası', 'havai', 'HAWAİİ pizza', "12'lik bronz cıvata", 'klima gider borusu', 'mavi a4', 'erik', 'hırdavatçı', 'fermuar', 'korniş', 'Test pizza 5']) {
  const r = search(q, S.center);
  const top = r.results[0];
  console.log(q.padEnd(22), '| ürün:', r.products.map(p => p.name).join(','), '| kat:', r.cats.join(','), '| sonuç', r.results.length, '| ilk:', top ? `${top.kind} ${top.place.name} ${top.inf ? top.inf.level.name + ' ' + top.inf.count + ' ' + top.inf.fresh.cls : ''} ${top.score ? top.score.toFixed(2) : ''} ${Math.round(top.d)}m ${top.note || ''}` : '-');
}
// events
const pl = S.places[0];
let res = await addEvent({ type: 'confirm', placeId: pl.id, productId: 'civata', note: "12'lik bronz" });
console.log('confirm ->', res);
res = await addEvent({ type: 'rate', placeId: pl.id, productId: 'civata', r: 4, text: 'Uzun yorum burada yazıyor olsun' });
console.log('rate ->', res, myProgress().level.name, myProgress().xp);
const h = [...S.help.values()][0];
res = await addEvent({ type: 'answer', id: 'a1', helpId: h.id, placeId: pl.id });
res = await addEvent({ type: 'simResolve', helpId: h.id, answerId: 'a1', ok: true });
console.log('accepted ->', res, myProgress().badges);
console.log('admin queue', adminQueue().length);
console.log('open', isOpenNow('Mo-Sa 09:00-20:00', new Date('2026-11-10T12:00')), isOpenNow('Mo-Sa 09:00-20:00; Su off', new Date('2026-11-15T12:00')), isOpenNow('24/7'), isOpenNow('Mo-Fr 08:00-12:00,13:00-18:00', new Date('2026-11-10T12:30')), isOpenNow('sunrise-sunset'));
console.log('titles', [...S.titles.entries()].slice(0, 5).map(([u, t]) => u + ':' + t.map(x => x.text).join('/')).join(' | '));
console.log('mahBoard', [...S.mahBoard.entries()].slice(0,2).map(([m, rows]) => m + ':' + rows.slice(0,3).map(r => r.u + '=' + r.score).join(',')).join(' | '));

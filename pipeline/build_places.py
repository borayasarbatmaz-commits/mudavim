"""OSM + Overture verisini birleştirip uygulamanın okuyacağı places.json dosyasını üretir.

Kullanım: python pipeline/build_places.py osm.json overture.geojson cikti/places.json
Overture dosyası yoksa sadece OSM ile devam eder.
"""
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher

from categories import name_hint, osm_category, overture_category
from region import BBOX

TR_MAP = str.maketrans("çğıöşüÇĞİÖŞÜâîû", "cgiosuCGIOSUaiu")
STOP = {"ltd", "sti", "san", "tic", "ve", "a.s", "as", "subesi", "sube", "magazasi", "magaza", "market", "the"}


def norm(s):
    s = (s or "").translate(TR_MAP).lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(t for t in s.split() if t not in STOP)


def sim(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 0.9
    return SequenceMatcher(None, a, b).ratio()


def dist_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def maybe_json(v):
    if isinstance(v, str) and v[:1] in "[{":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def load_osm(path):
    with open(path, encoding="utf-8") as f:
        js = json.load(f)
    places, localities = [], []
    for el in js["elements"]:
        tags = el.get("tags") or {}
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        if tags.get("place"):
            nm = tags.get("name:tr") or tags.get("name")
            if nm:
                localities.append({"name": nm, "kind": tags["place"], "lat": lat, "lon": lon})
            continue
        cat = osm_category(tags)
        if not cat:
            continue
        name = tags.get("name:tr") or tags.get("name") or tags.get("brand") or ""
        addr = " ".join(x for x in [tags.get("addr:street"), tags.get("addr:housenumber")] if x)
        places.append({
            "id": f"o{el['type'][0]}{el['id']}",
            "name": name.strip(), "cat": cat, "lat": lat, "lon": lon,
            "addr": addr, "hours": tags.get("opening_hours", ""), "src": 1,
        })
    return places, localities


def load_overture(path):
    if not path or not os.path.exists(path):
        print("Overture dosyasi yok, sadece OSM kullaniliyor")
        return []
    with open(path, encoding="utf-8") as f:
        js = json.load(f)
    out = []
    for ft in js.get("features", []):
        pr = ft.get("properties") or {}
        geom = ft.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        lon, lat = geom["coordinates"][:2]
        status = (pr.get("operating_status") or "").lower()
        if "closed" in status:
            continue
        conf = pr.get("confidence") or 0
        names = maybe_json(pr.get("names")) or {}
        name = names.get("primary") if isinstance(names, dict) else None
        if not name:
            continue
        cats = maybe_json(pr.get("categories")) or {}
        primary = cats.get("primary") if isinstance(cats, dict) else None
        basic = pr.get("basic_category")
        tax = maybe_json(pr.get("taxonomy")) or {}
        tax_primary = tax.get("primary") if isinstance(tax, dict) else None
        cat = None
        for c in (primary, tax_primary, basic):
            cat = overture_category(c)
            if cat:
                break
        if not cat:
            continue
        hint = name_hint(name)
        if hint and cat in ("restoran", "fastfood"):
            cat = hint
        addrs = maybe_json(pr.get("addresses")) or []
        addr = addrs[0].get("freeform", "") if addrs and isinstance(addrs[0], dict) else ""
        srcs = maybe_json(pr.get("sources")) or []
        datasets = sorted({s.get("dataset", "") for s in srcs if isinstance(s, dict)})
        oid = pr.get("id") or ft.get("id") or f"{lat},{lon},{name}"
        out.append({
            "id": "v" + hashlib.sha1(str(oid).encode()).hexdigest()[:10],
            "name": name.strip(), "cat": cat, "lat": lat, "lon": lon, "addr": addr or "",
            "hours": "", "src": 2, "conf": conf, "datasets": datasets,
        })
    return out


def merge(osm, ov):
    cell = 0.001
    grid = {}
    for p in osm:
        grid.setdefault((int(p["lat"] / cell), int(p["lon"] / cell)), []).append(p)
    added, matched, low = 0, 0, 0
    merged = list(osm)
    for q in ov:
        ci, cj = int(q["lat"] / cell), int(q["lon"] / cell)
        best, best_s = None, 0
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for p in grid.get((ci + di, cj + dj), []):
                    d = dist_m(p["lat"], p["lon"], q["lat"], q["lon"])
                    if d > 80:
                        continue
                    s = sim(p["name"], q["name"]) if p["name"] else (0.7 if p["cat"] == q["cat"] and d < 25 else 0)
                    if s > best_s:
                        best, best_s = p, s
        if best and best_s >= 0.62:
            best["src"] |= 2
            if not best["name"]:
                best["name"] = q["name"]
            if not best["addr"] and q["addr"]:
                best["addr"] = q["addr"]
            matched += 1
            continue
        if q["conf"] < 0.55:
            low += 1
            continue
        merged.append(q)
        grid.setdefault((ci, cj), []).append(q)
        added += 1
    print(f"Overture: {matched} eslesti, {added} yeni eklendi, {low} dusuk guvenle atlandi")
    return merged


def assign_localities(places, localities):
    mah = [l for l in localities if l["kind"] in ("neighbourhood", "suburb", "quarter", "village")]
    towns = [l for l in localities if l["kind"] in ("town", "city")]
    districts = sorted({t["name"] for t in towns})
    d_index = {n: i for i, n in enumerate(districts)}

    def nearest(lst, lat, lon, maxd):
        best, bd = None, maxd
        for l in lst:
            d = dist_m(lat, lon, l["lat"], l["lon"])
            if d < bd:
                best, bd = l, d
        return best

    mah_rows, mah_index = [], {}
    for m in mah:
        t = nearest(towns, m["lat"], m["lon"], 15000)
        key = (m["name"], round(m["lat"], 3), round(m["lon"], 3))
        if key in mah_index:
            continue
        mah_index[key] = len(mah_rows)
        mah_rows.append([m["name"], round(m["lat"], 5), round(m["lon"], 5), d_index[t["name"]] if t else -1])
    for p in places:
        m = nearest(mah, p["lat"], p["lon"], 2500)
        p["mah"] = mah_index.get((m["name"], round(m["lat"], 3), round(m["lon"], 3)), -1) if m else -1
    return mah_rows, districts


def main():
    osm_path, ov_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    osm, localities = load_osm(osm_path)
    print(f"OSM: {len(osm)} dukkan, {len(localities)} yerlesim noktasi")
    ov = load_overture(ov_path)
    print(f"Overture: {len(ov)} eslenebilir yer")
    places = merge(osm, ov)
    s, w, n, e = BBOX
    places = [p for p in places if s <= p["lat"] <= n and w <= p["lon"] <= e]
    mah_rows, districts = assign_localities(places, localities)
    places.sort(key=lambda p: p["id"])
    rows = [[p["id"], p["name"], p["cat"], round(p["lat"], 5), round(p["lon"], 5), p["mah"],
             p["addr"], p["hours"], p["src"]] for p in places]
    cats = {}
    for p in places:
        cats[p["cat"]] = cats.get(p["cat"], 0) + 1
    out = {
        "v": 1,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bbox": BBOX,
        "attribution": "© OpenStreetMap katkıcıları (ODbL) · Overture Maps Foundation (CDLA-Permissive 2.0, Foursquare kaynaklı kayıtlar Apache 2.0)",
        "counts": {"osm": sum(1 for p in places if p["src"] & 1), "overture": sum(1 for p in places if p["src"] & 2),
                   "total": len(places)},
        "categories": dict(sorted(cats.items(), key=lambda kv: -kv[1])),
        "districts": districts,
        "mahalle": mah_rows,
        "places": rows,
    }
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Toplam {len(rows)} yer, {len(mah_rows)} mahalle -> {out_path} ({os.path.getsize(out_path) // 1024} KB)")
    print("Kategoriler:", json.dumps(out["categories"], ensure_ascii=False))
    if len(rows) < 50:
        raise SystemExit("Cok az yer bulundu, veri hattinda sorun var")


if __name__ == "__main__":
    main()

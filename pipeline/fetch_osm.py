"""OpenStreetMap'ten (Overpass API) pilot bölgedeki dükkanları ve mahalle noktalarını çeker.

Kullanım: python pipeline/fetch_osm.py <cikti.json>
Bölge sınırı pipeline/region.py içinde.
"""
import json
import sys
import time
import urllib.parse
import urllib.request

from region import BBOX  # (south, west, north, east)

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

S, W, N, E = BBOX
BB = f"{S},{W},{N},{E}"

QUERY = f"""
[out:json][timeout:240];
(
  nwr["shop"]({BB});
  nwr["amenity"~"^(restaurant|fast_food|cafe|pharmacy|marketplace|ice_cream|fuel)$"]({BB});
  nwr["craft"~"^(tailor|shoemaker|key_cutter|upholsterer|dressmaker)$"]({BB});
);
out center tags;
(
  node["place"~"^(neighbourhood|suburb|quarter|village|town|city)$"]({BB});
  rel["boundary"="administrative"]["admin_level"~"^(6|8|9|10)$"]({BB});
);
out center tags;
"""


def fetch():
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    last_err = None
    for attempt in range(3):
        for url in MIRRORS:
            try:
                print(f"Overpass: {url} (deneme {attempt + 1})", flush=True)
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "mudavim-demo/0.1"})
                with urllib.request.urlopen(req, timeout=300) as r:
                    body = r.read()
                js = json.loads(body)
                if "elements" in js and len(js["elements"]) > 0:
                    return js
                last_err = f"bos cevap: {js.get('remark', '')}"
            except Exception as e:  # noqa: BLE001
                last_err = e
                print(f"  hata: {e}", flush=True)
        time.sleep(20)
    raise SystemExit(f"Overpass verisi alinamadi: {last_err}")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "osm.json"
    js = fetch()
    with open(out, "w", encoding="utf-8") as f:
        json.dump(js, f, ensure_ascii=False)
    print(f"OSM: {len(js['elements'])} oge -> {out}")

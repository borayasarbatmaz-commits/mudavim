# Müdavim (demo)

Dükkanı değil **ürünü** ara: beyran, 12'lik cıvata, mavi A4, klima gider borusu… Mahallende nerede olduğunu oraya gidenler söyler.

Demo adresi: https://borayasarbatmaz-commits.github.io/mudavim/ (Android'de Chrome ile aç, konum ve kamera izni ver; menüden "Ana ekrana ekle" ile uygulama gibi kullanılır.)

## Ne var

- **Ürün araması:** Türkçe karakter ve yazım farkına dayanıklı (havai / hawaii, beyran çorbası → beyran). Ürünü gören olmadıysa dükkan türünden **tahmin** gösterir. Mevsim dışı ürünleri (erik) işaretler. "Şu an açık" filtresi var.
- **Pin güven seviyeleri:** Tahmini (0) · Az teyitli (1–4) · Teyitli (5–50) · Güvenilir (50+). Her bilgide **son görülme** tarihi var. 30 günden eskisi solar, 90 günden eskisi "güncel değil" olur.
- **Katkı:** "Burada var" (teyit + not + fiyat + fotoğraf) ile "Puanla" (yarım yıldız + yorum + fotoğraf) ayrı işler. Katkı yalnızca dükkanın 150 m yakınındayken yapılabilir.
- **Gizli puan motoru** (`src/lib/engine.js`):
  - Her kullanıcının puanı, aynı ürünü puanlayan diğerlerinin ortalamasıyla karşılaştırılır. Kullanıcının kendi puanı bu ortalamaya katılmaz ve sadece en az 5 başka puan almış ürünler hesaba girer.
  - **Sapma** (hep cömert ya da hep sert verme) puandan düşülür.
  - Tutarlı puan veren daha yüksek **ağırlık** alır. Hep aynı puanı veren ya da rastgele veren düşük ağırlık alır.
  - Ürün puanı, az puanlı üründe **dükkan puanına** yaslanır (Bayes ortalaması). Dükkan puanı da ürünlerinin puanlarından oluşur.
  - Dışarıdan puan alınmaz.
- **Yardım pinleri:** Bulamadığın şey için haritaya "?" pini atarsın. Bilenler dükkanı gösterir. Sen teyit edince o dükkanda yeni bir pin doğar ve cevap veren +50 XP alır.
- **Oyunlaştırma:** 10 seviye, XP, 12 rozet, seviyeye göre çerçeve (bronz, gümüş, altın, efsane) ve unvanlar:
  - bir mekâna en çok katkı yapan → **"… müdavimi"**
  - mahallede bir numara olan → **"… kurdu"**
  - ilçede bir numara olan → **"… piri"**
  - Müdavimler panosu her mahalle için ayrı tutulur. Dükkan eklemek Seviye 5'te açılır.
- **Kaldırma talepleri:** 3 "burada yok / kapandı" bildirimi gelince pin yönetici onayına düşer.
- **Uygulama içi yol tarifi:** OSRM / OpenStreetMap ile çalışır.
  - Yürüme ve araç modu, Türkçe sesli komut, rotadan çıkınca yeniden hesaplama.
  - Varınca "AR ile göster / buldum / puanla" ekranı açılır. Kullanıcı başka uygulamaya geçmediği için akış kopmaz.
- **AR:** Kamera, GPS ve pusula ile dükkanın üstüne dev bir pin koyar.
  - Ekran dışındaysa yön oku ve radar gösterir.
  - Giriş kapısı işaretliyse onu da ayrıca gösterir.
  - **Hizala** düğmesiyle pusula sapması tek dokunuşla düzeltilir.

## Veri

GitHub Actions her yayında (ve her pazartesi) pilot bölge için gerçek dükkan verisini çeker (`pipeline/`):

- **OpenStreetMap** (Overpass): dükkanlar, restoranlar, mahalle noktaları (ODbL)
- **Overture Maps places**: Foursquare Open Source Places (Apache 2.0), Meta ve Microsoft kaynaklı kayıtlar (CDLA-Permissive 2.0)

İki kaynak isim benzerliği ve mesafeyle birleştirilir, Türkçe kategorilere eşlenir. Bölge `pipeline/region.py` dosyasında tanımlı: Darıca, Bayramoğlu, Çayırova, Gebze, Balçık, Dilovası.

Google verisi saklanmaz. Google yalnızca "Google Haritalar'da aç" bağlantısıyla kullanılır.

**Demo uyarısı:**

- Kullanıcı katkıları (teyitler, puanlar, yardım çağrıları, panodaki kullanıcılar) **simüledir** ve "demo" etiketi taşır.
- Senin katkıların yalnızca telefonunda (IndexedDB) saklanır.
- Profil → Demo araçları'ndan simülasyonu kapatabilir, konum kontrolünü kapatabilir, onay kuyruğunu ve gizli algoritmayı görebilirsin.

## Geliştirme

```bash
npm install
python3 tests/make_fixture.py && cd pipeline && python3 build_places.py ../tests/osm_fixture.json ../tests/overture_fixture.geojson ../public/data/places.json && cd ..
npm run dev
```

## Sonraki aşama (gerçek ürün)

- **Sunucu:** PostgreSQL + PostGIS, kimlik doğrulama, fotoğraf depolama. Puan motoru sunucuya taşınır, böylece gizli kalır.
- **Telefon uygulaması:** Flutter ya da React Native. Arka planda konum ile "vardın mı?" bildirimi gönderilir.
- **Gelişmiş AR:** ARCore Geospatial (Street View tabanlı VPS) ile yaklaşık 1 m doğruluk.
- **Hukuk:** KVKK aydınlatma metni ve konum için açık rıza.
- **Kendi harita altyapısı:** Teyit edilmiş dükkan ve ürün verisi zamanla kendi POI veritabanımız olur.
  - Dikkat: OSM'den türeyen veri paylaşıldığında ODbL'nin "aynı lisansla paylaş" şartı geçerli.
  - Foursquare ve Overture kayıtları serbest lisanslı.

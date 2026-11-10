"""OSM etiketleri ve Overture kategorilerini Müdavim kategorilerine eşler.

Kategori anahtarları src/data/catalog.js ile birebir aynı olmalı.
Eşlenemeyen yerler (ofis, okul, cami, banka vb.) veri setine alınmaz.
"""

# --- OSM ---------------------------------------------------------------

OSM_SHOP = {
    "hardware": "hirdavat", "doityourself": "yapi_market", "trade": "yapi_market",
    "paint": "boya", "electrical": "elektrik", "lighting": "elektrik", "bathroom_furnishing": "tesisat",
    "car_parts": "oto_parca", "tyres": "oto_parca", "car_repair": "oto_servis", "car": "oto_servis",
    "motorcycle": "oto_parca",
    "stationery": "kirtasiye", "copyshop": "kirtasiye", "books": "kitapci",
    "greengrocer": "manav", "farm": "manav",
    "supermarket": "market", "convenience": "market", "general": "market", "frozen_food": "market",
    "bakery": "firin", "pastry": "pastane", "confectionery": "tatlici", "chocolate": "tatlici",
    "butcher": "kasap", "deli": "sarkuteri", "cheese": "sarkuteri", "dairy": "sarkuteri",
    "nuts": "kuruyemis", "spices": "kuruyemis", "seafood": "balikci",
    "tea": "cay_kahve", "coffee": "cay_kahve", "beverages": "market", "water": "market",
    "clothes": "giyim", "fashion": "giyim", "boutique": "giyim", "baby_goods": "giyim",
    "shoes": "ayakkabi", "bag": "canta", "leather": "canta",
    "fabric": "tuhafiye", "sewing": "tuhafiye", "haberdashery": "tuhafiye", "wool": "tuhafiye",
    "tailor": "terzi", "curtain": "perde", "interior_decoration": "perde", "carpet": "perde",
    "florist": "cicekci", "garden_centre": "cicekci",
    "chemist": "kozmetik", "cosmetics": "kozmetik", "perfumery": "kozmetik", "beauty": "kozmetik",
    "electronics": "elektronik", "computer": "elektronik", "hifi": "elektronik",
    "mobile_phone": "telefoncu", "telecommunication": "telefoncu",
    "appliance": "beyaz_esya", "furniture": "mobilya", "bed": "mobilya", "kitchen": "mobilya",
    "houseware": "zuccaciye", "variety_store": "zuccaciye", "household_linen": "zuccaciye",
    "gift": "hediyelik", "toys": "oyuncak", "pet": "petshop",
    "jewelry": "kuyumcu", "optician": "optik",
    "kiosk": "bufe", "newsagent": "bufe", "tobacco": "bufe",
    "sports": "spor", "outdoor": "spor", "bicycle": "bisiklet",
    "medical_supply": "eczane", "herbalist": "kuruyemis",
    "glaziery": "yapi_market", "doors": "yapi_market", "tiles": "yapi_market",
    "locksmith": "anahtarci", "key_cutter": "anahtarci",
}

OSM_AMENITY = {
    "pharmacy": "eczane", "cafe": "kafe", "ice_cream": "tatlici", "marketplace": "pazar",
    "fuel": "akaryakit",
}

OSM_CRAFT = {
    "tailor": "terzi", "dressmaker": "terzi", "shoemaker": "ayakkabi",
    "key_cutter": "anahtarci", "upholsterer": "mobilya",
}

CUISINE_RULES = [
    ("pizza", "pizzaci"), ("kebab", "kebapci"), ("doner", "donerci"), ("döner", "donerci"),
    ("soup", "corbaci"), ("pide", "pideci"), ("lahmacun", "pideci"), ("burger", "fastfood"),
    ("chicken", "fastfood"), ("sandwich", "fastfood"), ("fish", "balikci_rest"), ("seafood", "balikci_rest"),
    ("turkish", "lokanta"), ("regional", "lokanta"), ("meat", "kebapci"), ("dessert", "tatlici"),
    ("coffee", "kafe"), ("tea", "kafe"), ("breakfast", "kafe"),
]


def osm_category(tags):
    shop = tags.get("shop")
    if shop:
        return OSM_SHOP.get(shop)
    craft = tags.get("craft")
    if craft:
        return OSM_CRAFT.get(craft)
    amenity = tags.get("amenity")
    if amenity in ("restaurant", "fast_food"):
        cuisine = (tags.get("cuisine") or "").lower()
        name = (tags.get("name") or "").lower()
        for key, cat in CUISINE_RULES:
            if key in cuisine:
                return cat
        cat = name_hint(name)
        if cat:
            return cat
        return "fastfood" if amenity == "fast_food" else "restoran"
    if amenity:
        return OSM_AMENITY.get(amenity)
    return None


# İsimden ipucu (OSM'de cuisine etiketi çoğu zaman boş)
NAME_HINTS = [
    ("pizza", "pizzaci"), ("kebap", "kebapci"), ("kebab", "kebapci"), ("ocakbaşı", "kebapci"),
    ("döner", "donerci"), ("doner", "donerci"), ("çorba", "corbaci"), ("corba", "corbaci"),
    ("pide", "pideci"), ("lahmacun", "pideci"), ("burger", "fastfood"), ("köfte", "kebapci"),
    ("lokanta", "lokanta"), ("ev yemek", "lokanta"), ("balık", "balikci_rest"), ("tatlı", "tatlici"),
    ("baklava", "tatlici"), ("künefe", "tatlici"), ("börek", "firin"), ("simit", "firin"),
]


def name_hint(name):
    n = name.lower()
    for key, cat in NAME_HINTS:
        if key in n:
            return cat
    return None


# --- Overture (Foursquare, Meta, Microsoft kaynaklı) ---------------------
# Overture kategori adları İngilizce snake_case. Sıra önemli: özelden genele.
OVERTURE_RULES = [
    ("pizza", "pizzaci"), ("kebab", "kebapci"), ("doner", "donerci"), ("soup", "corbaci"),
    ("pide", "pideci"), ("burger", "fastfood"), ("fast_food", "fastfood"), ("sandwich", "fastfood"),
    ("seafood_restaurant", "balikci_rest"), ("fish_restaurant", "balikci_rest"),
    ("turkish_restaurant", "lokanta"), ("steakhouse", "kebapci"), ("meatball", "kebapci"),
    ("dessert", "tatlici"), ("ice_cream", "tatlici"), ("candy", "tatlici"), ("chocolate", "tatlici"),
    ("patisserie", "pastane"), ("cake", "pastane"), ("bakery", "firin"),
    ("coffee", "kafe"), ("cafe", "kafe"), ("tea_room", "kafe"), ("restaurant", "restoran"),
    ("butcher", "kasap"), ("meat_shop", "kasap"), ("seafood_market", "balikci"), ("fish_market", "balikci"),
    ("fruits_and_vegetables", "manav"), ("produce", "manav"), ("farmers_market", "pazar"),
    ("grocery", "market"), ("supermarket", "market"), ("convenience", "market"),
    ("deli", "sarkuteri"), ("cheese", "sarkuteri"), ("nut", "kuruyemis"), ("spice", "kuruyemis"),
    ("hardware", "hirdavat"), ("home_improvement", "yapi_market"), ("building_supply", "yapi_market"),
    ("paint", "boya"), ("electrical_supply", "elektrik"), ("lighting", "elektrik"),
    ("plumbing", "tesisat"), ("auto_parts", "oto_parca"), ("tire", "oto_parca"),
    ("auto_repair", "oto_servis"), ("car_dealer", "oto_servis"),
    ("office_supplies", "kirtasiye"), ("stationery", "kirtasiye"), ("printing", "kirtasiye"),
    ("bookstore", "kitapci"), ("book_store", "kitapci"),
    ("shoe", "ayakkabi"), ("handbag", "canta"), ("luggage", "canta"), ("leather", "canta"),
    ("fabric", "tuhafiye"), ("sewing", "tuhafiye"), ("knitting", "tuhafiye"),
    ("tailor", "terzi"), ("alteration", "terzi"), ("curtain", "perde"), ("carpet", "perde"),
    ("home_decor", "perde"), ("flower", "cicekci"), ("florist", "cicekci"), ("nursery_and_garden", "cicekci"),
    ("pharmacy", "eczane"), ("drugstore", "eczane"), ("cosmetic", "kozmetik"), ("beauty_product", "kozmetik"),
    ("mobile_phone", "telefoncu"), ("electronics", "elektronik"), ("computer", "elektronik"),
    ("appliance", "beyaz_esya"), ("furniture", "mobilya"), ("kitchen_supply", "zuccaciye"),
    ("houseware", "zuccaciye"), ("discount_store", "zuccaciye"), ("gift", "hediyelik"),
    ("toy", "oyuncak"), ("pet_store", "petshop"), ("pet_supplies", "petshop"),
    ("jewelry", "kuyumcu"), ("optical", "optik"), ("eyewear", "optik"),
    ("sporting_goods", "spor"), ("bicycle", "bisiklet"), ("gas_station", "akaryakit"),
    ("locksmith", "anahtarci"), ("clothing", "giyim"), ("fashion", "giyim"), ("boutique", "giyim"),
]


def overture_category(cat):
    if not cat:
        return None
    c = cat.lower()
    for key, mc in OVERTURE_RULES:
        if key in c:
            return mc
    return None

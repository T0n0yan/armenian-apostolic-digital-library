"""Armenian Apostolic churches, monasteries and chapels in Armenia from OpenStreetMap, as SQL for
the places table (all «⚑ Ճշտել»: verified = 0).

  python3 scripts/import-osm-places.py [--hidden] > /tmp/osm-places.sql
  npx wrangler d1 execute <database> --env <env> --remote --file /tmp/osm-places.sql

Only places of worship with an Armenian name and no other denomination are kept; a church drawn
both as a point and as a building is kept once. Each gets its province and nearest settlement.
A second run adds only places not imported before (by OSM id). With --hidden the places come in
unpublished: the admin shows them one by one or a whole kind at once (/admin/places). Data © OpenStreetMap contributors (ODbL).
"""

import json
import math
import re
import subprocess
import sys
import time

OVERPASS = "https://overpass-api.de/api/interpreter"
MIRRORS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
HIDDEN = "--hidden" in sys.argv
AREA = 'area["ISO3166-1"="AM"][admin_level=2]->.am;'
ARMENIAN = re.compile(r"[Ա-և]")
LATIN = {
    "ա": "a", "բ": "b", "գ": "g", "դ": "d", "ե": "e", "զ": "z", "է": "e", "ը": "y", "թ": "t", "ժ": "zh", "ի": "i", "լ": "l",
    "խ": "kh", "ծ": "ts", "կ": "k", "հ": "h", "ձ": "dz", "ղ": "gh", "ճ": "ch", "մ": "m", "յ": "y", "ն": "n", "շ": "sh", "ո": "o",
    "չ": "ch", "պ": "p", "ջ": "j", "ռ": "r", "ս": "s", "վ": "v", "տ": "t", "ր": "r", "ց": "ts", "ւ": "v", "փ": "p", "ք": "k",
    "օ": "o", "ֆ": "f", "և": "ev",
}


def overpass(query):
    # curl rather than urllib: macOS's bundled Python can't make a TLS connection to Overpass.
    # A busy server answers with an HTML page instead of JSON: wait and try again, then a mirror.
    data = f"[out:json][timeout:180];{AREA}{query}"
    for attempt, server in enumerate([OVERPASS, OVERPASS, *MIRRORS]):
        if attempt:
            time.sleep(20 * attempt)
        result = subprocess.run(["curl", "-sS", "--max-time", "240", "-A", "apostolic.am places import", "--data-urlencode", f"data={data}", server],
                                capture_output=True)
        try:
            return json.loads(result.stdout)["elements"]
        except (ValueError, KeyError):
            print(f"-- {server} answered without data, trying again", file=sys.stderr)
    raise SystemExit("Overpass did not answer; nothing imported.")


def slug(name):
    """The same address rule as app/utils/places.ts placeSlug."""
    lower = name.lower().replace("ու", "u")
    latin = "".join(LATIN.get(letter, letter) for letter in lower)
    return re.sub(r"[^a-z0-9]+", "-", latin).strip("-")[:60] or "place"


def armenian_name(tags):
    name = tags.get("name:hy") or (tags.get("name") if ARMENIAN.search(tags.get("name", "")) else None)
    if not name:
        return None
    name = re.sub(r"\bՍբ\.?\s*", "Սուրբ ", name).strip()
    # «Սուրբ Գևորգ Եկեղեցի» → «Սուրբ Գևորգ եկեղեցի»: common nouns after the name in lower case.
    return re.sub(r"(?<=\S )(Եկեղեցի|Վանք|Մատուռ|Տաճար)\b", lambda m: m.group(1).lower(), name)


def distance_m(a, b):
    k = 111_320
    return math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * k * math.cos(math.radians(a[0])))


def inside(lng, lat, edges):
    crossing = False
    for (x1, y1), (x2, y2) in edges:
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            crossing = not crossing
    return crossing


def main():
    elements = overpass(
        '(nwr["amenity"="place_of_worship"]["religion"="christian"](area.am);'
        'nwr["amenity"="monastery"](area.am);nwr["historic"="monastery"](area.am);'
        'nwr["building"~"^(church|chapel|cathedral|monastery)$"](area.am););out center tags;'
    )
    time.sleep(3)
    provinces = overpass('rel["boundary"="administrative"]["admin_level"="4"](area.am);out geom;')
    time.sleep(3)
    settlements = [s for s in overpass('node["place"~"^(city|town|village|hamlet)$"](area.am);out body;') if "lat" in s]

    places = []
    for element in elements:
        tags = element.get("tags", {})
        if tags.get("denomination") not in (None, "armenian_apostolic"):
            continue
        name = armenian_name(tags)
        point = (element["lat"], element["lon"]) if "lat" in element else (element.get("center") or {}).get("lat") and (element["center"]["lat"], element["center"]["lon"])
        if not name or not point:
            continue
        low = name.lower()
        kind = "monastery" if (tags.get("amenity") == "monastery" or tags.get("historic") == "monastery" or tags.get("building") == "monastery" or "վանք" in low or "անապատ" in low) \
            else "chapel" if (tags.get("building") == "chapel" or "մատուռ" in low) else "church"
        ruins = tags.get("ruins") == "yes" or tags.get("historic") == "ruins" or tags.get("building") == "ruins"
        places.append({"osm": f"{element['type'][0]}{element['id']}", "name": name, "point": point, "kind": kind, "ruins": ruins, "wikidata": tags.get("wikidata", "")})

    # Relations and buildings first, so a point inside a building is the duplicate that goes.
    places.sort(key=lambda p: "rwn".index(p["osm"][0]))
    kept = []
    for place in places:
        if any((other["name"] == place["name"] and distance_m(place["point"], other["point"]) < 300) or distance_m(place["point"], other["point"]) < 40 for other in kept):
            continue
        kept.append(place)

    edges = []
    for province in provinces:
        name = province["tags"].get("name:hy") or province["tags"]["name"]
        segments = []
        for member in province.get("members", []):
            geometry = member.get("geometry") or []
            if member["type"] == "way" and member.get("role") in ("outer", ""):
                segments += [((geometry[i]["lon"], geometry[i]["lat"]), (geometry[i + 1]["lon"], geometry[i + 1]["lat"])) for i in range(len(geometry) - 1)]
        edges.append((name, segments))
    named_settlements = [(armenian_name(s["tags"]), (s["lat"], s["lon"])) for s in settlements]
    named_settlements = [(name, point) for name, point in named_settlements if name]

    used = set()
    print("-- Generated by scripts/import-osm-places.py. Data © OpenStreetMap contributors (ODbL).")
    for place in kept:
        lat, lng = place["point"]
        province = next((name for name, segments in edges if inside(lng, lat, segments)), "")
        town, metres = min(((name, distance_m(place["point"], point)) for name, point in named_settlements), key=lambda item: item[1])
        region = ", ".join([province] + ([town if metres < 2500 else f"{town}ի մոտ"] if metres < 6000 and town != province else []))
        base = slug(place["name"])
        place_id = base if base not in used else f"{base}-{slug(town)}"
        suffix = 2
        while place_id in used:
            place_id, suffix = f"{base}-{suffix}", suffix + 1
        used.add(place_id)
        # No construction year: OSM's start_date is often the restoration or simply wrong.
        notes = []
        if place["ruins"]:
            notes.append("Պահպանվել են ավերակները։")
        values = [place_id, place["name"], place["kind"], f"{lat:.6f}", f"{lng:.6f}", region, " ".join(notes), place["osm"], place["wikidata"]]
        quoted = [value if re.fullmatch(r"-?\d+\.\d+", value) else "'" + value.replace("'", "''") + "'" for value in values]
        # Skipped: places the admin deleted before, and names with a word of the admin's blocklist.
        lower = "'" + place["name"].lower().replace("'", "''") + "'"
        print(f"INSERT INTO places (id, name, kind, latitude, longitude, region, description, osm_id, wikidata, published, verified) "
              f"SELECT {', '.join(quoted)}, {0 if HIDDEN else 1}, 0 "
              f"WHERE NOT EXISTS (SELECT 1 FROM place_rejected WHERE osm_id = {quoted[7]}) "
              f"AND NOT EXISTS (SELECT 1 FROM place_blocklist WHERE instr({lower}, word) > 0) ON CONFLICT DO NOTHING;")
    print(f"-- {len(kept)} places", file=sys.stderr)


main()

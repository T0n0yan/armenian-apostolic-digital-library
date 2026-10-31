import { addServant, ENTRANCE, ROAD, setAccessPart } from "./place-answers";
import { insideArmenia, isPlaceKind, parseCoordinates } from "./places";
import { PLACE_CHOICES } from "./support-relay";

/** The site's «Ավելացնել սրբավայր» form: reading and checking what was sent (data/place-web.server.ts saves it). */
export const WEB_PHOTO_LIMIT = 8;
const PHOTO_BYTES = 8_000_000;
export const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
// A reader can't flood the list: this many unhandled places at once.
export const OPEN_LIMIT = 5;
const MAX_TEXT = 1500;

export type WebPlaceErrors = Partial<Record<"name" | "location" | "kind" | "photos" | "form", string>>;

const clean = (value: FormDataEntryValue | null, limit = MAX_TEXT) => String(value ?? "").replace(/[\p{Cc}\p{Cf}]/gu, (character) => (character === "\n" ? "\n" : "")).trim().slice(0, limit);

/** Reads and checks the form; the photos come back as files to store once the row exists. */
export function readWebPlace(form: FormData) {
  const errors: WebPlaceErrors = {};
  const name = clean(form.get("name"), 120);
  if (name.length < 3) errors.name = "Գրեք եկեղեցու կամ սրբավայրի անունը։";
  const point = parseCoordinates(clean(form.get("location"), 600));
  if (!point) errors.location = "Նշեք տեղը. սեղմեք «Ես այնտեղ եմ» կամ տեղադրեք Google Maps-ի հղումը կամ կոորդինատները։";
  else if (!insideArmenia(point.latitude, point.longitude)) errors.location = "Այս կետը Հայաստանից դուրս է։ Ստուգեք հղումը։";
  const kind = clean(form.get("kind"), 20);
  if (!isPlaceKind(kind)) errors.kind = "Ընտրեք տեսակը։";
  const active = ["yes", "no", "renovation"].includes(clean(form.get("active"), 12)) ? clean(form.get("active"), 12) : "";
  // People serving: rank + name pairs, written with the rank's address (as in the bot).
  const roles = form.getAll("clergyRole").map((value) => clean(value, 40));
  const names = form.getAll("clergyName").map((value) => clean(value, 160));
  const clergy = roles.reduce((text, role, index) => (names[index] && (PLACE_CHOICES.clergy as readonly string[]).includes(role) ? addServant(text, role, names[index]) : text), "");
  const road = clean(form.get("road"), 300);
  const entrance = clean(form.get("entrance"), 300);
  // «Ճանապարհը՝ …» and «Մուտքը՝ …» lines, only for what was picked.
  const withRoad = road ? setAccessPart("", ROAD, road) : "";
  const accessibility = entrance ? setAccessPart(withRoad, ENTRANCE, entrance) : withRoad;
  const photos = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  if (photos.length > WEB_PHOTO_LIMIT) errors.photos = `Առավելագույնը ${WEB_PHOTO_LIMIT} նկար։`;
  else if (photos.some((file) => !PHOTO_TYPES[file.type] || file.size > PHOTO_BYTES)) errors.photos = "Նկարները պետք է լինեն JPG, PNG կամ WebP, յուրաքանչյուրը մինչև 8 ՄԲ։";
  const credit = form.get("credit") === "name";
  return {
    errors,
    fields: {
      name, point, kind, active,
      region: clean(form.get("region"), 120),
      liturgy: active === "yes" ? clean(form.get("liturgy"), 300) : "",
      services: active === "yes" ? clean(form.get("services"), 500) : "",
      clergy: active === "yes" ? clergy.slice(0, MAX_TEXT) : "",
      openHours: clean(form.get("openHours"), 300),
      accessibility,
      notes: clean(form.get("notes")),
      credit,
      creditName: credit ? clean(form.get("creditName"), 80) : "",
    },
    photos,
  };
}

export type WebPlace = ReturnType<typeof readWebPlace>;


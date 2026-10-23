import assert from "node:assert/strict";
import test from "node:test";

import { directionLinks, parseCoordinates, placeSlug } from "../app/utils/places";

test("a place's address is its Armenian name in Latin letters", () => {
  assert.equal(placeSlug("Էջմիածնի Մայր տաճար"), "ejmiatsni-mayr-tachar");
  assert.equal(placeSlug("Սուրբ Գրիգոր Լուսավորիչ"), "surb-grigor-lusavorich");
  assert.equal(placeSlug("Հաղպատ"), "haghpat");
  assert.equal(placeSlug("   "), "place");
});

test("coordinates come from plain numbers and from Google or Yandex links", () => {
  assert.deepEqual(parseCoordinates("40.161795,44.291395, Armavir Region"), { latitude: 40.161795, longitude: 44.291395 });
  assert.deepEqual(parseCoordinates("https://www.google.com/maps/place/x/@40.1617,44.2913,17z"), { latitude: 40.1617, longitude: 44.2913 });
  assert.deepEqual(parseCoordinates("https://yandex.com/maps/?ll=44.2913%2C40.1617&z=16"), { latitude: 40.1617, longitude: 44.2913 });
  assert.equal(parseCoordinates("Սուրբ Գրիգոր Լուսավորիչ"), null);
  assert.equal(parseCoordinates("95.1234, 44.1234"), null);
});

test("directions open Google Maps and Yandex at the place", () => {
  assert.deepEqual(directionLinks(40.16, 44.29).map((link) => link.href), [
    "https://www.google.com/maps/dir/?api=1&destination=40.16,44.29",
    "https://yandex.com/maps/?rtext=~40.16,44.29&rtt=auto",
  ]);
});

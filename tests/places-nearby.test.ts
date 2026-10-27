import assert from "node:assert/strict";
import { test } from "node:test";

import { circleRing, distanceKm, formatDistance, nearbyPlaces } from "../app/utils/places";

const yerevan = { latitude: 40.1772, longitude: 44.5035 }; // Republic Square
const etchmiadzin = { id: "etchmiadzin", latitude: 40.1619, longitude: 44.2910 };
const garni = { id: "garni", latitude: 40.1123, longitude: 44.7303 };
const tatev = { id: "tatev", latitude: 39.3797, longitude: 46.2501 };

test("distances match the real ones", () => {
  // Yerevan → Etchmiadzin is about 18 km in a straight line, Yerevan → Tatev about 170 km.
  assert.ok(Math.abs(distanceKm(yerevan, etchmiadzin) - 18) < 1.5);
  assert.ok(Math.abs(distanceKm(yerevan, tatev) - 170) < 8);
  assert.equal(distanceKm(yerevan, yerevan), 0);
});

test("nearby places: only those within the radius, nearest first", () => {
  const places = [tatev, garni, etchmiadzin];
  assert.deepEqual(nearbyPlaces(places, yerevan, 30).map(({ place }) => place.id), ["etchmiadzin", "garni"]);
  assert.deepEqual(nearbyPlaces(places, yerevan, 10).map(({ place }) => place.id), []);
  assert.equal(nearbyPlaces(places, yerevan, 200).length, 3);
  assert.ok(nearbyPlaces(places, yerevan, 30).every(({ km }) => km <= 30));
});

test("distances read naturally", () => {
  assert.equal(formatDistance(0.004), "10 մ");
  assert.equal(formatDistance(0.853), "850 մ");
  assert.equal(formatDistance(3.24), "3.2 կմ");
  assert.equal(formatDistance(27.4), "27 կմ");
});

test("the ring on the map is the radius all round", () => {
  const ring = circleRing(yerevan, 30);
  assert.deepEqual(ring[0], ring.at(-1));
  for (const [longitude, latitude] of ring) assert.ok(Math.abs(distanceKm(yerevan, { latitude, longitude }) - 30) < 0.05);
});

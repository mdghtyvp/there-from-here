#!/usr/bin/env node
'use strict';

// Vermont puzzle generator — no external API calls needed.
// Road snapping and optimal route are fetched by the browser at game load time.
// Town names come from the nearest entry in VT_TOWNS.

const fs = require('fs');

const BOUNDS = { north: 45.017, south: 42.726, west: -73.438, east: -71.464 };

const VT_POLY = [
  [45.013, -73.343], [45.017, -72.103], [44.916, -71.503], [44.503, -71.573],
  [43.572, -72.456], [42.726, -72.456], [42.726, -73.265], [43.150, -73.404],
  [43.570, -73.438], [44.020, -73.338], [44.500, -73.370], [45.013, -73.343]
];

// Vermont towns / villages with approximate lat/lng.
const VT_TOWNS = [
  { name: 'Burlington',         lat: 44.4759, lng: -73.2121 },
  { name: 'Montpelier',         lat: 44.2601, lng: -72.5754 },
  { name: 'Rutland',            lat: 43.6106, lng: -72.9726 },
  { name: 'Barre',              lat: 44.1970, lng: -72.5020 },
  { name: 'St. Johnsbury',      lat: 44.4198, lng: -72.0146 },
  { name: 'Brattleboro',        lat: 42.8509, lng: -72.5579 },
  { name: 'Bennington',         lat: 42.8779, lng: -73.1968 },
  { name: 'Middlebury',         lat: 44.0154, lng: -73.1673 },
  { name: 'Newport',            lat: 44.9370, lng: -72.2054 },
  { name: 'White River Junction', lat: 43.6501, lng: -72.3190 },
  { name: 'Springfield',        lat: 43.2965, lng: -72.4815 },
  { name: 'Bellows Falls',      lat: 43.1337, lng: -72.4454 },
  { name: 'Rockingham',         lat: 43.1779, lng: -72.4815 },
  { name: 'Windsor',            lat: 43.4787, lng: -72.3982 },
  { name: 'Woodstock',          lat: 43.6237, lng: -72.5218 },
  { name: 'Manchester',         lat: 43.1637, lng: -73.0723 },
  { name: 'Wilmington',         lat: 42.8676, lng: -72.8665 },
  { name: 'Londonderry',        lat: 43.2315, lng: -72.8040 },
  { name: 'Ludlow',             lat: 43.4026, lng: -72.7065 },
  { name: 'Weston',             lat: 43.2954, lng: -72.8015 },
  { name: 'Chester',            lat: 43.2648, lng: -72.5954 },
  { name: 'Grafton',            lat: 43.1787, lng: -72.6232 },
  { name: 'Townshend',          lat: 43.0534, lng: -72.6693 },
  { name: 'Jamaica',            lat: 43.1059, lng: -72.7779 },
  { name: 'Stratton',           lat: 43.1059, lng: -72.9115 },
  { name: 'Peru',               lat: 43.2676, lng: -72.9201 },
  { name: 'Dorset',             lat: 43.2565, lng: -73.0873 },
  { name: 'Pawlet',             lat: 43.3454, lng: -73.1834 },
  { name: 'Poultney',           lat: 43.5212, lng: -73.2373 },
  { name: 'Fair Haven',         lat: 43.5987, lng: -73.2684 },
  { name: 'Castleton',          lat: 43.6101, lng: -73.1779 },
  { name: 'Hubbardton',         lat: 43.7548, lng: -73.1595 },
  { name: 'Brandon',            lat: 43.7987, lng: -73.0887 },
  { name: 'Proctor',            lat: 43.6601, lng: -72.9751 },
  { name: 'Pittsford',          lat: 43.7101, lng: -73.0284 },
  { name: 'Pittsfield',         lat: 43.7737, lng: -72.7751 },
  { name: 'Rochester',          lat: 43.8776, lng: -72.8140 },
  { name: 'Granville',          lat: 43.9765, lng: -72.8529 },
  { name: 'Warren',             lat: 44.1148, lng: -72.8590 },
  { name: 'Waitsfield',         lat: 44.1901, lng: -72.8337 },
  { name: 'Moretown',           lat: 44.2565, lng: -72.7612 },
  { name: 'Northfield',         lat: 44.1487, lng: -72.6557 },
  { name: 'Williamstown',       lat: 44.1212, lng: -72.5376 },
  { name: 'Randolph',           lat: 43.9248, lng: -72.6590 },
  { name: 'Brookfield',         lat: 44.0337, lng: -72.5929 },
  { name: 'Chelsea',            lat: 43.9926, lng: -72.4487 },
  { name: 'Tunbridge',          lat: 43.8987, lng: -72.4929 },
  { name: 'Royalton',           lat: 43.8212, lng: -72.5340 },
  { name: 'Bethel',             lat: 43.8337, lng: -72.6387 },
  { name: 'Sharon',             lat: 43.7612, lng: -72.4584 },
  { name: 'Strafford',          lat: 43.8648, lng: -72.3890 },
  { name: 'Thetford',           lat: 43.8287, lng: -72.2326 },
  { name: 'Bradford',           lat: 44.0051, lng: -72.1334 },
  { name: 'Fairlee',            lat: 43.9012, lng: -72.1423 },
  { name: 'Corinth',            lat: 44.0965, lng: -72.2373 },
  { name: 'Groton',             lat: 44.2226, lng: -72.2501 },
  { name: 'Cabot',              lat: 44.4012, lng: -72.3001 },
  { name: 'Hardwick',           lat: 44.5048, lng: -72.3668 },
  { name: 'Greensboro',         lat: 44.5948, lng: -72.2918 },
  { name: 'Craftsbury',         lat: 44.6487, lng: -72.3751 },
  { name: 'Albany',             lat: 44.7312, lng: -72.3918 },
  { name: 'Irasburg',           lat: 44.8148, lng: -72.2834 },
  { name: 'Barton',             lat: 44.7501, lng: -72.1751 },
  { name: 'Orleans',            lat: 44.8126, lng: -72.2001 },
  { name: 'Derby',              lat: 44.9451, lng: -72.1334 },
  { name: 'Holland',            lat: 44.9712, lng: -71.9334 },
  { name: 'Morgan',             lat: 44.9001, lng: -71.9668 },
  { name: 'Brighton',           lat: 44.7901, lng: -71.8751 },
  { name: 'Island Pond',        lat: 44.8126, lng: -71.8834 },
  { name: 'Bloomfield',         lat: 44.7751, lng: -71.6834 },
  { name: 'Lemington',          lat: 44.8834, lng: -71.5834 },
  { name: 'Maidstone',          lat: 44.6501, lng: -71.6584 },
  { name: 'Guildhall',          lat: 44.5626, lng: -71.5751 },
  { name: 'Lunenburg',          lat: 44.4626, lng: -71.6834 },
  { name: 'Concord',            lat: 44.4126, lng: -71.8584 },
  { name: 'Burke',              lat: 44.5876, lng: -71.9418 },
  { name: 'Sutton',             lat: 44.6501, lng: -72.0168 },
  { name: 'Westmore',           lat: 44.7126, lng: -72.0418 },
  { name: 'Glover',             lat: 44.6876, lng: -72.2001 },
  { name: 'Wolcott',            lat: 44.5501, lng: -72.4334 },
  { name: 'Morrisville',        lat: 44.5626, lng: -72.5918 },
  { name: 'Stowe',              lat: 44.4651, lng: -72.6834 },
  { name: 'Waterbury',          lat: 44.3376, lng: -72.7568 },
  { name: 'Duxbury',            lat: 44.3001, lng: -72.7334 },
  { name: 'Fayston',            lat: 44.2126, lng: -72.8334 },
  { name: 'Huntington',         lat: 44.3251, lng: -72.9834 },
  { name: 'Richmond',           lat: 44.4001, lng: -73.0001 },
  { name: 'Jericho',            lat: 44.4876, lng: -72.9918 },
  { name: 'Underhill',          lat: 44.5376, lng: -72.9584 },
  { name: 'Cambridge',          lat: 44.6376, lng: -72.8668 },
  { name: 'Johnson',            lat: 44.6376, lng: -72.6834 },
  { name: 'Hyde Park',          lat: 44.5876, lng: -72.6084 },
  { name: 'Elmore',             lat: 44.5501, lng: -72.5334 },
  { name: 'Middlesex',          lat: 44.2876, lng: -72.6751 },
  { name: 'East Montpelier',    lat: 44.2751, lng: -72.4834 },
  { name: 'Berlin',             lat: 44.2126, lng: -72.5834 },
  { name: 'Plainfield',         lat: 44.2751, lng: -72.4168 },
  { name: 'Marshfield',         lat: 44.3376, lng: -72.3418 },
  { name: 'Calais',             lat: 44.3751, lng: -72.4418 },
  { name: 'Woodbury',           lat: 44.4376, lng: -72.3918 },
  { name: 'Walden',             lat: 44.5001, lng: -72.3001 },
  { name: 'Danville',           lat: 44.4126, lng: -72.1168 },
  { name: 'Peacham',            lat: 44.3251, lng: -72.1751 },
  { name: 'Barnet',             lat: 44.3001, lng: -72.0418 },
  { name: 'Ryegate',            lat: 44.2001, lng: -72.1334 },
  { name: 'Newbury',            lat: 44.1126, lng: -72.0668 },
  { name: 'Wells River',        lat: 44.1501, lng: -72.0584 },
  { name: 'Piermont',           lat: 44.0626, lng: -72.0834 },
  { name: 'Haverhill',          lat: 44.0376, lng: -72.0751 },
  { name: 'Vergennes',          lat: 44.1676, lng: -73.2568 },
  { name: 'Ferrisburgh',        lat: 44.2001, lng: -73.2418 },
  { name: 'Addison',            lat: 44.0376, lng: -73.2834 },
  { name: 'Bridport',           lat: 43.9626, lng: -73.3001 },
  { name: 'Shoreham',           lat: 43.8876, lng: -73.3001 },
  { name: 'Orwell',             lat: 43.8001, lng: -73.2751 },
  { name: 'Benson',             lat: 43.7376, lng: -73.3001 },
  { name: 'Sudbury',            lat: 43.7751, lng: -73.1668 },
  { name: 'Leicester',          lat: 43.8751, lng: -73.1001 },
  { name: 'Salisbury',          lat: 43.9376, lng: -73.0918 },
  { name: 'Cornwall',           lat: 43.9751, lng: -73.2001 },
  { name: 'Weybridge',          lat: 44.0626, lng: -73.2001 },
  { name: 'Panton',             lat: 44.1251, lng: -73.2834 },
  { name: 'Monkton',            lat: 44.2376, lng: -73.1584 },
  { name: 'Hinesburg',          lat: 44.3376, lng: -73.1084 },
  { name: 'Charlotte',          lat: 44.3126, lng: -73.2418 },
  { name: 'Shelburne',          lat: 44.3876, lng: -73.2334 },
  { name: 'South Burlington',   lat: 44.4626, lng: -73.1751 },
  { name: 'Williston',          lat: 44.4376, lng: -73.0584 },
  { name: 'Essex Junction',     lat: 44.4876, lng: -73.1168 },
  { name: 'Colchester',         lat: 44.5376, lng: -73.1418 },
  { name: 'Milton',             lat: 44.6376, lng: -73.1084 },
  { name: 'Georgia',            lat: 44.7251, lng: -73.1001 },
  { name: 'St. Albans',         lat: 44.8126, lng: -73.0834 },
  { name: 'Swanton',            lat: 44.9126, lng: -73.1251 },
  { name: 'Highgate',           lat: 44.9626, lng: -73.0584 },
  { name: 'Franklin',           lat: 44.9876, lng: -72.9168 },
  { name: 'Enosburg Falls',     lat: 44.9001, lng: -72.8084 },
  { name: 'Richford',           lat: 44.9876, lng: -72.6668 },
  { name: 'Montgomery',         lat: 44.8626, lng: -72.6251 },
  { name: 'Bakersfield',        lat: 44.7751, lng: -72.7918 },
  { name: 'Fletcher',           lat: 44.6876, lng: -72.8834 },
  { name: 'Fairfield',          lat: 44.7876, lng: -72.9501 },
  { name: 'Sheldon',            lat: 44.8876, lng: -72.9418 },
  { name: 'Lowell',             lat: 44.7876, lng: -72.4584 },
  { name: 'Jay',                lat: 44.9376, lng: -72.5084 },
  { name: 'Troy',               lat: 44.9001, lng: -72.4001 },
  { name: 'North Troy',         lat: 44.9876, lng: -72.4001 },
  { name: 'Coventry',           lat: 44.8626, lng: -72.2584 },
  { name: 'Charleston',         lat: 44.9001, lng: -72.0918 }
];

function pointInPolygon(lat, lng, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1];
    const yj = poly[j][0], xj = poly[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function nearestTown(lat, lng) {
  let best = VT_TOWNS[0], bestDist = Infinity;
  for (const t of VT_TOWNS) {
    const d = haversineMiles(lat, lng, t.lat, t.lng);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best.name;
}

function randomVTPoint() {
  for (let i = 0; i < 200; i++) {
    const lat = parseFloat((BOUNDS.south + Math.random() * (BOUNDS.north - BOUNDS.south)).toFixed(4));
    const lng = parseFloat((BOUNDS.west  + Math.random() * (BOUNDS.east  - BOUNDS.west)).toFixed(4));
    if (pointInPolygon(lat, lng, VT_POLY)) return { lat, lng };
  }
  throw new Error('Could not find valid VT point after 200 attempts');
}

function generatePair() {
  for (let i = 0; i < 50; i++) {
    const a = randomVTPoint();
    const b = randomVTPoint();
    const dist = haversineMiles(a.lat, a.lng, b.lat, b.lng);
    if (dist >= 30) return { a, b, distMiles: Math.round(dist) };
  }
  throw new Error('Could not find pair ≥30 miles apart after 50 attempts');
}

function main() {
  const COUNT = 60;
  const START_ID = 7;
  const START_DATE = new Date('2026-06-17');

  let existing = { puzzles: [] };
  try {
    existing = JSON.parse(fs.readFileSync('puzzles.json', 'utf8'));
    console.log(`Loaded ${existing.puzzles.length} existing puzzles`);
  } catch (e) {
    console.log('Starting fresh');
  }

  const existingIds = new Set(existing.puzzles.map(p => p.id));
  const newPuzzles = [];

  for (let i = 0; i < COUNT; i++) {
    const id = START_ID + i;
    if (existingIds.has(id)) { console.log(`#${id} exists, skipping`); continue; }

    const date = new Date(START_DATE);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    try {
      const { a, b, distMiles } = generatePair();
      const nameA = nearestTown(a.lat, a.lng);
      const nameB = nearestTown(b.lat, b.lng);
      console.log(`#${id} (${dateStr}): ${nameA} → ${nameB} (${distMiles} mi)`);

      newPuzzles.push({
        id,
        date: dateStr,
        pointA: { name: nameA, lat: a.lat, lng: a.lng },
        pointB: { name: nameB, lat: b.lat, lng: b.lng },
        optimalDistanceMiles: distMiles,
        optimalRoute: [[a.lat, a.lng], [b.lat, b.lng]]
      });
    } catch (e) {
      console.error(`#${id} FAILED: ${e.message}`);
    }
  }

  const all = [...existing.puzzles, ...newPuzzles].sort((a, b) => a.id - b.id);
  fs.writeFileSync('puzzles.json', JSON.stringify({ puzzles: all }, null, 2));
  console.log(`\nDone. Generated ${newPuzzles.length} puzzles. Total: ${all.length}`);
}

main();

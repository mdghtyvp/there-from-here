#!/usr/bin/env node
'use strict';

// Vermont puzzle generator.
// Uses OSRM /nearest to snap random points to real roads,
// Nominatim reverse geocode for town names,
// and OSRM /route for the real driving distance.

const fs = require('fs');

const BOUNDS = { north: 45.017, south: 42.726, west: -73.438, east: -71.464 };

// More detailed polygon along the NY/VT western border to avoid generating
// points that are technically inside the rough bounding box but actually in NY.
const VT_POLY = [
  [45.013, -73.343], [45.017, -72.103], [44.916, -71.503], [44.503, -71.573],
  [43.572, -72.456], [42.726, -72.456],
  // Southern NY border — more detailed to prevent Bennington-area NY points
  [42.726, -73.255], [42.760, -73.265], [42.850, -73.268], [42.950, -73.265],
  [43.020, -73.255], [43.080, -73.245], [43.150, -73.165], [43.200, -73.095],
  [43.300, -73.060],
  // Lake Champlain western shore
  [43.570, -73.438], [44.020, -73.338], [44.500, -73.370], [45.013, -73.343]
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

function randomVTPoint() {
  for (let i = 0; i < 200; i++) {
    const lat = parseFloat((BOUNDS.south + Math.random() * (BOUNDS.north - BOUNDS.south)).toFixed(4));
    const lng = parseFloat((BOUNDS.west  + Math.random() * (BOUNDS.east  - BOUNDS.west)).toFixed(4));
    if (pointInPolygon(lat, lng, VT_POLY)) return { lat, lng };
  }
  throw new Error('Could not find valid VT point after 200 attempts');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function snapToRoad(lat, lng) {
  const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'there-from-here-puzzle-gen/1.0' } });
  if (!res.ok) throw new Error(`OSRM nearest ${res.status}`);
  const data = await res.json();
  if (!data.waypoints || !data.waypoints.length) throw new Error('No waypoints from OSRM nearest');
  const [snappedLng, snappedLat] = data.waypoints[0].location;
  const pt = { lat: parseFloat(snappedLat.toFixed(4)), lng: parseFloat(snappedLng.toFixed(4)) };
  if (!pointInPolygon(pt.lat, pt.lng, VT_POLY)) throw new Error('Snapped point outside VT');
  return pt;
}

async function getTownName(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`;
  const res = await fetch(url, { headers: { 'User-Agent': 'there-from-here-puzzle-gen/1.0' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  const addr = data.address || {};
  // Prefer village > town > city > county
  return addr.village || addr.town || addr.city || addr.county || addr.state || 'Vermont';
}

async function getRoute(a, b, waypointCount = 10) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': 'there-from-here-puzzle-gen/1.0' } });
  if (!res.ok) throw new Error(`OSRM route ${res.status}`);
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error('No route from OSRM');
  const route = data.routes[0];
  const coords = route.geometry.coordinates; // [[lng, lat], ...]
  // Even-sample to waypointCount points, stored as [lat, lng]
  const waypoints = [];
  for (let i = 0; i < waypointCount; i++) {
    const idx = Math.round(i * (coords.length - 1) / (waypointCount - 1));
    waypoints.push([
      parseFloat(coords[idx][1].toFixed(4)),
      parseFloat(coords[idx][0].toFixed(4))
    ]);
  }
  return { distanceMiles: Math.round(route.distance / 1609.34), waypoints };
}

async function generatePuzzle(id, dateStr) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const rawA = randomVTPoint();
      const rawB = randomVTPoint();
      // Quick crow-flies check before API calls
      if (haversineMiles(rawA.lat, rawA.lng, rawB.lat, rawB.lng) < 25) continue;

      const [a, b] = await Promise.all([snapToRoad(rawA.lat, rawA.lng), snapToRoad(rawB.lat, rawB.lng)]);
      await sleep(300);

      const { distanceMiles, waypoints } = await getRoute(a, b);
      if (distanceMiles < 30) continue;

      await sleep(300);
      const [nameA, nameB] = await Promise.all([getTownName(a.lat, a.lng), getTownName(b.lat, b.lng)]);
      await sleep(600); // Nominatim rate limit: 1 req/sec

      return {
        id,
        date: dateStr,
        pointA: { name: nameA, lat: a.lat, lng: a.lng },
        pointB: { name: nameB, lat: b.lat, lng: b.lng },
        optimalDistanceMiles: distanceMiles,
        optimalRoute: waypoints
      };
    } catch (e) {
      console.error(`  attempt ${attempt + 1} failed: ${e.message}`);
      await sleep(1000);
    }
  }
  throw new Error(`Could not generate puzzle #${id} after 20 attempts`);
}

async function main() {
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

  // Keep only hand-curated puzzles #1-6
  const curated = existing.puzzles.filter(p => p.id <= 6);
  const existingGenerated = new Set(existing.puzzles.filter(p => p.id >= START_ID).map(p => p.id));

  const newPuzzles = [];

  for (let i = 0; i < COUNT; i++) {
    const id = START_ID + i;
    if (existingGenerated.has(id)) {
      // Re-generate all #7+ to use real road snapping
    }

    const date = new Date(START_DATE);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    try {
      console.log(`Generating #${id} (${dateStr})...`);
      const puzzle = await generatePuzzle(id, dateStr);
      console.log(`  ✓ ${puzzle.pointA.name} → ${puzzle.pointB.name} (${puzzle.optimalDistanceMiles} mi)`);
      newPuzzles.push(puzzle);
    } catch (e) {
      console.error(`  ✗ #${id} FAILED: ${e.message}`);
    }
  }

  const all = [...curated, ...newPuzzles].sort((a, b) => a.id - b.id);
  fs.writeFileSync('puzzles.json', JSON.stringify({ puzzles: all }, null, 2));
  console.log(`\nDone. Generated ${newPuzzles.length} puzzles. Total: ${all.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });

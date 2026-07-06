#!/usr/bin/env node
'use strict';

// Vermont puzzle generator.
// Uses OSRM /nearest to snap random points to real roads,
// nearest-town lookup (no external API) for town names,
// and OSRM /route for the real driving distance.

const fs = require('fs');

const BOUNDS = { north: 45.017, south: 42.726, west: -73.438, east: -71.464 };

// Detailed VT polygon. Western side follows NY border and Lake Champlain;
// eastern side follows the CT River (NH border) and MA border closely.
const VT_POLY = [
  // Northern border (east → west)
  [45.017, -71.503], [45.017, -72.103], [45.013, -73.343],
  // Lake Champlain western shore (south)
  [44.500, -73.370], [44.020, -73.338], [43.570, -73.438],
  // NY western border (south)
  [43.300, -73.060], [43.200, -73.095], [43.150, -73.165],
  [43.080, -73.245], [43.020, -73.255], [42.950, -73.265],
  [42.850, -73.268], [42.760, -73.265], [42.726, -73.255],
  // Southern MA border
  [42.726, -72.456], [42.726, -71.464],
  // Eastern NH border — follows the Connecticut River
  [42.730, -72.456], [42.770, -72.438], [42.830, -72.404],
  [42.900, -72.368], [42.980, -72.330], [43.060, -72.290],
  [43.130, -72.258], [43.200, -72.220], [43.290, -72.180],
  [43.380, -72.150], [43.460, -72.120], [43.560, -72.090],
  [43.650, -72.060], [43.740, -72.040], [43.830, -72.020],
  [43.920, -72.010], [44.010, -72.000], [44.100, -71.980],
  [44.200, -71.950], [44.300, -71.920], [44.400, -71.870],
  [44.503, -71.573], [44.916, -71.503], [45.017, -71.503]
];

// All Vermont municipalities with lat/lng for nearest-town lookup.
const VT_TOWNS = [
  { name: 'Burlington', lat: 44.4759, lng: -73.2121 },
  { name: 'South Burlington', lat: 44.4670, lng: -73.1710 },
  { name: 'Rutland', lat: 43.6106, lng: -72.9726 },
  { name: 'Barre', lat: 44.1970, lng: -72.5024 },
  { name: 'Montpelier', lat: 44.2601, lng: -72.5754 },
  { name: 'St. Albans', lat: 44.8112, lng: -73.0832 },
  { name: 'Winooski', lat: 44.4917, lng: -73.1859 },
  { name: 'Newport', lat: 44.9367, lng: -72.2073 },
  { name: 'Vergennes', lat: 44.1670, lng: -73.2593 },
  { name: 'Brattleboro', lat: 42.8509, lng: -72.5579 },
  { name: 'Bennington', lat: 42.8779, lng: -73.1968 },
  { name: 'Middlebury', lat: 44.0154, lng: -73.1673 },
  { name: 'St. Johnsbury', lat: 44.4198, lng: -72.0146 },
  { name: 'Springfield', lat: 43.2976, lng: -72.4815 },
  { name: 'Bellows Falls', lat: 43.1337, lng: -72.4457 },
  { name: 'White River Junction', lat: 43.6487, lng: -72.3193 },
  { name: 'Windsor', lat: 43.4787, lng: -72.3882 },
  { name: 'Woodstock', lat: 43.6237, lng: -72.5218 },
  { name: 'Ludlow', lat: 43.3987, lng: -72.7043 },
  { name: 'Manchester', lat: 43.1637, lng: -73.0723 },
  { name: 'Northfield', lat: 44.1487, lng: -72.6579 },
  { name: 'Waterbury', lat: 44.3376, lng: -72.7565 },
  { name: 'Stowe', lat: 44.4654, lng: -72.6868 },
  { name: 'Morrisville', lat: 44.5537, lng: -72.5996 },
  { name: 'Hyde Park', lat: 44.5937, lng: -72.6143 },
  { name: 'Johnson', lat: 44.6337, lng: -72.6790 },
  { name: 'Hardwick', lat: 44.5037, lng: -72.3668 },
  { name: 'Lyndonville', lat: 44.5337, lng: -72.0118 },
  { name: 'Derby', lat: 44.9437, lng: -72.1293 },
  { name: 'Island Pond', lat: 44.8137, lng: -71.8793 },
  { name: 'Barton', lat: 44.7487, lng: -72.1743 },
  { name: 'Orleans', lat: 44.8087, lng: -72.2018 },
  { name: 'Irasburg', lat: 44.8237, lng: -72.2843 },
  { name: 'Craftsbury', lat: 44.6537, lng: -72.3718 },
  { name: 'Greensboro', lat: 44.5937, lng: -72.2968 },
  { name: 'Glover', lat: 44.6637, lng: -72.2118 },
  { name: 'Cabot', lat: 44.4087, lng: -72.3043 },
  { name: 'Peacham', lat: 44.3237, lng: -72.1793 },
  { name: 'Groton', lat: 44.2237, lng: -72.2343 },
  { name: 'Bradford', lat: 44.0037, lng: -72.1343 },
  { name: 'Newbury', lat: 44.0987, lng: -72.0643 },
  { name: 'Wells River', lat: 44.1487, lng: -72.0593 },
  { name: 'Fairlee', lat: 43.9037, lng: -72.1343 },
  { name: 'Thetford', lat: 43.8237, lng: -72.2018 },
  { name: 'Norwich', lat: 43.7087, lng: -72.3093 },
  { name: 'Hartford', lat: 43.6637, lng: -72.3443 },
  { name: 'Sharon', lat: 43.7937, lng: -72.4368 },
  { name: 'Royalton', lat: 43.8237, lng: -72.5293 },
  { name: 'Bethel', lat: 43.8337, lng: -72.6418 },
  { name: 'Randolph', lat: 43.9237, lng: -72.6643 },
  { name: 'Brookfield', lat: 44.0337, lng: -72.5918 },
  { name: 'Barre Town', lat: 44.1487, lng: -72.4618 },
  { name: 'Berlin', lat: 44.2087, lng: -72.5918 },
  { name: 'Plainfield', lat: 44.2787, lng: -72.4268 },
  { name: 'Marshfield', lat: 44.3337, lng: -72.3393 },
  { name: 'Peacham', lat: 44.3237, lng: -72.1793 },
  { name: 'Danville', lat: 44.4137, lng: -72.1168 },
  { name: 'Walden', lat: 44.5037, lng: -72.2418 },
  { name: 'Albany', lat: 44.7137, lng: -72.3843 },
  { name: 'Westfield', lat: 44.8937, lng: -72.4518 },
  { name: 'Lowell', lat: 44.7887, lng: -72.4543 },
  { name: 'Eden', lat: 44.7087, lng: -72.5368 },
  { name: 'Belvidere', lat: 44.7537, lng: -72.6543 },
  { name: 'Fletcher', lat: 44.6437, lng: -72.8343 },
  { name: 'Cambridge', lat: 44.6437, lng: -72.7343 },
  { name: 'Waterville', lat: 44.7087, lng: -72.7618 },
  { name: 'Bakersfield', lat: 44.7737, lng: -72.8018 },
  { name: 'Fairfax', lat: 44.6637, lng: -73.0093 },
  { name: 'Georgia', lat: 44.7237, lng: -73.0943 },
  { name: 'Highgate', lat: 44.9237, lng: -73.0543 },
  { name: 'Swanton', lat: 44.9126, lng: -73.1251 },
  { name: 'Sheldon', lat: 44.8737, lng: -72.9743 },
  { name: 'Franklin', lat: 44.9837, lng: -72.9168 },
  { name: 'Enosburgh', lat: 44.9037, lng: -72.8143 },
  { name: 'Richford', lat: 44.9987, lng: -72.6718 },
  { name: 'Montgomery', lat: 44.8737, lng: -72.6293 },
  { name: 'Berkshire', lat: 44.8437, lng: -72.7618 },
  { name: 'Fairfield', lat: 44.7937, lng: -72.9418 },
  { name: 'St. Albans Town', lat: 44.7887, lng: -73.1093 },
  { name: 'Milton', lat: 44.6376, lng: -73.1084 },
  { name: 'Colchester', lat: 44.5376, lng: -73.1418 },
  { name: 'Williston', lat: 44.4287, lng: -73.0618 },
  { name: 'Essex Junction', lat: 44.4937, lng: -73.1143 },
  { name: 'Essex', lat: 44.4937, lng: -73.0993 },
  { name: 'Hinesburg', lat: 44.3337, lng: -73.1143 },
  { name: 'Charlotte', lat: 44.3087, lng: -73.2518 },
  { name: 'Shelburne', lat: 44.3737, lng: -73.2293 },
  { name: 'Ferrisburgh', lat: 44.2001, lng: -73.2418 },
  { name: 'Addison', lat: 44.0837, lng: -73.3618 },
  { name: 'Bridport', lat: 43.9626, lng: -73.3001 },
  { name: 'Shoreham', lat: 43.8937, lng: -73.3143 },
  { name: 'Orwell', lat: 43.8137, lng: -73.2918 },
  { name: 'Benson', lat: 43.7337, lng: -73.3018 },
  { name: 'Fair Haven', lat: 43.5987, lng: -73.2684 },
  { name: 'Castleton', lat: 43.6137, lng: -73.1793 },
  { name: 'Poultney', lat: 43.5212, lng: -73.2373 },
  { name: 'Wells', lat: 43.4337, lng: -73.1993 },
  { name: 'Pawlet', lat: 43.3454, lng: -73.1834 },
  { name: 'Rupert', lat: 43.2637, lng: -73.2043 },
  { name: 'Dorset', lat: 43.2537, lng: -73.0843 },
  { name: 'Danby', lat: 43.3437, lng: -72.9993 },
  { name: 'Mount Tabor', lat: 43.3837, lng: -72.9543 },
  { name: 'Wallingford', lat: 43.4637, lng: -72.9743 },
  { name: 'Clarendon', lat: 43.5337, lng: -72.9643 },
  { name: 'Proctor', lat: 43.6537, lng: -73.0243 },
  { name: 'West Rutland', lat: 43.5937, lng: -73.0393 },
  { name: 'Pittsford', lat: 43.7037, lng: -73.0293 },
  { name: 'Brandon', lat: 43.7937, lng: -73.0843 },
  { name: 'Leicester', lat: 43.8637, lng: -73.0843 },
  { name: 'Salisbury', lat: 43.9137, lng: -73.0993 },
  { name: 'Cornwall', lat: 43.9737, lng: -73.1593 },
  { name: 'Weybridge', lat: 44.0437, lng: -73.2093 },
  { name: 'New Haven', lat: 44.1187, lng: -73.1793 },
  { name: 'Monkton', lat: 44.2037, lng: -73.1243 },
  { name: 'Bristol', lat: 44.1337, lng: -73.0743 },
  { name: 'Lincoln', lat: 44.0937, lng: -72.9643 },
  { name: 'Warren', lat: 44.1087, lng: -72.8618 },
  { name: 'Waitsfield', lat: 44.1887, lng: -72.8268 },
  { name: 'Fayston', lat: 44.2137, lng: -72.8718 },
  { name: 'Duxbury', lat: 44.2937, lng: -72.7993 },
  { name: 'Moretown', lat: 44.2537, lng: -72.7643 },
  { name: 'Middlesex', lat: 44.2987, lng: -72.6993 },
  { name: 'East Montpelier', lat: 44.2837, lng: -72.4868 },
  { name: 'Worcester', lat: 44.3737, lng: -72.5643 },
  { name: 'Elmore', lat: 44.5237, lng: -72.5293 },
  { name: 'Wolcott', lat: 44.5537, lng: -72.4393 },
  { name: 'Craftsbury Common', lat: 44.6437, lng: -72.3543 },
  { name: 'Coventry', lat: 44.8637, lng: -72.2643 },
  { name: 'Charleston', lat: 44.8987, lng: -72.1343 },
  { name: 'Holland', lat: 44.9737, lng: -71.9968 },
  { name: 'Morgan', lat: 44.9137, lng: -71.9643 },
  { name: 'Brighton', lat: 44.8087, lng: -71.8793 },
  { name: 'Ferdinand', lat: 44.7537, lng: -71.8393 },
  { name: 'Maidstone', lat: 44.6537, lng: -71.8643 },
  { name: 'Granby', lat: 44.5837, lng: -71.8843 },
  { name: 'Guildhall', lat: 44.5637, lng: -71.5768 },
  { name: 'Lunenburg', lat: 44.4737, lng: -71.6843 },
  { name: 'Concord', lat: 44.4137, lng: -71.8593 },
  { name: 'Victory', lat: 44.4887, lng: -71.9893 },
  { name: 'Burke', lat: 44.5887, lng: -71.9793 },
  { name: 'Kirby', lat: 44.5437, lng: -71.9243 },
  { name: 'Sutton', lat: 44.6387, lng: -72.0618 },
  { name: 'Sheffield', lat: 44.6737, lng: -72.1068 },
  { name: 'Wheelock', lat: 44.5787, lng: -72.1793 },
  { name: 'Ryegate', lat: 44.1987, lng: -72.1493 },
  { name: 'Barnet', lat: 44.3237, lng: -72.0493 },
  { name: 'Waterford', lat: 44.3737, lng: -71.9193 },
  { name: 'Lemington', lat: 44.7387, lng: -71.5668 },
  { name: 'Canaan', lat: 44.9937, lng: -71.6593 },
  { name: 'Bloomfield', lat: 44.7737, lng: -71.6843 },
  { name: 'Brunswick', lat: 44.6787, lng: -71.6243 },
  { name: 'Maidstone', lat: 44.6537, lng: -71.8643 },
  { name: 'Averill', lat: 44.9937, lng: -71.7593 },
  { name: 'Norton', lat: 44.9937, lng: -71.8093 },
  { name: 'Averys Gore', lat: 44.8637, lng: -71.7593 },
  { name: 'Glastenbury', lat: 42.9737, lng: -73.0543 },
  { name: 'Stratton', lat: 43.1037, lng: -72.9093 },
  { name: 'Winhall', lat: 43.1537, lng: -72.9243 },
  { name: 'Peru', lat: 43.2337, lng: -72.8943 },
  { name: 'Londonderry', lat: 43.2337, lng: -72.7993 },
  { name: 'Weston', lat: 43.2937, lng: -72.7993 },
  { name: 'Andover', lat: 43.3437, lng: -72.7343 },
  { name: 'Chester', lat: 43.2637, lng: -72.5993 },
  { name: 'Cavendish', lat: 43.3837, lng: -72.6068 },
  { name: 'Proctorsville', lat: 43.3987, lng: -72.6318 },
  { name: 'Plymouth', lat: 43.5137, lng: -72.7393 },
  { name: 'Shrewsbury', lat: 43.5537, lng: -72.8093 },
  { name: 'Mendon', lat: 43.6437, lng: -72.8693 },
  { name: 'Pittsfield', lat: 43.7637, lng: -72.7768 },
  { name: 'Stockbridge', lat: 43.7837, lng: -72.7068 },
  { name: 'Rochester', lat: 43.8737, lng: -72.8118 },
  { name: 'Hancock', lat: 43.9337, lng: -72.8593 },
  { name: 'Granville', lat: 43.9837, lng: -72.8543 },
  { name: 'Middletown Springs', lat: 43.4837, lng: -73.1293 },
  { name: 'Ira', lat: 43.5737, lng: -73.0993 },
  { name: 'Tinmouth', lat: 43.5237, lng: -73.0643 },
  { name: 'Mount Holly', lat: 43.4637, lng: -72.8293 },
  { name: 'Belmont', lat: 43.4337, lng: -72.8043 },
  { name: 'Grafton', lat: 43.1737, lng: -72.6243 },
  { name: 'Athens', lat: 43.1437, lng: -72.6243 },
  { name: 'Townshend', lat: 43.0537, lng: -72.6793 },
  { name: 'Newfane', lat: 42.9837, lng: -72.6593 },
  { name: 'Williamsville', lat: 42.9637, lng: -72.6343 },
  { name: 'Dover', lat: 42.9437, lng: -72.8143 },
  { name: 'Wardsboro', lat: 43.0137, lng: -72.8143 },
  { name: 'Jamaica', lat: 43.1037, lng: -72.7793 },
  { name: 'Bondville', lat: 43.1637, lng: -72.8743 },
  { name: 'South Londonderry', lat: 43.2037, lng: -72.7793 },
  { name: 'Rawsonville', lat: 43.1937, lng: -72.8393 },
  { name: 'Rockingham', lat: 43.1787, lng: -72.4843 },
  { name: 'Westminster', lat: 43.0787, lng: -72.4593 },
  { name: 'Putney', lat: 42.9787, lng: -72.5143 },
  { name: 'Dummerston', lat: 42.9237, lng: -72.5543 },
  { name: 'Guilford', lat: 42.8637, lng: -72.5843 },
  { name: 'Vernon', lat: 42.7737, lng: -72.5143 },
  { name: 'Marlboro', lat: 42.8637, lng: -72.7293 },
  { name: 'Wilmington', lat: 42.8637, lng: -72.8693 },
  { name: 'Whitingham', lat: 42.7837, lng: -72.8793 },
  { name: 'Halifax', lat: 42.7837, lng: -72.7243 },
  { name: 'Readsboro', lat: 42.7737, lng: -72.9543 },
  { name: 'Somerset', lat: 42.9837, lng: -72.9143 },
  { name: 'Searsburg', lat: 42.8737, lng: -72.9493 },
  { name: 'Stamford', lat: 42.7837, lng: -73.0693 },
  { name: 'Pownal', lat: 42.7737, lng: -73.2343 },
  { name: 'Shaftsbury', lat: 42.9837, lng: -73.1993 },
  { name: 'Arlington', lat: 43.0737, lng: -73.1493 },
  { name: 'Sunderland', lat: 43.1037, lng: -73.0843 },
  { name: 'Sandgate', lat: 43.1637, lng: -73.1543 },
  { name: 'Rupert', lat: 43.2637, lng: -73.2043 },
  { name: 'Landgrove', lat: 43.2637, lng: -72.8343 },
  { name: 'Weston', lat: 43.2937, lng: -72.7993 },
  { name: 'Baltimore', lat: 43.3637, lng: -72.5593 },
  { name: 'Reading', lat: 43.4837, lng: -72.5793 },
  { name: 'Felchville', lat: 43.4737, lng: -72.5743 },
  { name: 'Weathersfield', lat: 43.4287, lng: -72.4568 },
  { name: 'Ascutney', lat: 43.4337, lng: -72.4293 },
  { name: 'Hartland', lat: 43.5637, lng: -72.3843 },
  { name: 'Quechee', lat: 43.6387, lng: -72.4193 },
  { name: 'Pomfret', lat: 43.7237, lng: -72.4968 },
  { name: 'Barnard', lat: 43.7637, lng: -72.6168 },
  { name: 'Bridgewater', lat: 43.6937, lng: -72.6618 },
  { name: 'Killington', lat: 43.6037, lng: -72.8043 },
  { name: 'Chittenden', lat: 43.6937, lng: -72.9043 },
  { name: 'Goshen', lat: 43.8937, lng: -73.0018 },
  { name: 'Ripton', lat: 43.9837, lng: -72.9768 },
  { name: 'Starksboro', lat: 44.2337, lng: -73.0093 },
  { name: 'Huntington', lat: 44.3237, lng: -72.9768 },
  { name: 'Bolton', lat: 44.3937, lng: -72.8768 },
  { name: 'Buels Gore', lat: 44.4337, lng: -72.9268 },
  { name: 'Jericho', lat: 44.4887, lng: -72.9918 },
  { name: 'Underhill', lat: 44.5287, lng: -72.8993 },
  { name: 'Westford', lat: 44.6237, lng: -73.0193 },
  { name: 'Fairfax', lat: 44.6637, lng: -73.0093 },
  { name: 'Richford', lat: 44.9987, lng: -72.6718 },
];

// Fetch the authoritative VT polygon from the same GeoJSON the game uses.
// Returns an array of [lat, lng] pairs, or null on failure (caller falls back to VT_POLY).
async function fetchVTPolygon() {
  try {
    const url = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';
    const res = await fetch(url, { headers: { 'User-Agent': 'there-from-here-puzzle-gen/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gj = await res.json();
    const feature = gj.features.find(f => f.properties && f.properties.name === 'Vermont');
    if (!feature) throw new Error('VT feature not found');
    const geom = feature.geometry;
    let rings = [];
    if (geom.type === 'Polygon') rings = geom.coordinates;
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(p => rings = rings.concat(p));
    // Use the largest ring (main landmass, excludes islands)
    const best = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
    // Convert [lng, lat] GeoJSON to [lat, lng] for pointInPolygon
    return best.map(c => [c[1], c[0]]);
  } catch (e) {
    console.warn(`  Could not fetch VT GeoJSON polygon: ${e.message}. Using fallback.`);
    return null;
  }
}

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
  for (const town of VT_TOWNS) {
    const d = haversineMiles(lat, lng, town.lat, town.lng);
    if (d < bestDist) { bestDist = d; best = town; }
  }
  return best.name;
}

function randomVTPoint(poly) {
  for (let i = 0; i < 200; i++) {
    const lat = parseFloat((BOUNDS.south + Math.random() * (BOUNDS.north - BOUNDS.south)).toFixed(4));
    const lng = parseFloat((BOUNDS.west  + Math.random() * (BOUNDS.east  - BOUNDS.west)).toFixed(4));
    if (pointInPolygon(lat, lng, poly)) return { lat, lng };
  }
  throw new Error('Could not find valid VT point after 200 attempts');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function snapToRoad(lat, lng, poly) {
  const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'there-from-here-puzzle-gen/1.0' } });
  if (!res.ok) throw new Error(`OSRM nearest ${res.status}`);
  const data = await res.json();
  if (!data.waypoints || !data.waypoints.length) throw new Error('No waypoints from OSRM nearest');
  const [snappedLng, snappedLat] = data.waypoints[0].location;
  const pt = { lat: parseFloat(snappedLat.toFixed(4)), lng: parseFloat(snappedLng.toFixed(4)) };
  if (!pointInPolygon(pt.lat, pt.lng, poly)) throw new Error('Snapped point outside VT');
  return pt;
}

async function getRoute(a, b, waypointCount = 10) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': 'there-from-here-puzzle-gen/1.0' } });
  if (!res.ok) throw new Error(`OSRM route ${res.status}`);
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error('No route from OSRM');
  const route = data.routes[0];
  const coords = route.geometry.coordinates; // [[lng, lat], ...]
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

async function generatePuzzle(id, dateStr, poly) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const rawA = randomVTPoint(poly);
      const rawB = randomVTPoint(poly);
      if (haversineMiles(rawA.lat, rawA.lng, rawB.lat, rawB.lng) < 25) continue;

      const [a, b] = await Promise.all([snapToRoad(rawA.lat, rawA.lng, poly), snapToRoad(rawB.lat, rawB.lng, poly)]);
      await sleep(300);

      const { distanceMiles, waypoints } = await getRoute(a, b);
      if (distanceMiles < 30) continue;

      // Names from local lookup — no Nominatim call needed
      const nameA = nearestTown(a.lat, a.lng);
      const nameB = nearestTown(b.lat, b.lng);

      // Reject if both points map to the same town
      if (nameA === nameB) continue;

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

  console.log('Fetching authoritative VT boundary polygon...');
  const poly = (await fetchVTPolygon()) || VT_POLY;
  console.log(`Using polygon with ${poly.length} points`);

  let existing = { puzzles: [] };
  try {
    existing = JSON.parse(fs.readFileSync('puzzles.json', 'utf8'));
    console.log(`Loaded ${existing.puzzles.length} existing puzzles`);
  } catch (e) {
    console.log('Starting fresh');
  }

  const curated = existing.puzzles.filter(p => p.id <= 6);
  const newPuzzles = [];

  for (let i = 0; i < COUNT; i++) {
    const id = START_ID + i;
    const date = new Date(START_DATE);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    try {
      console.log(`Generating #${id} (${dateStr})...`);
      const puzzle = await generatePuzzle(id, dateStr, poly);
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

/* There From Here — daily Vermont route-drawing game. */
(function () {
  'use strict';

  // ---------- Map projection ----------
  var BOUNDS = { north: 45.017, south: 42.726, west: -73.438, east: -71.464 };
  var SVG_W = 300, SVG_H = 450;
  var PAD = 14;

  function project(lat, lng) {
    var mercLat = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    var mercN = Math.log(Math.tan(Math.PI / 4 + BOUNDS.north * Math.PI / 360));
    var mercS = Math.log(Math.tan(Math.PI / 4 + BOUNDS.south * Math.PI / 360));
    var x = PAD + (lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west) * (SVG_W - 2 * PAD);
    var y = PAD + (mercN - mercLat) / (mercN - mercS) * (SVG_H - 2 * PAD);
    return { x: x, y: y };
  }

  // Vermont outline fallback if GeoJSON fetch fails.
  var VT_POLY = [
    [45.013, -73.343], [45.017, -72.103], [44.916, -71.503], [44.503, -71.573],
    [43.572, -72.456], [42.726, -72.456], [42.726, -73.265], [43.150, -73.404],
    [43.570, -73.438], [44.020, -73.338], [44.500, -73.370], [45.013, -73.343]
  ];

  var vermontPath = null;

  // ---------- Geometry helpers ----------
  function rdpSimplify(points, epsilon) {
    if (points.length < 3) return points;
    var maxDist = 0, maxIdx = 0;
    var start = points[0], end = points[points.length - 1];
    for (var i = 1; i < points.length - 1; i++) {
      var d = perpendicularDistance(points[i], start, end);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > epsilon) {
      var left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
      var right = rdpSimplify(points.slice(maxIdx), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [start, end];
  }
  function perpendicularDistance(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  // ---------- Vermont border (GeoJSON) ----------
  var VT_GEOJSON_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

  function buildVermontPath() {
    return fetch(VT_GEOJSON_URL)
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (gj) {
        var feature = null;
        for (var i = 0; i < gj.features.length; i++) {
          if (gj.features[i].properties && gj.features[i].properties.name === 'Vermont') {
            feature = gj.features[i]; break;
          }
        }
        if (!feature) throw new Error();
        var geom = feature.geometry;
        var rings = [];
        if (geom.type === 'Polygon') rings = geom.coordinates;
        else if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach(function (poly) { rings = rings.concat(poly); });
        }
        var best = null;
        rings.forEach(function (ring) { if (!best || ring.length > best.length) best = ring; });
        if (!best) throw new Error();
        var d = '';
        for (var j = 0; j < best.length; j++) {
          var p = project(best[j][1], best[j][0]);
          d += (j === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ';
        }
        return d + 'Z';
      });
  }

  // ---------- OSRM routing ----------
  function fetchOptimalRoute(pA, pB) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      pA.lng + ',' + pA.lat + ';' + pB.lng + ',' + pB.lat +
      '?overview=full&geometries=geojson';
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) {
        if (!data.routes || !data.routes.length) throw new Error();
        var coords = data.routes[0].geometry.coordinates;
        return rdpSimplify(coords, 0.001).map(function (c) { return [c[1], c[0]]; });
      });
  }

  // ---------- DOM refs ----------
  var svg = document.getElementById('map-svg');
  var canvas = document.getElementById('draw-canvas');
  var ctx = canvas.getContext('2d');
  var puzzleMeta = document.getElementById('puzzle-meta');
  var msgEl = document.getElementById('msg');
  var maxNote = document.getElementById('max-note');
  var SVGNS = 'http://www.w3.org/2000/svg';

  // ---------- State ----------
  var puzzle = null;
  var puzzleIndex = 0;
  var drawnPath = [];
  var drawing = false;
  var hintsUsed = 0;
  var maxScore = 100;
  var submitted = false;
  var ptA = null, ptB = null;
  var PROX = 30;

  // ---------- SVG helpers ----------
  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function jitterPath(points, amt) {
    var d = '';
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var jx = (Math.sin(i * 12.9898 + 1.3) * 43758.5453 % 1) * amt - amt / 2;
      var jy = (Math.sin(i * 78.233 + 2.7) * 43758.5453 % 1) * amt - amt / 2;
      d += (i === 0 ? 'M' : 'L') + (p.x + jx).toFixed(1) + ' ' + (p.y + jy).toFixed(1) + ' ';
    }
    return d;
  }

  function drawMapBase() {
    svg.innerHTML = '';
    var d;
    if (vermontPath) {
      d = vermontPath;
    } else {
      var pts = VT_POLY.map(function (c) { return project(c[0], c[1]); });
      d = jitterPath(pts, 2.2) + 'Z';
    }
    svg.appendChild(el('path', { d: d, class: 'vt-outline' }));
  }

  function drawPoints() {
    ptA = project(puzzle.pointA.lat, puzzle.pointA.lng);
    ptB = project(puzzle.pointB.lat, puzzle.pointB.lng);
    [['A', ptA, puzzle.pointA], ['B', ptB, puzzle.pointB]].forEach(function (item) {
      var letter = item[0], p = item[1], info = item[2];
      svg.appendChild(el('circle', { cx: p.x, cy: p.y, r: 6, class: 'point-marker' }));
      var lbl = el('text', { x: p.x, y: p.y - 9, class: 'point-label', 'text-anchor': 'middle' });
      lbl.textContent = letter;
      svg.appendChild(lbl);
      if (hintsUsed >= 1) {
        var nm = el('text', { x: p.x, y: p.y + 16, class: 'point-name', 'text-anchor': 'middle' });
        nm.textContent = info.name;
        svg.appendChild(nm);
      }
    });
  }

  function drawMountains() {
    var a = project(44.9, -72.8), b = project(42.85, -72.75);
    var mid = project(43.9, -72.9);
    svg.appendChild(el('path', {
      d: 'M' + a.x + ' ' + a.y + ' Q' + mid.x + ' ' + mid.y + ' ' + b.x + ' ' + b.y,
      class: 'mtn-line'
    }));
    var lbl = el('text', { x: mid.x + 6, y: mid.y, class: 'mtn-label' });
    lbl.textContent = 'Green Mountains';
    svg.appendChild(lbl);
  }

  function drawInterstates() {
    var i89 = [[44.476, -73.212], [44.260, -72.575], [44.200, -72.450]].map(function (c) { return project(c[0], c[1]); });
    svg.appendChild(el('path', { d: jitterPath(i89, 1.2), class: 'interstate' }));
    addShield(i89[1].x - 12, i89[1].y - 8, 'I-89');
    var i91 = [[42.726, -72.456], [42.851, -72.558], [43.648, -72.327], [44.4198, -72.0146], [45.0, -71.5]].map(function (c) { return project(c[0], c[1]); });
    svg.appendChild(el('path', { d: jitterPath(i91, 1.2), class: 'interstate' }));
    addShield(i91[2].x + 4, i91[2].y, 'I-91');
  }

  function addShield(x, y, label) {
    svg.appendChild(el('rect', { x: x, y: y - 6, width: 22, height: 12, rx: 3, class: 'shield' }));
    var t = el('text', { x: x + 11, y: y + 3, class: 'shield-label' });
    t.textContent = label;
    svg.appendChild(t);
  }

  function rebuildOverlays() {
    drawMapBase();
    if (hintsUsed >= 2) drawMountains();
    if (hintsUsed >= 3) drawInterstates();
    drawPoints();
  }

  // ---------- Canvas drawing ----------
  function eventToSvgCoords(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * SVG_W,
      y: (clientY - rect.top) / rect.height * SVG_H
    };
  }

  function redrawCanvas() {
    ctx.clearRect(0, 0, SVG_W, SVG_H);
    if (drawnPath.length < 1) return;
    drawInkPath(drawnPath, submitted ? 'rgba(58,50,38,0.45)' : '#3a3226', 3);
  }

  function drawInkPath(path, color, width) {
    if (path.length < 1) return;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (var i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x + Math.sin(i * 0.7) * 0.6, path[i].y + Math.cos(i * 0.9) * 0.6);
    }
    ctx.stroke();
  }

  function pointerDown(e) {
    if (submitted) return;
    e.preventDefault();
    drawing = true;
    drawnPath.push(getPoint(e));
    redrawCanvas();
  }
  function pointerMove(e) {
    if (!drawing || submitted) return;
    e.preventDefault();
    var c = getPoint(e);
    var last = drawnPath[drawnPath.length - 1];
    if (!last || Math.hypot(c.x - last.x, c.y - last.y) > 2) {
      drawnPath.push(c);
      redrawCanvas();
    }
  }
  function pointerUp(e) {
    if (!drawing) return;
    e.preventDefault();
    drawing = false;
  }
  function getPoint(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return eventToSvgCoords(t.clientX, t.clientY);
  }

  // ---------- Controls ----------
  function undo() {
    if (submitted) return;
    drawnPath.splice(drawnPath.length - Math.max(1, Math.round(drawnPath.length * 0.1)));
    redrawCanvas();
    msgEl.textContent = '';
  }
  function clearAll() {
    if (submitted) return;
    drawnPath = [];
    redrawCanvas();
    msgEl.textContent = '';
  }

  function useHint() {
    if (submitted || hintsUsed >= 3) return;
    hintsUsed++;
    maxScore = 100 - hintsUsed * 10;
    document.getElementById('pip' + hintsUsed).classList.add('checked');
    if (hintsUsed >= 3) document.getElementById('hint-btn').disabled = true;
    maxNote.textContent = 'Max score: ' + maxScore;
    rebuildOverlays();
  }

  // ---------- Scoring ----------
  function pathLength(path) {
    var len = 0;
    for (var i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
    return len;
  }

  function distToPath(p, path) {
    var min = Infinity;
    for (var i = 1; i < path.length; i++) {
      var d = distToSegment(p, path[i-1], path[i]);
      if (d < min) min = d;
    }
    if (path.length === 1) min = Math.hypot(p.x - path[0].x, p.y - path[0].y);
    return min;
  }
  function distToSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx*dx + dy*dy;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / l2));
    return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy));
  }

  function evenSample(path, n) {
    if (path.length <= n) return path;
    var out = [];
    for (var i = 0; i < n; i++) out.push(path[Math.round(i * (path.length-1) / (n-1))]);
    return out;
  }

  function computeScore(scoreRoute) {
    var optimal = puzzle.optimalRoute.map(function (c) { return project(c[0], c[1]); });
    var optS = evenSample(optimal, 200);
    var drawnS = evenSample(scoreRoute, 200);

    var sumOpt = 0;
    for (var i = 0; i < optS.length; i++) sumOpt += distToPath(optS[i], drawnS);
    var sumDrawn = 0;
    for (var j = 0; j < drawnS.length; j++) sumDrawn += distToPath(drawnS[j], optS);

    var avgDist = Math.max(sumOpt / optS.length, sumDrawn / drawnS.length);
    var decay = Math.max(20, pathLength(optS) * 0.20);
    var raw = 100 * Math.exp(-Math.pow(avgDist / decay, 1.5)) * (maxScore / 100);

    return {
      score: Math.max(1, Math.min(100, Math.round(raw))),
      optimal: optimal
    };
  }

  // ---------- Submit ----------
  function submit() {
    if (submitted) return;
    if (drawnPath.length < 2) { msgEl.textContent = 'Draw a route from A to B first.'; return; }
    var first = drawnPath[0], last = drawnPath[drawnPath.length - 1];
    if (Math.hypot(first.x - ptA.x, first.y - ptA.y) > PROX ||
        Math.hypot(last.x  - ptB.x, last.y  - ptB.y) > PROX) {
      msgEl.textContent = 'Route must start at A and end at B';
      return;
    }
    submitted = true;
    disableControls();
    msgEl.textContent = '';
    var result = computeScore(drawnPath);
    redrawCanvas();
    animateOptimal(result.optimal, function () { showResults(result); });
  }

  function disableControls() {
    ['undo-btn', 'clear-btn', 'submit-btn', 'hint-btn'].forEach(function (id) {
      document.getElementById(id).disabled = true;
    });
  }

  function animateOptimal(optimal, done) {
    var start = null, DURATION = 2000;
    var totalLen = pathLength(optimal);
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DURATION);
      var target = totalLen * t;
      ctx.clearRect(0, 0, SVG_W, SVG_H);
      drawInkPath(drawnPath, 'rgba(58,50,38,0.45)', 3);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = '#8b2020'; ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(optimal[0].x, optimal[0].y);
      var acc = 0;
      for (var i = 1; i < optimal.length; i++) {
        var seg = Math.hypot(optimal[i].x - optimal[i-1].x, optimal[i].y - optimal[i-1].y);
        if (acc + seg <= target) {
          ctx.lineTo(optimal[i].x, optimal[i].y);
          acc += seg;
        } else {
          var rem = (target - acc) / seg;
          ctx.lineTo(optimal[i-1].x + (optimal[i].x - optimal[i-1].x) * rem,
                     optimal[i-1].y + (optimal[i].y - optimal[i-1].y) * rem);
          break;
        }
      }
      ctx.stroke();
      if (t < 1) requestAnimationFrame(frame); else done();
    }
    requestAnimationFrame(frame);
  }

  // ---------- Results splash ----------
  var BANDS = [
    { min: 90, label: 'Grade A – you got there' },
    { min: 75, label: 'Nice job, bud' },
    { min: 60, label: 'You took the scenic route' },
    { min: 40, label: "You're lost, bud" },
    { min: 1,  label: "You didn't get there from here" }
  ];
  function bandFor(score) {
    for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i].min) return BANDS[i].label;
    return BANDS[BANDS.length - 1].label;
  }

  function showResults(result) {
    var band = bandFor(result.score);
    document.getElementById('score-num').innerHTML = result.score + '<span>/100</span>';
    document.getElementById('band').textContent = band;
    document.getElementById('stats').innerHTML =
      '📍 ' + puzzle.pointA.name + ' → ' + puzzle.pointB.name + '<br>' +
      'Hints used: ' + hintsUsed + '/3';

    document.getElementById('share-btn').onclick = function () {
      var text = 'There From Here #' + puzzle.id + '\n' +
        result.score + '/100 — ' + band + '\n' +
        'Hints: ' + hintsUsed + '/3';
      copyToClipboard(text, this);
    };

    document.getElementById('splash-results').classList.remove('hidden');
    startCountdown();
  }

  function copyToClipboard(text, btn) {
    function ok() { var o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = o; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { alert(text); }
      document.body.removeChild(ta);
    }
  }

  // ---------- Countdown ----------
  function startCountdown() {
    var elTime = document.getElementById('countdown-time');
    function tick() {
      var etNow = etDate(new Date());
      var next = new Date(etNow); next.setHours(24, 0, 0, 0);
      var diff = Math.max(0, next - etNow);
      elTime.textContent = pad(Math.floor(diff/3600000)) + ':' +
        pad(Math.floor(diff%3600000/60000)) + ':' + pad(Math.floor(diff%60000/1000));
    }
    tick(); setInterval(tick, 1000);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function etDate(d) { return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' })); }

  // ---------- Puzzle selection ----------
  function dayOfYearET() {
    var et = etDate(new Date());
    return Math.floor((et - new Date(et.getFullYear(), 0, 0)) / 86400000);
  }

  function init(data) {
    var puzzles = data.puzzles;
    var override = parseInt(new URLSearchParams(window.location.search).get('puzzle'));
    puzzleIndex = (!isNaN(override) && override >= 1 && override <= puzzles.length)
      ? override - 1
      : dayOfYearET() % puzzles.length;
    puzzle = puzzles[puzzleIndex];

    var et = etDate(new Date());
    var dateStr = et.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    var metaText = 'Puzzle #' + puzzle.id + ' • ' + dateStr;
    puzzleMeta.textContent = metaText;
    document.getElementById('splash-puzzle-meta').textContent = metaText;

    rebuildOverlays();
    redrawCanvas();
    bindEvents();

    buildVermontPath().then(function (d) { vermontPath = d; rebuildOverlays(); }).catch(function () {});
    fetchOptimalRoute(puzzle.pointA, puzzle.pointB).then(function (route) {
      if (route && route.length >= 2) puzzle.optimalRoute = route;
    }).catch(function () {});
  }

  function bindEvents() {
    canvas.addEventListener('mousedown', pointerDown);
    window.addEventListener('mousemove', pointerMove);
    window.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('touchstart', pointerDown, { passive: false });
    canvas.addEventListener('touchmove', pointerMove, { passive: false });
    canvas.addEventListener('touchend', pointerUp, { passive: false });

    document.getElementById('undo-btn').onclick = undo;
    document.getElementById('clear-btn').onclick = clearAll;
    document.getElementById('submit-btn').onclick = submit;
    document.getElementById('hint-btn').onclick = useHint;

    document.getElementById('play-btn').onclick = function () {
      document.getElementById('splash-title').classList.add('hidden');
    };
    document.getElementById('close-results').onclick = function () {
      document.getElementById('splash-results').classList.add('hidden');
    };
  }

  // ---------- Load puzzles ----------
  function load() {
    fetch('puzzles.json')
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(init)
      .catch(function () {
        if (window.PUZZLES_FALLBACK) init(window.PUZZLES_FALLBACK);
        else document.getElementById('splash-puzzle-meta').textContent = 'Could not load puzzles.';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();

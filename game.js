/* There From Here — daily Vermont route-drawing game. Phase 1 MVP. */
(function () {
  'use strict';

  var BOUNDS = { north: 45.017, south: 42.726, west: -73.438, east: -71.464 };
  var SVG_W = 300, SVG_H = 450;
  var PAD = 14;

  function project(lat, lng) {
    var x = PAD + (lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west) * (SVG_W - 2 * PAD);
    var y = PAD + (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south) * (SVG_H - 2 * PAD);
    return { x: x, y: y };
  }

  var VT_POLY = [
    [45.013, -73.343], [45.017, -72.103], [44.916, -71.503], [44.503, -71.573],
    [43.572, -72.456], [42.726, -72.456], [42.726, -73.265], [43.150, -73.404],
    [43.570, -73.438], [44.020, -73.338], [44.500, -73.370], [45.013, -73.343]
  ];

  var svg = document.getElementById('map-svg');
  var canvas = document.getElementById('draw-canvas');
  var ctx = canvas.getContext('2d');
  var puzzleMeta = document.getElementById('puzzle-meta');
  var msgEl = document.getElementById('msg');
  var maxNote = document.getElementById('max-note');
  var SVGNS = 'http://www.w3.org/2000/svg';

  var puzzle = null;
  var puzzleIndex = 0;
  var drawnPath = [];
  var drawing = false;
  var hintsUsed = 0;
  var maxScore = 100;
  var submitted = false;
  var ptA = null, ptB = null;
  var PROX = 30;

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
    var pts = VT_POLY.map(function (c) { return project(c[0], c[1]); });
    svg.appendChild(el('path', { d: jitterPath(pts, 2.2) + 'Z', class: 'vt-outline' }));
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
    var a = project(44.9, -72.8), b = project(42.85, -72.75), mid = project(43.9, -72.9);
    svg.appendChild(el('path', { d: 'M' + a.x + ' ' + a.y + ' Q' + mid.x + ' ' + mid.y + ' ' + b.x + ' ' + b.y, class: 'mtn-line' }));
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

  function eventToSvgCoords(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * SVG_W, y: (clientY - rect.top) / rect.height * SVG_H };
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
    e.preventDefault(); drawing = true;
    drawnPath.push(getPoint(e)); redrawCanvas();
  }
  function pointerMove(e) {
    if (!drawing || submitted) return;
    e.preventDefault();
    var c = getPoint(e), last = drawnPath[drawnPath.length - 1];
    if (!last || Math.hypot(c.x - last.x, c.y - last.y) > 2) { drawnPath.push(c); redrawCanvas(); }
  }
  function pointerUp(e) { if (!drawing) return; e.preventDefault(); drawing = false; }
  function getPoint(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return eventToSvgCoords(t.clientX, t.clientY);
  }

  function undo() {
    if (submitted) return;
    drawnPath.splice(drawnPath.length - Math.max(1, Math.round(drawnPath.length * 0.1)));
    redrawCanvas(); msgEl.textContent = '';
  }
  function clearAll() {
    if (submitted) return;
    drawnPath = []; redrawCanvas(); msgEl.textContent = '';
  }

  function useHint() {
    if (submitted || hintsUsed >= 3) return;
    hintsUsed++;
    if (hintsUsed === 1) maxScore = 85;
    else if (hintsUsed === 2) maxScore = 70;
    else maxScore = 55;
    document.getElementById('pip' + hintsUsed).classList.add('checked');
    if (hintsUsed >= 3) document.getElementById('hint-btn').disabled = true;
    maxNote.textContent = 'Max score: ' + maxScore;
    rebuildOverlays();
  }

  function pathLength(path) {
    var len = 0;
    for (var i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
    return len;
  }

  function distToPath(p, path) {
    var min = Infinity;
    for (var i = 1; i < path.length; i++) { var d = distToSegment(p, path[i-1], path[i]); if (d < min) min = d; }
    if (path.length === 1) min = Math.hypot(p.x - path[0].x, p.y - path[0].y);
    return min;
  }
  function distToSegment(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx*dx + dy*dy;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / l2));
    return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy));
  }

  function optimalProjected() {
    return puzzle.optimalRoute.map(function (c) { return project(c[0], c[1]); });
  }

  function computeScore() {
    var optimal = optimalProjected();
    var sum = 0;
    for (var i = 0; i < optimal.length; i++) sum += distToPath(optimal[i], drawnPath);
    var simScore = Math.max(0, 50 * (1 - (sum / optimal.length) / 100));
    var optLen = pathLength(optimal), drawnLen = pathLength(drawnPath) || 1;
    var effScore = Math.min(1, optLen / drawnLen) * 30;
    var axis = { x: ptB.x - ptA.x, y: ptB.y - ptA.y };
    var axisLen = Math.hypot(axis.x, axis.y) || 1;
    var ux = axis.x / axisLen, uy = axis.y / axisLen;
    var prevProj = null, backtrack = 0, forward = 0;
    for (var j = 0; j < drawnPath.length; j++) {
      var proj = (drawnPath[j].x - ptA.x) * ux + (drawnPath[j].y - ptA.y) * uy;
      if (prevProj !== null) { var delta = proj - prevProj; if (delta < 0) backtrack -= delta; else forward += delta; }
      prevProj = proj;
    }
    var dirScore = 20 * Math.max(0, (forward / (forward + backtrack || 1) - 0.5) / 0.5);
    var raw = (simScore + effScore + dirScore) * (maxScore / 100);
    return { score: Math.max(1, Math.min(100, Math.round(raw))), ratio: drawnLen / optLen, optimal: optimal };
  }

  function submit() {
    if (submitted) return;
    if (drawnPath.length < 2) { msgEl.textContent = 'Draw a route from A to B first.'; return; }
    var first = drawnPath[0], last = drawnPath[drawnPath.length - 1];
    if (Math.hypot(first.x - ptA.x, first.y - ptA.y) > PROX || Math.hypot(last.x - ptB.x, last.y - ptB.y) > PROX) {
      msgEl.textContent = 'Route must start at A and end at B'; return;
    }
    submitted = true; msgEl.textContent = '';
    var result = computeScore();
    disableControls(); redrawCanvas();
    animateOptimal(result.optimal, function () { showResults(result); });
  }

  function disableControls() {
    ['undo-btn', 'clear-btn', 'submit-btn', 'hint-btn'].forEach(function (id) {
      document.getElementById(id).disabled = true;
    });
  }

  function animateOptimal(optimal, done) {
    var start = null, DURATION = 2000, totalLen = pathLength(optimal);
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DURATION), target = totalLen * t;
      ctx.clearRect(0, 0, SVG_W, SVG_H);
      drawInkPath(drawnPath, 'rgba(58,50,38,0.45)', 3);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#8b2020'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(optimal[0].x, optimal[0].y);
      var acc = 0;
      for (var i = 1; i < optimal.length; i++) {
        var seg = Math.hypot(optimal[i].x - optimal[i-1].x, optimal[i].y - optimal[i-1].y);
        if (acc + seg <= target) { ctx.lineTo(optimal[i].x, optimal[i].y); acc += seg; }
        else { var rem = (target - acc) / seg; ctx.lineTo(optimal[i-1].x + (optimal[i].x - optimal[i-1].x) * rem, optimal[i-1].y + (optimal[i].y - optimal[i-1].y) * rem); break; }
      }
      ctx.stroke();
      if (t < 1) requestAnimationFrame(frame); else done();
    }
    requestAnimationFrame(frame);
  }

  var BANDS = [
    { min: 90, label: 'Grade A — You know these roads like the back of your hand' },
    { min: 75, label: "Local Knowledge — Solid. You've driven this state." },
    { min: 60, label: 'Leaf Peeper — Not bad for a flatlander' },
    { min: 40, label: "Lost on a Class 4 Road — The crow could've told you" },
    { min: 1,  label: "You Can't Get There From Here — Classic" }
  ];
  function bandFor(score) {
    for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i].min) return BANDS[i].label;
    return BANDS[BANDS.length - 1].label;
  }

  function showResults(result) {
    var results = document.getElementById('results');
    results.classList.remove('hidden');
    document.getElementById('score-num').innerHTML = result.score + '<span>/100</span>';
    var band = bandFor(result.score);
    document.getElementById('band').textContent = band;
    document.getElementById('stats').innerHTML =
      'Hints used: ' + hintsUsed + '/3<br>' +
      'Route length: ' + result.ratio.toFixed(2) + '× optimal<br>' +
      '📍 ' + puzzle.pointA.name + ' → ' + puzzle.pointB.name;
    document.getElementById('share-btn').onclick = function () {
      var text = 'There From Here 🦅 #' + puzzle.id + '\n' +
        'Score: ' + result.score + '/100 — "' + band + '"\n' +
        '📍 ' + puzzle.pointA.name + ' → ' + puzzle.pointB.name + '\n' +
        'Hints used: ' + hintsUsed + '/3';
      copyToClipboard(text, this);
    };
    results.scrollIntoView({ behavior: 'smooth' });
    startCountdown();
  }

  function copyToClipboard(text, btn) {
    function ok() { var orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = orig; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { alert(text); }
      document.body.removeChild(ta);
    }
  }

  function startCountdown() {
    var elTime = document.getElementById('countdown-time');
    function tick() {
      var etNow = etDate(new Date()), next = new Date(etNow.getTime());
      next.setHours(24, 0, 0, 0);
      var diff = Math.max(0, next - etNow);
      elTime.textContent = pad(Math.floor(diff/3600000)) + ':' + pad(Math.floor(diff%3600000/60000)) + ':' + pad(Math.floor(diff%60000/1000));
    }
    tick(); setInterval(tick, 1000);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function etDate(d) { return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' })); }

  function dayOfYearET() {
    var et = etDate(new Date());
    return Math.floor((et - new Date(et.getFullYear(), 0, 0)) / 86400000);
  }

  function init(data) {
    var puzzles = data.puzzles;
var override = parseInt(new URLSearchParams(window.location.search).get('puzzle'));
puzzleIndex = (!isNaN(override) && override >= 1 && override <= puzzles.length)
  ? override - 1
  : dayOfYearET() % puzzles.length;    puzzle = puzzles[puzzleIndex];
    var et = etDate(new Date());
    puzzleMeta.textContent = 'Puzzle #' + puzzle.id + ' • ' + et.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    rebuildOverlays(); redrawCanvas(); bindEvents();
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
  }

  function load() {
    fetch('puzzles.json')
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(init)
      .catch(function () {
        if (window.PUZZLES_FALLBACK) init(window.PUZZLES_FALLBACK);
        else puzzleMeta.textContent = 'Could not load puzzles.json.';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();

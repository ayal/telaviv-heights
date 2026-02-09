import * as THREE from 'three';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import Stats from 'three/addons/libs/stats.module.js';

// --- Constants ---
const WORLD_WIDTH = 256;
const WORLD_DEPTH = 256;
const TERRAIN_SIZE = 7500;
const ZERO_POINT = { x: -3750, z: -3750, y: 1000 };

// --- Map constants (coordinate mapping) ---
const NW_LAT = 32.097765;
const NW_LNG = 34.743147;
const LNG_RANGE = 34.798637 - NW_LNG;           // east extent
const LAT_RANGE = 255 * 0.00035;                 // south extent

// --- State ---
let camera, controls, scene, renderer, stats;
let map, mapMarker;
let prevMapX = 0, prevMapY = 0;
let terrainData, terrainTexture; // kept for GLB export
let terrainColorData; // 256×256 ImageData for 3MF vertex colors
const clock = new THREE.Clock();
const EXAGGERATION = 15;

// --- Custom address highlights ---
// Each entry: { lat, lng, row, col, color: [r, g, b], radius, label }
const HIGHLIGHTS = [
  { lat: 32.065174, lng: 34.780929, row: 93, col: 174, color: [255, 80, 180], radius: 3, label: 'Maze 69' },
];

// --- Init ---
function init() {
  const container = document.getElementById('container');

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
  camera.position.set(ZERO_POINT.x, ZERO_POINT.y, ZERO_POINT.z);

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd1e5);
  scene.fog = new THREE.FogExp2(0xbfd1e5, 0.00015);

  // Generate height data from bigdata
  const data = generateHeight(WORLD_WIDTH, WORLD_DEPTH);

  // Detect local maxima (radius 20 = ~750m neighborhood — only major peaks)
  const { grid: peaks, points: peakPoints } = detectLocalMaxima(data, WORLD_WIDTH, WORLD_DEPTH, 20);

  // Geometry
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, WORLD_WIDTH - 1, WORLD_DEPTH - 1);
  geometry.rotateX(-Math.PI / 2);

  terrainData = data;

  const vertices = geometry.attributes.position.array;
  for (let i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
    vertices[j + 1] = data[i] * EXAGGERATION;
  }
  geometry.computeVertexNormals();

  // Texture
  terrainTexture = new THREE.CanvasTexture(generateTexture(data, WORLD_WIDTH, WORLD_DEPTH, peaks));
  terrainTexture.wrapS = THREE.ClampToEdgeWrapping;
  terrainTexture.wrapT = THREE.ClampToEdgeWrapping;

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: terrainTexture }));
  scene.add(mesh);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // First Person Controls (mouse look + click to move)
  controls = new FirstPersonControls(camera, renderer.domElement);
  controls.movementSpeed = 500;
  controls.lookSpeed = 0.1;

  // Look toward the terrain center
  controls.lookAt(0, 0, 0);

  // Stats
  stats = new Stats();
  stats.dom.style.position = 'absolute';
  stats.dom.style.top = '0px';
  stats.dom.style.left = '0px';
  container.appendChild(stats.dom);

  // Leaflet mini-map
  map = L.map('map-canvas', {
    center: [NW_LAT, NW_LNG],
    zoom: 16,
    zoomControl: false,
    attributionControl: false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Arrow marker for camera position
  mapMarker = L.marker([NW_LAT, NW_LNG], {
    icon: L.divIcon({
      className: 'map-arrow',
      html: '<svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 22,22 12,17 2,22" fill="#e53935" stroke="#fff" stroke-width="1.5"/></svg>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
  }).addTo(map);

  // Map zoom buttons
  document.getElementById('zoom-in').addEventListener('click', (e) => {
    e.stopPropagation();
    map.zoomIn();
  });
  document.getElementById('zoom-out').addEventListener('click', (e) => {
    e.stopPropagation();
    map.zoomOut();
  });

  window.addEventListener('resize', onWindowResize);

  // Export buttons
  document.getElementById('export-3mf').addEventListener('click', export3MF);
  document.getElementById('export-glb').addEventListener('click', exportGLB);
  document.getElementById('export-stl').addEventListener('click', exportSTL);

  // Add labels to peaks (async — geocoding happens in background)
  addPeakLabels(peakPoints);

  // Add custom highlight labels
  for (const hl of HIGHLIGHTS) {
    const elev = data[hl.row * WORLD_WIDTH + hl.col];
    const { x, y, z } = gridToWorld(hl.row, hl.col, elev);

    // 3D sprite (pink background)
    const sprite = makeTextSprite(hl.label, elev, `rgba(${hl.color.join(',')}, 0.9)`);
    sprite.position.set(x, y + 180, z);
    scene.add(sprite);

    // 2D map marker
    L.marker([hl.lat, hl.lng], {
      icon: L.divIcon({
        className: 'peak-label',
        html: `<div class="peak-label-inner" style="background:rgba(${hl.color.join(',')},0.9)">${hl.label}</div>`,
        iconSize: [50, 14],
        iconAnchor: [25, 7],
      }),
    }).addTo(map);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.handleResize();
}

// --- Build solid terrain mesh for export ---
function buildSolidTerrain({ withTexture = false } = {}) {
  const group = new THREE.Group();
  const halfSize = TERRAIN_SIZE / 2;
  const BASE_Y = -50;

  const h = (row, col) => terrainData[row * WORLD_WIDTH + col] * EXAGGERATION;
  const xPos = (col) => -halfSize + (col / (WORLD_WIDTH - 1)) * TERRAIN_SIZE;
  const zPos = (row) => -halfSize + (row / (WORLD_DEPTH - 1)) * TERRAIN_SIZE;

  // 1. Top surface
  const topGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, WORLD_WIDTH - 1, WORLD_DEPTH - 1);
  topGeo.rotateX(-Math.PI / 2);
  const tv = topGeo.attributes.position.array;
  for (let i = 0, j = 0, l = tv.length; i < l; i++, j += 3) {
    tv[j + 1] = terrainData[i] * EXAGGERATION;
  }
  topGeo.computeVertexNormals();
  const topMat = withTexture
    ? new THREE.MeshStandardMaterial({ map: terrainTexture })
    : new THREE.MeshStandardMaterial({ color: 0xcccccc });
  group.add(new THREE.Mesh(topGeo, topMat));

  // 2. Bottom surface
  const botGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE);
  botGeo.rotateX(Math.PI / 2);
  botGeo.translate(0, BASE_Y, 0);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
  group.add(new THREE.Mesh(botGeo, wallMat));

  // 3. Side walls
  function buildWall(edgePoints) {
    const n = edgePoints.length;
    const pos = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const p = edgePoints[i];
      pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
      pos[i * 6 + 3] = p.x; pos[i * 6 + 4] = BASE_Y; pos[i * 6 + 5] = p.z;
    }
    for (let i = 0; i < n - 1; i++) {
      const t0 = i * 2, b0 = i * 2 + 1;
      const t1 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
      idx.push(t0, b0, t1);
      idx.push(t1, b0, b1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, wallMat);
  }

  let edge = [];
  for (let c = WORLD_WIDTH - 1; c >= 0; c--) edge.push({ x: xPos(c), y: h(0, c), z: zPos(0) });
  group.add(buildWall(edge));
  edge = [];
  for (let c = 0; c < WORLD_WIDTH; c++) edge.push({ x: xPos(c), y: h(WORLD_DEPTH - 1, c), z: zPos(WORLD_DEPTH - 1) });
  group.add(buildWall(edge));
  edge = [];
  for (let r = 0; r < WORLD_DEPTH; r++) edge.push({ x: xPos(0), y: h(r, 0), z: zPos(r) });
  group.add(buildWall(edge));
  edge = [];
  for (let r = WORLD_DEPTH - 1; r >= 0; r--) edge.push({ x: xPos(WORLD_WIDTH - 1), y: h(r, WORLD_WIDTH - 1), z: zPos(r) });
  group.add(buildWall(edge));

  return group;
}

// --- Export as 3MF with per-vertex colors (native Bambu Studio format) ---
async function export3MF() {
  const btn = document.getElementById('export-3mf');
  btn.disabled = true;
  btn.textContent = 'Building...';
  await new Promise(r => setTimeout(r, 50)); // let UI update

  const halfSize = TERRAIN_SIZE / 2;
  const BASE_Y = -50;
  const S = 200 / TERRAIN_SIZE; // scale to 200mm wide
  const W = WORLD_WIDTH, D = WORLD_DEPTH;
  const cd = terrainColorData.data;

  // --- Color palette (quantised to 6-bit per channel) ---
  const colorMap = new Map();
  const palette = [];
  function cIdx(r, g, b) {
    r &= 0xFC; g &= 0xFC; b &= 0xFC;
    const key = (r << 16) | (g << 8) | b;
    let id = colorMap.get(key);
    if (id === undefined) {
      id = palette.length;
      palette.push(`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}FF`);
      colorMap.set(key, id);
    }
    return id;
  }
  const GRAY = cIdx(0x99, 0x99, 0x99);

  // --- Vertices (position + color index) ---
  const vx = [], vy = [], vz = [], vc = [];

  // Top surface (W × D vertices)
  for (let r = 0; r < D; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      vx.push((-halfSize + (c / 255) * TERRAIN_SIZE) * S);
      vz.push((-halfSize + (r / 255) * TERRAIN_SIZE) * S);
      vy.push(terrainData[i] * EXAGGERATION * S);
      const pi = i * 4;
      vc.push(cIdx(cd[pi], cd[pi + 1], cd[pi + 2]));
    }
  }

  // Wall-bottom vertices: North, South, West, East edges
  const ws = {};

  ws.N = vx.length;
  for (let c = 0; c < W; c++) {
    vx.push((-halfSize + (c / 255) * TERRAIN_SIZE) * S);
    vy.push(BASE_Y * S); vz.push(-halfSize * S); vc.push(GRAY);
  }
  ws.S = vx.length;
  for (let c = 0; c < W; c++) {
    vx.push((-halfSize + (c / 255) * TERRAIN_SIZE) * S);
    vy.push(BASE_Y * S); vz.push(halfSize * S); vc.push(GRAY);
  }
  ws.W = vx.length;
  for (let r = 0; r < D; r++) {
    vx.push(-halfSize * S); vy.push(BASE_Y * S);
    vz.push((-halfSize + (r / 255) * TERRAIN_SIZE) * S); vc.push(GRAY);
  }
  ws.E = vx.length;
  for (let r = 0; r < D; r++) {
    vx.push(halfSize * S); vy.push(BASE_Y * S);
    vz.push((-halfSize + (r / 255) * TERRAIN_SIZE) * S); vc.push(GRAY);
  }

  // Bottom 4 corners
  const botStart = vx.length;
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    vx.push(cx * halfSize * S); vy.push(BASE_Y * S);
    vz.push(cz * halfSize * S); vc.push(GRAY);
  }

  // --- Triangles ---
  const t1 = [], t2 = [], t3 = [];
  function tri(a, b, c) { t1.push(a); t2.push(b); t3.push(c); }

  // Top surface
  for (let r = 0; r < 255; r++) {
    for (let c = 0; c < 255; c++) {
      const tl = r * 256 + c;
      tri(tl, tl + 256, tl + 1);
      tri(tl + 1, tl + 256, tl + 257);
    }
  }

  // Bottom (winding reversed for downward normal)
  tri(botStart, botStart + 2, botStart + 1);
  tri(botStart, botStart + 3, botStart + 2);

  // North wall (row=0, outward = -Z)
  for (let c = 0; c < 255; c++) {
    const T0 = c, T1 = c + 1, B0 = ws.N + c, B1 = ws.N + c + 1;
    tri(B0, B1, T1); tri(B0, T1, T0);
  }
  // South wall (row=255, outward = +Z)
  for (let c = 0; c < 255; c++) {
    const T0 = 255 * 256 + c, T1 = T0 + 1, B0 = ws.S + c, B1 = ws.S + c + 1;
    tri(T0, T1, B1); tri(T0, B1, B0);
  }
  // West wall (col=0, outward = -X)
  for (let r = 0; r < 255; r++) {
    const T0 = r * 256, T1 = (r + 1) * 256, B0 = ws.W + r, B1 = ws.W + r + 1;
    tri(T0, B0, B1); tri(T0, B1, T1);
  }
  // East wall (col=255, outward = +X)
  for (let r = 0; r < 255; r++) {
    const T0 = r * 256 + 255, T1 = (r + 1) * 256 + 255, B0 = ws.E + r, B1 = ws.E + r + 1;
    tri(T0, T1, B1); tri(T0, B1, B0);
  }

  // --- Build 3MF XML ---
  btn.textContent = 'Packaging...';
  await new Promise(r => setTimeout(r, 50));

  const xml = [];
  xml.push(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
 xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
 xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
<resources>
<m:colorgroup id="1">\n`);
  for (const c of palette) xml.push(`<m:color color="${c}"/>\n`);
  xml.push(`</m:colorgroup>
<object id="2" type="model"><mesh>
<vertices>\n`);
  for (let i = 0; i < vx.length; i++) {
    xml.push(`<vertex x="${vx[i].toFixed(4)}" y="${vy[i].toFixed(4)}" z="${vz[i].toFixed(4)}"/>\n`);
  }
  xml.push(`</vertices>\n<triangles>\n`);
  for (let i = 0; i < t1.length; i++) {
    const a = t1[i], b = t2[i], c = t3[i];
    xml.push(`<triangle v1="${a}" v2="${b}" v3="${c}" pid="1" p1="${vc[a]}" p2="${vc[b]}" p3="${vc[c]}"/>\n`);
  }
  xml.push(`</triangles>
</mesh></object>
</resources>
<build><item objectid="2"/></build>
</model>`);

  const modelXml = xml.join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels').file('.rels', rels);
  zip.folder('3D').file('3dmodel.model', modelXml);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'telaviv-terrain.3mf';
  a.click();
  URL.revokeObjectURL(a.href);

  btn.disabled = false;
  btn.textContent = 'Export 3MF';
}

// --- Export as STL (works with Bambu Studio, PrusaSlicer, Cura, etc.) ---
async function exportSTL() {
  const btn = document.getElementById('export-stl');
  btn.disabled = true;
  btn.textContent = 'Building...';

  const { STLExporter } = await import('three/addons/exporters/STLExporter.js');

  const group = buildSolidTerrain();
  // Scale to ~200mm wide for printing
  const printScale = 200 / TERRAIN_SIZE;
  group.scale.set(printScale, printScale, printScale);
  group.updateMatrixWorld(true);

  btn.textContent = 'Exporting...';
  const exporter = new STLExporter();
  const stlBinary = exporter.parse(group, { binary: true });

  const blob = new Blob([stlBinary], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'telaviv-terrain.stl';
  a.click();
  URL.revokeObjectURL(a.href);
  btn.disabled = false;
  btn.textContent = 'Export STL';
}

// --- Export as GLB (preserves color texture) ---
async function exportGLB() {
  const btn = document.getElementById('export-glb');
  btn.disabled = true;
  btn.textContent = 'Building...';

  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');

  const group = buildSolidTerrain({ withTexture: true });
  const printScale = 0.2 / TERRAIN_SIZE;
  group.scale.set(printScale, printScale, printScale);

  btn.textContent = 'Exporting...';
  const exporter = new GLTFExporter();
  exporter.parse(
    group,
    (buffer) => {
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'telaviv-terrain.glb';
      a.click();
      URL.revokeObjectURL(a.href);
      btn.disabled = false;
      btn.textContent = 'Export GLB';
    },
    (error) => {
      console.error('GLB export failed:', error);
      btn.disabled = false;
      btn.textContent = 'Export GLB';
    },
    { binary: true }
  );
}

// --- Height generation (full float precision) ---
function generateHeight(width, height) {
  const size = width * height;
  const data = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    // Keep full float precision, clamp sea to 0
    data[i] = bigdata[i] > 0 ? bigdata[i] : 0;
  }

  return data;
}

// --- Detect local maxima ---
// Returns { grid, points } where grid is for texture coloring and points is the list of peak locations.
function detectLocalMaxima(data, width, height, radius) {
  const result = new Float32Array(width * height);
  const peakPoints = []; // { row, col, elevation }
  const MIN_ELEVATION = 3;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const elev = data[idx];

      if (elev < MIN_ELEVATION) continue;

      let maxNeighbor = -Infinity;
      let isMax = true;

      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
          const nElev = data[nr * width + nc];
          if (nElev > elev) { isMax = false; }
          if (nElev > maxNeighbor) maxNeighbor = nElev;
        }
      }

      if (isMax && elev > MIN_ELEVATION) {
        const prominence = elev - maxNeighbor;
        result[idx] = Math.min(1, 0.5 + prominence * 0.5);
        peakPoints.push({ row, col, elevation: elev });
      }
    }
  }

  // Spread peaks for texture visibility
  const spread = new Float32Array(width * height);
  const SPREAD_RADIUS = 3;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      if (result[idx] === 0) continue;
      for (let dr = -SPREAD_RADIUS; dr <= SPREAD_RADIUS; dr++) {
        for (let dc = -SPREAD_RADIUS; dc <= SPREAD_RADIUS; dc++) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
          const dist = Math.sqrt(dr * dr + dc * dc);
          if (dist > SPREAD_RADIUS) continue;
          const falloff = 1 - dist / (SPREAD_RADIUS + 1);
          const nIdx = nr * width + nc;
          spread[nIdx] = Math.max(spread[nIdx], result[idx] * falloff);
        }
      }
    }
  }

  // Deduplicate: keep only the tallest peak within MIN_PEAK_DIST cells
  const MIN_PEAK_DIST = 12;
  peakPoints.sort((a, b) => b.elevation - a.elevation); // tallest first
  const kept = [];
  for (const p of peakPoints) {
    const tooClose = kept.some(k => {
      const dr = p.row - k.row;
      const dc = p.col - k.col;
      return Math.sqrt(dr * dr + dc * dc) < MIN_PEAK_DIST;
    });
    if (!tooClose) kept.push(p);
  }

  return { grid: spread, points: kept };
}

// --- Convert grid row/col to lat/lng ---
function gridToLatLng(row, col) {
  const lat = NW_LAT - (row / (WORLD_DEPTH - 1)) * LAT_RANGE;
  const lng = NW_LNG + (col / (WORLD_WIDTH - 1)) * LNG_RANGE;
  return { lat, lng };
}

// --- Convert grid row/col to 3D world position ---
function gridToWorld(row, col, elevation) {
  const x = -TERRAIN_SIZE / 2 + (col / (WORLD_WIDTH - 1)) * TERRAIN_SIZE;
  const z = -TERRAIN_SIZE / 2 + (row / (WORLD_DEPTH - 1)) * TERRAIN_SIZE;
  const y = elevation * EXAGGERATION;
  return { x, y, z };
}

// --- Reverse geocode using Nominatim (free) ---
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    // Build a short label: road + house number
    const a = data.address || {};
    const road = a.road || a.neighbourhood || a.suburb || a.city_district || data.display_name?.split(',')[0] || '';
    const num = a.house_number || '';
    return num ? `${road} ${num}` : road || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// --- Create a 3D text sprite for the scene ---
function makeTextSprite(text, elevation, bgColor = 'rgba(200, 30, 30, 0.85)') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;

  // Background
  ctx.fillStyle = bgColor;
  const metrics = ctx.measureText(text); // measure first with default font
  ctx.font = 'bold 36px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const pad = 16;
  const boxW = textWidth + pad * 2;
  const boxH = 52;
  const boxX = (512 - boxW) / 2;
  const boxY = (128 - boxH) / 2;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 8);
  ctx.fill();

  // Text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  // Elevation subtitle
  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`${elevation.toFixed(1)}m`, 256, 92);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(200, 50, 1);
  return sprite;
}

// --- Add peak labels to both maps ---
async function addPeakLabels(peakPoints) {
  // Throttle Nominatim: 1 req/sec
  for (let i = 0; i < peakPoints.length; i++) {
    const p = peakPoints[i];
    const { lat, lng } = gridToLatLng(p.row, p.col);
    const { x, y, z } = gridToWorld(p.row, p.col, p.elevation);

    if (i > 0) await new Promise(r => setTimeout(r, 1100));
    const label = await reverseGeocode(lat, lng);
    console.log(`Peak: ${label} (${p.elevation.toFixed(1)}m) at ${lat.toFixed(5)}, ${lng.toFixed(5)}`);

    // 2D map marker
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'peak-label',
        html: `<div class="peak-label-inner">${label}<br><small>${p.elevation.toFixed(1)}m</small></div>`,
        iconSize: [50, 14],
        iconAnchor: [25, 14],
      }),
    }).addTo(map);

    // 3D sprite
    const sprite = makeTextSprite(label, p.elevation);
    sprite.position.set(x, y + 150, z); // float above the peak
    scene.add(sprite);
  }
}

// --- Build highlight mask from HIGHLIGHTS array ---
function buildHighlightMask(width, height) {
  // Returns a Float32Array of [r, g, b, intensity] per pixel (flattened: 4 * width * height)
  const mask = new Float32Array(width * height * 4);
  for (const hl of HIGHLIGHTS) {
    const { row: cr, col: cc, color, radius } = hl;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist > radius) continue;
        const falloff = 1 - dist / (radius + 1);
        const idx = (nr * width + nc) * 4;
        if (falloff > mask[idx + 3]) {
          mask[idx]     = color[0];
          mask[idx + 1] = color[1];
          mask[idx + 2] = color[2];
          mask[idx + 3] = falloff;
        }
      }
    }
  }
  return mask;
}

// --- Texture generation (color bands tuned for 0-60m Tel Aviv range) ---
function generateTexture(data, width, height, peaks) {
  const vector3 = new THREE.Vector3(0, 0, 0);
  const sun = new THREE.Vector3(1, 1, 1).normalize();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);

  const image = context.getImageData(0, 0, width, height);
  const imageData = image.data;
  const hlMask = buildHighlightMask(width, height);

  for (let i = 0, j = 0, l = imageData.length; i < l; i += 4, j++) {
    // Normal calculation using float neighbors for smoother shading
    vector3.x = (data[j - 2] || 0) - (data[j + 2] || 0);
    vector3.y = 2;
    vector3.z = (data[j - width * 2] || 0) - (data[j + width * 2] || 0);
    vector3.normalize();

    const shade = vector3.dot(sun);

    if (bigdata[j] <= 0.1) {
      // Sea — depth-based blue gradient
      const depth = Math.min(Math.abs(bigdata[j]), 20);
      const t = depth / 20;
      imageData[i] = 40 - t * 20;       // R: darker with depth
      imageData[i + 1] = 80 - t * 30;   // G: darker with depth
      imageData[i + 2] = 160 - t * 40;  // B: deep blue
    } else {
      // Land — continuous color gradient tuned for 0-60m
      //   0-5m:   coastal sand / light brown
      //   5-15m:  light green
      //   15-35m: rich green
      //   35-50m: yellow-green
      //   50m+:   golden yellow / sandy
      const h = data[j];
      let r, g, b;

      if (h < 5) {
        const t = h / 5;
        // Coastal sand -> light green
        r = (160 - t * 100) + shade * 30;
        g = (140 - t * 40) + shade * 40;
        b = (90 - t * 60) + shade * 15;
      } else if (h < 15) {
        const t = (h - 5) / 10;
        // Light green -> rich green
        r = (60 - t * 20) + shade * 40;
        g = (100 + t * 20) + shade * 50;
        b = (30 - t * 10) + shade * 15;
      } else if (h < 35) {
        const t = (h - 15) / 20;
        // Rich green -> yellow-green
        r = (40 + t * 80) + shade * 55;
        g = (120 + t * 10) + shade * 45;
        b = (20 - t * 5) + shade * 10;
      } else if (h < 50) {
        const t = (h - 35) / 15;
        // Yellow-green -> golden
        r = (120 + t * 60) + shade * 40;
        g = (130 - t * 10) + shade * 35;
        b = (15 + t * 15) + shade * 10;
      } else {
        // Golden / sandy peak
        const t = Math.min((h - 50) / 10, 1);
        r = (180 + t * 30) + shade * 20;
        g = (120 + t * 20) + shade * 25;
        b = (30 + t * 30) + shade * 15;
      }
      // Blend in peak highlight (bold red)
      const peak = peaks[j];
      if (peak > 0) {
        r = r * (1 - peak) + 230 * peak;
        g = g * (1 - peak) + 30 * peak;
        b = b * (1 - peak) + 30 * peak;
      }

      // Blend in custom address highlights
      const hlIdx = j * 4;
      const hlA = hlMask[hlIdx + 3];
      if (hlA > 0) {
        r = r * (1 - hlA) + hlMask[hlIdx] * hlA;
        g = g * (1 - hlA) + hlMask[hlIdx + 1] * hlA;
        b = b * (1 - hlA) + hlMask[hlIdx + 2] * hlA;
      }

      imageData[i] = Math.min(255, Math.max(0, r));
      imageData[i + 1] = Math.min(255, Math.max(0, g));
      imageData[i + 2] = Math.min(255, Math.max(0, b));
    }
    imageData[i + 3] = 255;
  }

  context.putImageData(image, 0, 0);

  // Save for 3MF per-vertex color sampling
  terrainColorData = image;

  // Scale 4x for detail
  const canvasScaled = document.createElement('canvas');
  canvasScaled.width = width * 4;
  canvasScaled.height = height * 4;

  const ctx2 = canvasScaled.getContext('2d');
  ctx2.scale(4, 4);
  ctx2.drawImage(canvas, 0, 0);

  const image2 = ctx2.getImageData(0, 0, canvasScaled.width, canvasScaled.height);
  const imgData2 = image2.data;

  // Subtle noise for natural texture
  for (let i = 0, l = imgData2.length; i < l; i += 4) {
    const v = ~~(Math.random() * 4);
    imgData2[i] += v;
    imgData2[i + 1] += v;
    imgData2[i + 2] += v;
  }

  ctx2.putImageData(image2, 0, 0);
  return canvasScaled;
}

// --- Sync 2D map with camera ---
function getCameraHeading() {
  // Get the forward direction the camera is looking at
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // atan2 of x/z gives heading (0 = north = -Z, clockwise)
  return Math.atan2(dir.x, -dir.z) * (180 / Math.PI);
}

function updateMap() {
  const dx = camera.position.x - ZERO_POINT.x;
  const dz = camera.position.z - ZERO_POINT.z;
  const lng = NW_LNG + (dx / TERRAIN_SIZE) * LNG_RANGE;
  const lat = NW_LAT - (dz / TERRAIN_SIZE) * LAT_RANGE;
  const heading = getCameraHeading();

  const latlng = L.latLng(lat, lng);
  map.panTo(latlng, { animate: false });
  mapMarker.setLatLng(latlng);

  // Rotate the SVG inside the marker icon
  const icon = mapMarker._icon;
  if (icon) {
    const svg = icon.querySelector('svg');
    if (svg) {
      svg.style.transform = `rotate(${heading}deg)`;
      svg.style.transformOrigin = 'center center';
    }
  }
}

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);
  controls.update(clock.getDelta());
  renderer.render(scene, camera);
  updateMap();
  stats.update();
}

init();
animate();

// Expose for debugging
window._cam = camera;
window._controls = controls;

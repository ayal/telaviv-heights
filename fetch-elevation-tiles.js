// Fetches high-resolution elevation data from AWS Terrain Tiles (Terrarium encoding)
// These are free, no API key needed, and much higher resolution than SRTM

const fs = require('fs');
const https = require('https');
const { createCanvas, loadImage } = require('canvas');

const GRID = 256;
const NW_LAT = 32.097765;
const NW_LNG = 34.743147;
const LAT_RANGE = 255 * 0.00035;
const LNG_RANGE = 34.798637 - 34.743147;
const SE_LAT = NW_LAT - LAT_RANGE;
const SE_LNG = NW_LNG + LNG_RANGE;

// Tile math helpers
function lngToTileX(lng, zoom) {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}
function latToTileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom);
}

function fetchTile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Terrarium encoding: elevation = (R * 256 + G + B / 256) - 32768
function terrariumDecode(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

async function main() {
  // Use zoom 14 for good resolution (~10m per pixel)
  const zoom = 14;
  
  // Find which tiles cover our bounding box
  const xMin = Math.floor(lngToTileX(NW_LNG, zoom));
  const xMax = Math.floor(lngToTileX(SE_LNG, zoom));
  const yMin = Math.floor(latToTileY(NW_LAT, zoom));
  const yMax = Math.floor(latToTileY(SE_LAT, zoom));

  console.log(`Zoom: ${zoom}`);
  console.log(`Tile range: x=${xMin}-${xMax}, y=${yMin}-${yMax}`);
  console.log(`Tiles to fetch: ${(xMax - xMin + 1) * (yMax - yMin + 1)}`);

  // Fetch all tiles and stitch them into a big image
  const tileSize = 256;
  const tilesX = xMax - xMin + 1;
  const tilesY = yMax - yMin + 1;
  
  // We'll store raw pixel data for all tiles
  const totalW = tilesX * tileSize;
  const totalH = tilesY * tileSize;
  
  // Store elevation values for the stitched area
  const elevationGrid = new Float32Array(totalW * totalH);
  
  for (let ty = yMin; ty <= yMax; ty++) {
    for (let tx = xMin; tx <= xMax; tx++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tx}/${ty}.png`;
      console.log(`Fetching tile ${zoom}/${tx}/${ty}...`);
      
      const buf = await fetchTile(url);
      const img = await loadImage(buf);
      
      // Draw to canvas to get pixel data
      const canvas = createCanvas(tileSize, tileSize);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, tileSize, tileSize).data;
      
      // Decode elevations and place into the stitched grid
      const offsetX = (tx - xMin) * tileSize;
      const offsetY = (ty - yMin) * tileSize;
      
      for (let py = 0; py < tileSize; py++) {
        for (let px = 0; px < tileSize; px++) {
          const srcIdx = (py * tileSize + px) * 4;
          const r = imgData[srcIdx];
          const g = imgData[srcIdx + 1];
          const b = imgData[srcIdx + 2];
          const elev = terrariumDecode(r, g, b);
          
          const destX = offsetX + px;
          const destY = offsetY + py;
          elevationGrid[destY * totalW + destX] = elev;
        }
      }
    }
  }
  
  console.log(`\nStitched elevation grid: ${totalW}x${totalH}`);

  // Now sample the 256x256 grid from the stitched elevation data
  // Map our lat/lng bounds to pixel coordinates in the stitched image
  const result = new Float64Array(GRID * GRID);
  
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const lat = NW_LAT - (row / (GRID - 1)) * LAT_RANGE;
      const lng = NW_LNG + (col / (GRID - 1)) * LNG_RANGE;
      
      // Convert lat/lng to pixel position in our stitched image
      const globalPixelX = (lngToTileX(lng, zoom) - xMin) * tileSize;
      const globalPixelY = (latToTileY(lat, zoom) - yMin) * tileSize;
      
      // Bilinear interpolation for smooth results
      const px = Math.max(0, Math.min(totalW - 2, Math.floor(globalPixelX)));
      const py = Math.max(0, Math.min(totalH - 2, Math.floor(globalPixelY)));
      const fx = globalPixelX - px;
      const fy = globalPixelY - py;
      
      const e00 = elevationGrid[py * totalW + px];
      const e10 = elevationGrid[py * totalW + px + 1];
      const e01 = elevationGrid[(py + 1) * totalW + px];
      const e11 = elevationGrid[(py + 1) * totalW + px + 1];
      
      const elev = e00 * (1 - fx) * (1 - fy) +
                   e10 * fx * (1 - fy) +
                   e01 * (1 - fx) * fy +
                   e11 * fx * fy;
      
      result[row * GRID + col] = elev;
    }
  }
  
  console.log(`Sampled ${GRID}x${GRID} grid`);
  console.log(`Min elevation: ${Math.min(...result)}`);
  console.log(`Max elevation: ${Math.max(...result)}`);
  
  // Write bigdata-tiles.js
  const values = Array.from(result).map(v => +v.toFixed(6));
  const output = `bigdata = [${values.join(',')}]\n`;
  fs.writeFileSync('bigdata-tiles.js', output);
  console.log(`\nWritten to bigdata-tiles.js`);
  console.log('To use it: cp bigdata-tiles.js bigdata.js');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

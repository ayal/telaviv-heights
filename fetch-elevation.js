// Fetches elevation data for the Tel Aviv rectangle using Open-Elevation API
// Produces the same 256x256 grid as the original bigdata.js

const fs = require('fs');

const GRID = 256;
const NW_LAT = 32.097765;
const NW_LNG = 34.743147;
const LAT_RANGE = 255 * 0.00035;  // ~0.08925 degrees south
const LNG_RANGE = 34.798637 - 34.743147;  // ~0.05549 degrees east

const API_URL = 'https://api.open-elevation.com/api/v1/lookup';
const BATCH_SIZE = 256; // points per request (API can handle ~1000)
const DELAY_MS = 500;   // delay between requests to be polite

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBatch(locations) {
  const body = JSON.stringify({ locations });
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.results.map(r => r.elevation);
}

async function main() {
  // Build the full grid of lat/lng points (row by row, NW to SE)
  const allPoints = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const lat = NW_LAT - (row / (GRID - 1)) * LAT_RANGE;
      const lng = NW_LNG + (col / (GRID - 1)) * LNG_RANGE;
      allPoints.push({ latitude: lat, longitude: lng });
    }
  }

  console.log(`Total points: ${allPoints.length}`);
  console.log(`NW: ${allPoints[0].latitude}, ${allPoints[0].longitude}`);
  console.log(`SE: ${allPoints[allPoints.length - 1].latitude}, ${allPoints[allPoints.length - 1].longitude}`);
  console.log(`Batch size: ${BATCH_SIZE}, total batches: ${Math.ceil(allPoints.length / BATCH_SIZE)}`);
  console.log();

  const elevations = [];
  const totalBatches = Math.ceil(allPoints.length / BATCH_SIZE);

  for (let i = 0; i < allPoints.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = allPoints.slice(i, i + BATCH_SIZE);

    let retries = 3;
    while (retries > 0) {
      try {
        const results = await fetchBatch(batch);
        elevations.push(...results);
        process.stdout.write(`\rBatch ${batchNum}/${totalBatches} done (${elevations.length}/${allPoints.length} points)`);
        break;
      } catch (err) {
        retries--;
        if (retries === 0) {
          console.error(`\nFailed batch ${batchNum} after 3 retries: ${err.message}`);
          process.exit(1);
        }
        console.warn(`\nRetrying batch ${batchNum}: ${err.message}`);
        await sleep(2000);
      }
    }

    if (i + BATCH_SIZE < allPoints.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n\nDone! Writing bigdata.js...');

  const output = `bigdata = [${elevations.join(',')}]\n`;
  fs.writeFileSync('bigdata-new.js', output);

  console.log(`Written to bigdata-new.js (${elevations.length} points)`);
  console.log(`Min elevation: ${Math.min(...elevations)}`);
  console.log(`Max elevation: ${Math.max(...elevations)}`);
  console.log('\nTo use it: cp bigdata-new.js bigdata.js');
}

main();

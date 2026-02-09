// Fetches elevation data for the Tel Aviv rectangle using Google Maps Elevation API
// Usage: node fetch-elevation-google.js YOUR_API_KEY

const fs = require('fs');
const https = require('https');

// Load .env file
const envFile = fs.readFileSync('.env', 'utf8');
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) process.env[key.trim()] = val.join('=').trim();
});

const API_KEY = process.argv[2] || process.env.GOOGLE_API_KEY;
if (!API_KEY) {
  console.error('Usage: node fetch-elevation-google.js [API_KEY]  (or set GOOGLE_API_KEY in .env)');
  process.exit(1);
}

const GRID = 256;
const NW_LAT = 32.097765;
const NW_LNG = 34.743147;
const LAT_RANGE = 255 * 0.00035;
const LNG_RANGE = 34.798637 - 34.743147;

// Keep batches small to fit in GET URL length limits
const BATCH_SIZE = 100;
const DELAY_MS = 100;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchElevations(locations) {
  const locs = locations.map(l => `${l.lat.toFixed(6)},${l.lng.toFixed(6)}`).join('|');
  const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${locs}&key=${API_KEY}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (body.status !== 'OK') {
            reject(new Error(`API error: ${body.status} - ${body.error_message || ''}`));
            return;
          }
          resolve(body.results.map(r => r.elevation));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  // Build the full grid of lat/lng points
  const allPoints = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const lat = NW_LAT - (row / (GRID - 1)) * LAT_RANGE;
      const lng = NW_LNG + (col / (GRID - 1)) * LNG_RANGE;
      allPoints.push({ lat, lng });
    }
  }

  const totalBatches = Math.ceil(allPoints.length / BATCH_SIZE);
  console.log(`Total points: ${allPoints.length}`);
  console.log(`Batch size: ${BATCH_SIZE}, total batches: ${totalBatches}`);
  console.log();

  const elevations = [];

  for (let i = 0; i < allPoints.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = allPoints.slice(i, i + BATCH_SIZE);

    let retries = 3;
    while (retries > 0) {
      try {
        const results = await fetchElevations(batch);
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
  fs.writeFileSync('bigdata.js', output);

  console.log(`Written to bigdata.js (${elevations.length} points)`);
  console.log(`Min elevation: ${Math.min(...elevations)}`);
  console.log(`Max elevation: ${Math.max(...elevations)}`);
}

main();

/**
 * Seed script: reads Maghery_Route_FINAL.xlsx and inserts
 * 1 route, 20 sections, and 602 stops into the database.
 *
 * Run: node scripts/seed-route.mjs
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import { read, utils } from "xlsx";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

// ── Parse Excel ──────────────────────────────────────────────────────────────
const xlsxPath = "/home/ubuntu/upload/Maghery_Route_FINAL.xlsx";
const wb = read(readFileSync(xlsxPath));
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = utils.sheet_to_json(ws, { header: 1, defval: "" });

// Row 0 is the header
const HEADER = rows[0];
console.log("Columns:", HEADER);

const COL = {
  section:      0,  // Section
  box:          1,  // Box
  stopOrder:    2,  // Stop Order
  propertyType: 3,  // Property Type
  side:         4,  // Side
  road:         5,  // Road
  houseNumber:  6,  // House No
  eircode:      7,  // Eircode
  residents:    8,  // Residents
  aliases:      9,  // Aliases
  searchTags:   10, // Search Tags
  dog:          11, // Dog
  safePlace:    12, // Safe Place
  notes:        13, // Notes
};

// ── Build section order ───────────────────────────────────────────────────────
const sectionOrder = [];
const sectionSeen = new Set();
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const name = String(row[COL.section] || "").trim();
  if (name && !sectionSeen.has(name)) {
    sectionSeen.add(name);
    sectionOrder.push({ name, box: Number(row[COL.box]) || sectionOrder.length + 1 });
  }
}
console.log(`Found ${sectionOrder.length} sections`);

// ── Connect ───────────────────────────────────────────────────────────────────
const conn = await createConnection(DB_URL);

// ── Wipe existing data ────────────────────────────────────────────────────────
await conn.execute("DELETE FROM stops");
await conn.execute("DELETE FROM sections");
await conn.execute("DELETE FROM routes");
console.log("Cleared existing data");

// ── Insert route ──────────────────────────────────────────────────────────────
const shareToken = nanoid(32);
const [routeResult] = await conn.execute(
  "INSERT INTO routes (name, description, shareToken) VALUES (?, ?, ?)",
  ["Maghery Route", "An Post delivery route — Maghery, Co. Donegal", shareToken]
);
const routeId = routeResult.insertId;
console.log(`Route inserted: id=${routeId}, shareToken=${shareToken}`);

// ── Insert sections ───────────────────────────────────────────────────────────
const sectionIdMap = {}; // name → db id
for (let i = 0; i < sectionOrder.length; i++) {
  const { name, box } = sectionOrder[i];
  const [res] = await conn.execute(
    "INSERT INTO sections (routeId, position, name, boxNumber) VALUES (?, ?, ?, ?)",
    [routeId, i + 1, name, box]
  );
  sectionIdMap[name] = res.insertId;
}
console.log(`Sections inserted: ${Object.keys(sectionIdMap).length}`);

// ── Insert stops ──────────────────────────────────────────────────────────────
let stopCount = 0;
const batch = [];

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const sectionName = String(row[COL.section] || "").trim();
  if (!sectionName) continue;

  const sectionId = sectionIdMap[sectionName];
  if (!sectionId) {
    console.warn(`  Unknown section at row ${i}: "${sectionName}"`);
    continue;
  }

  const residents  = String(row[COL.residents]    || "").trim();
  const aliases    = String(row[COL.aliases]       || "").trim();
  const searchTags = String(row[COL.searchTags]    || "").trim();
  const notes      = String(row[COL.notes]         || "").trim();
  const safePlace  = String(row[COL.safePlace]     || "").trim();
  const dogRaw     = String(row[COL.dog]           || "").trim().toLowerCase();
  const hasDog     = dogRaw === "yes" || dogRaw === "true" || dogRaw === "1" || dogRaw === "dog";
  const side       = String(row[COL.side]          || "").trim();
  const eircode    = String(row[COL.eircode]        || "").trim();
  const road       = String(row[COL.road]           || "").trim();
  const houseNum   = String(row[COL.houseNumber]    || "").trim();
  const propType   = String(row[COL.propertyType]   || "").trim();
  const stopOrder  = Number(row[COL.stopOrder])     || i;

  batch.push([
    sectionId, routeId, stopOrder, propType, side, road, houseNum,
    eircode, residents, aliases, searchTags, hasDog ? 1 : 0, safePlace, notes,
  ]);
  stopCount++;
}

// Insert in batches of 100
const BATCH_SIZE = 100;
for (let b = 0; b < batch.length; b += BATCH_SIZE) {
  const chunk = batch.slice(b, b + BATCH_SIZE);
  const placeholders = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
  const values = chunk.flat();
  await conn.execute(
    `INSERT INTO stops
      (sectionId, routeId, stopOrder, propertyType, side, road, houseNumber,
       eircode, residents, aliases, searchTags, hasDog, safePlace, notes)
     VALUES ${placeholders}`,
    values
  );
  console.log(`  Inserted stops ${b + 1}–${Math.min(b + BATCH_SIZE, batch.length)}`);
}

await conn.end();
console.log(`\n✅ Seed complete: 1 route, ${sectionOrder.length} sections, ${stopCount} stops`);
console.log(`   Share token: ${shareToken}`);

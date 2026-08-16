import fs from "fs";
import mysql from "mysql2/promise";

const DATA_FILE = "/tmp/ranafast_data.json";
const ROUTE_NAME = "Ranafast Route";

async function seed() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const sections = data.sections;
    const stops = data.stops;

    console.log(`\n🚀 Adding ${ROUTE_NAME} to existing database`);
    console.log(`   Sections: ${Object.keys(sections).length}, Stops: ${stops.length}`);

    // Create route
    const [routeResult] = await conn.query(
      "INSERT INTO routes (name, description) VALUES (?, ?)",
      [ROUTE_NAME, `Post route for ${ROUTE_NAME}`]
    );
    const routeId = routeResult.insertId;
    console.log(`✓ Created route ID ${routeId}: ${ROUTE_NAME}`);

    // Create sections
    const sectionMap = {}; // box_number -> section.id
    for (const [boxNum, sectionName] of Object.entries(sections)) {
      const [sectionResult] = await conn.query(
        "INSERT INTO sections (routeId, position, name, boxNumber) VALUES (?, ?, ?, ?)",
        [routeId, parseInt(boxNum), sectionName, parseInt(boxNum)]
      );
      sectionMap[boxNum] = sectionResult.insertId;
    }
    console.log(`✓ Created ${Object.keys(sectionMap).length} sections`);

    // Seed stops in batches
    let batchCount = 0;
    let skipped = 0;
    for (let i = 0; i < stops.length; i += 50) {
      const batch = stops.slice(i, i + 50);
      for (const stop of batch) {
        const boxNum = stop.box_number;
        const sectionId = sectionMap[boxNum];
        if (!sectionId) {
          skipped++;
          continue;
        }

        const side = stop.side || "";
        const roadRef = stop.route_reference || "";
        const houseName = stop.house_name || null;
        const houseNum = stop.house_number || null;
        const businessName = stop.business_name || null;
        const propType = stop.property_type || "Residential";
        const residents = stop.residents || "";
        const aliases = stop.aliases || null;
        const eircode = stop.eircode || null;
        const hasDog = stop.has_dog === "yes" ? 1 : 0;
        const safePlace = stop.safe_place || null;
        const notes = stop.notes || null;

        await conn.query(
          `INSERT INTO stops (
            sectionId, routeId, stopOrder, side, road, houseName, houseNumber,
            businessName, propertyType, residents, aliases, eircode, hasDog,
            safePlace, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sectionId,
            routeId,
            parseInt(stop.stop_order) || 0,
            side,
            roadRef,
            houseName,
            houseNum,
            businessName,
            propType,
            residents,
            aliases,
            eircode,
            hasDog,
            safePlace,
            notes,
          ]
        );
      }
      batchCount++;
      const batchSize = Math.min(50, stops.length - i * 50);
      console.log(`✓ Batch ${batchCount}: seeded ${batchSize} stops`);
    }

    console.log(`✓ Total seeded: ${stops.length - skipped} stops (${skipped} skipped)`);
    console.log(`\n✅ ${ROUTE_NAME} ready! Open the app and select from the route list.\n`);
  } finally {
    await conn.end();
  }
}

seed().catch(console.error);

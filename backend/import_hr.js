require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const pool = require('./db');

async function importHR() {
  const client = await pool.connect();
  const results = [];

  try {
    // 1. Read CSV file into memory
    await new Promise((resolve, reject) => {
      fs.createReadStream('hr_data.csv')
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Found ${results.length} total rows in hr_data.csv. Beginning DB transaction...`);

    // 2. Wrap inserts in a transaction
    await client.query('BEGIN');

    let insertedCount = 0;
    let skippedCount = 0;

    for (const rawEmp of results) {
      // Clean keys and values (strips whitespace and hidden BOM characters)
      const emp = {};
      for (const key in rawEmp) {
        const cleanKey = key.trim().replace(/^\uFEFF/, '');
        emp[cleanKey] = rawEmp[key] ? rawEmp[key].trim() : '';
      }

      // Map CSV headers (hr_id -> employee_id, department -> rank)
      const empId = emp.hr_id || emp.employee_id || emp.id || emp.ID;
      const name = emp.name || emp.Name || '';
      const rank = emp.department || emp.rank || emp.Rank || '';

      if (empId && empId.length === 8) {
        await client.query(
          `INSERT INTO hr_employees (employee_id, name, rank) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (employee_id) DO UPDATE SET name = EXCLUDED.name, rank = EXCLUDED.rank`,
          [empId, name, rank]
        );
        insertedCount++;
      } else {
        skippedCount++;
        console.warn(`Skipped invalid ID row: "${empId}" (Length must be exactly 8)`);
      }
    }

    await client.query('COMMIT');
    console.log(`\nImport Summary:`);
    console.log(`✅ Successfully committed to DB: ${insertedCount} records`);
    console.log(`⚠️ Skipped rows: ${skippedCount} records`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Import failed, transaction rolled back:", err);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

importHR();
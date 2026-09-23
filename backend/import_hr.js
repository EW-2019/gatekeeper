require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const pool = require('./db');

// Change it to an exportable function
async function importHR() {
  const client = await pool.connect();
  const results = [];

  try {
    // Force path resolution to find the file inside the root folder cleanly
    const csvPath = path.join(__dirname, 'hr_data.csv');
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    let logOutput = `Found ${results.length} total rows in hr_data.csv. Beginning DB transaction...\n`;

    await client.query('BEGIN');

    let insertedCount = 0;
    let skippedCount = 0;

    for (const rawEmp of results) {
      const emp = {};
      for (const key in rawEmp) {
        const cleanKey = key.trim().replace(/^\uFEFF/, '');
        emp[cleanKey] = rawEmp[key] ? rawEmp[key].trim() : '';
      }

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
        logOutput += `⚠️ Skipped invalid ID row: "${empId}" (Length must be exactly 8)\n`;
      }
    }

    await client.query('COMMIT');
    logOutput += `\nImport Summary:\n✅ Successfully committed to DB: ${insertedCount} records\n⚠️ Skipped rows: ${skippedCount} records`;
    return { success: true, logOutput };

  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, logOutput: `❌ Import failed: ${err.message}` };
  } finally {
    client.release();
    // REMOVED pool.end() and process.exit() so your server doesn't die!
  }
}

// Export it so server.js can see it
module.exports = { importHR };

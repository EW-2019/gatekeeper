require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString || undefined,
  user: connectionString ? undefined : (process.env.PGUSER || 'postgres'),
  host: connectionString ? undefined : (process.env.PGHOST || 'localhost'),
  database: connectionString ? undefined : (process.env.PGDATABASE || 'reception_db'),
  password: connectionString ? undefined : (process.env.PGPASSWORD || '199321'),
  port: connectionString ? undefined : (parseInt(process.env.PGPORT, 10) || 5432),
  ssl: connectionString ? { rejectUnauthorized: false } : false
});

const initDb = async () => {
  let client;
  try {
    client = await pool.connect();
    
    // 1. GUARANTEE TABLES ARE CREATED FIRST
    await client.query(`
      CREATE TABLE IF NOT EXISTS hr_employees (
        employee_id VARCHAR(8) PRIMARY KEY,
        name VARCHAR(100),
        rank VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        appointer_id VARCHAR(8) REFERENCES hr_employees(employee_id),
        appointer_name VARCHAR(100) NOT NULL,
        appointer_rank VARCHAR(50) NOT NULL,
        appointer_phone VARCHAR(20) NOT NULL,
        guest_name VARCHAR(100) NOT NULL,
        guest_rank VARCHAR(50) NOT NULL,
        guest_phone VARCHAR(20) NOT NULL,
        reason TEXT NOT NULL,
        classification VARCHAR(20) CHECK (classification IN ('classified', 'unclassified')),
        stay_duration_type VARCHAR(10) CHECK (stay_duration_type IN ('hours', 'days')),
        stay_duration_value INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'checked_in', 'expired')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checked_in_at TIMESTAMP,
        expires_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gate_messages (
        id SERIAL PRIMARY KEY,
        sender VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
    `);
    console.log("[DB] Database schema initialized successfully.");

    // 2. RUN AUTO-IMPORT IMMEDIATELY AFTER TABLES ARE READY
    const csvPath = path.join(__dirname, 'hr_data.csv');
    if (fs.existsSync(csvPath)) {
      const results = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });

      console.log(`[DB-AUTO-IMPORT] Found ${results.length} rows in hr_data.csv. Syncing...`);
      await client.query('BEGIN');

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
        }
      }
      await client.query('COMMIT');
      console.log(`[DB-AUTO-IMPORT] System verified. HR data synced successfully!`);
    } else {
      console.log(`[DB-AUTO-IMPORT] Warning: hr_data.csv not found at ${csvPath}`);
    }

  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error("[DB] Error initializing database or importing CSV:", err.message);
  } finally {
    if (client) client.release();
  }
};

initDb();

module.exports = pool;

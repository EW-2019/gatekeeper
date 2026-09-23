require('dotenv').config();
const { Pool } = require('pg');

// Check if we are running on Render (which uses DATABASE_URL)
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  // If DATABASE_URL exists, use it. Otherwise, use your local configuration fallback.
  connectionString: connectionString || undefined,
  user: connectionString ? undefined : (process.env.PGUSER || 'postgres'),
  host: connectionString ? undefined : (process.env.PGHOST || 'localhost'),
  database: connectionString ? undefined : (process.env.PGDATABASE || 'reception_db'),
  password: connectionString ? undefined : (process.env.PGPASSWORD || '199321'),
  port: connectionString ? undefined : (parseInt(process.env.PGPORT, 10) || 5432),
  
  // CRUCIAL FOR RENDER: Free cloud databases strictly require SSL encryption
  ssl: connectionString ? { rejectUnauthorized: false } : false
});

const initDb = async () => {
  let client;
  try {
    client = await pool.connect();
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
    `);
    console.log("[DB] Database schema initialized successfully.");
  } catch (err) {
    console.error("[DB] Error initializing database:", err.message);
  } finally {
    if (client) client.release();
  }
};

initDb();

module.exports = pool;

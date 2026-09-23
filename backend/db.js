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

      CREATE TABLE IF NOT EXISTS gate_messages (
        id SERIAL PRIMARY KEY,
        sender VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[DB] Database schema initialized successfully (hr_employees, appointments, gate_messages).");
  } catch (err) {
    console.error("[DB] Error initializing database:", err.message);
  } finally {
    if (client) client.release();
  }
};

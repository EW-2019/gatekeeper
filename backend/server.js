require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const readline = require('readline');
const pool = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const STATIC_IP = process.env.STATIC_IP ? process.env.STATIC_IP.trim() : null;

app.use(cors());
app.use(express.json());

// --- HELPER FUNCTIONS ---
async function updateExpirations() {
  const expiredRecords = await pool.query(
    `UPDATE appointments 
     SET status = 'expired' 
     WHERE status = 'checked_in' AND expires_at <= NOW() 
     RETURNING *`
  );

  // Notify socket clients about any newly expired appointments
  if (expiredRecords.rows.length > 0) {
    expiredRecords.rows.forEach(record => {
      io.emit('status_change', record);
    });
  }
}

// --- API ENDPOINTS ---

// 1. Verify Appointer 8-Digit ID
app.get('/api/verify-id/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM hr_employees WHERE employee_id = $1', [id]);
    if (result.rows.length > 0) {
      res.json({ valid: true, employee: result.rows[0] });
    } else {
      res.status(404).json({ valid: false, message: 'Unauthorized ID' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create Appointment
app.post('/api/appointments', async (req, res) => {
  const {
    appointer_id, appointer_name, appointer_rank, appointer_phone,
    guest_name, guest_rank, guest_phone, reason, classification,
    stay_duration_type, stay_duration_value
  } = req.body;

  try {
    const hrCheck = await pool.query('SELECT * FROM hr_employees WHERE employee_id = $1', [appointer_id]);
    if (hrCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized Appointer ID' });
    }

    const query = `
      INSERT INTO appointments 
      (appointer_id, appointer_name, appointer_rank, appointer_phone, guest_name, guest_rank, guest_phone, reason, classification, stay_duration_type, stay_duration_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *;
    `;
    const values = [appointer_id, appointer_name, appointer_rank, appointer_phone, guest_name, guest_rank, guest_phone, reason, classification, stay_duration_type, stay_duration_value];

    const result = await pool.query(query, values);
    const newAppointment = result.rows[0];

    io.emit('new_appointment', newAppointment);
    res.status(201).json(newAppointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Guard View (Omits detailed reason field; excludes expired/dismissed/cancelled)
app.get('/api/guard/appointments', async (req, res) => {
  try {
    await updateExpirations();
    const active = await pool.query(
      `SELECT id, appointer_name, appointer_rank, appointer_phone, guest_name, guest_rank, guest_phone, classification, stay_duration_type, stay_duration_value, created_at 
       FROM appointments WHERE status = 'pending' ORDER BY created_at DESC`
    );
    const checkedIn = await pool.query(
      `SELECT id, appointer_name, appointer_rank, appointer_phone, guest_name, guest_rank, guest_phone, classification, stay_duration_type, stay_duration_value, checked_in_at, expires_at 
       FROM appointments WHERE status = 'checked_in' ORDER BY checked_in_at DESC`
    );
    res.json({ active: active.rows, checkedIn: checkedIn.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Command View (Excludes expired & dismissed & cancelled appointments)
app.get('/api/command/appointments', async (req, res) => {
  try {
    await updateExpirations();
    const result = await pool.query(
      `SELECT * FROM appointments 
       WHERE status IN ('pending', 'checked_in') 
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Guard Check-in Action
app.post('/api/guard/checkin/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const appt = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (appt.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const record = appt.rows[0];
    const checkedInAt = new Date();
    let expiresAt = new Date(checkedInAt);

    if (record.stay_duration_type === 'hours') {
      expiresAt.setHours(expiresAt.getHours() + parseInt(record.stay_duration_value, 10));
    } else {
      expiresAt.setDate(expiresAt.getDate() + parseInt(record.stay_duration_value, 10));
    }

    const updated = await pool.query(
      `UPDATE appointments SET status = 'checked_in', checked_in_at = $1, expires_at = $2 WHERE id = $3 RETURNING *`,
      [checkedInAt, expiresAt, id]
    );

    io.emit('status_change', updated.rows[0]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Command Clear/Dismiss Action
app.post('/api/appointments/dismiss/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'dismissed' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    io.emit('status_change', result.rows[0]);
    res.json({ success: true, appointment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Command Cancel Action
app.post('/api/appointments/cancel/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    io.emit('status_change', result.rows[0]);
    res.json({ success: true, appointment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CHAT ENDPOINTS (Guard <-> Mobile Command) ---

// Get all messages
app.get('/api/chat/messages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM gate_messages ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send new message
app.post('/api/chat/messages', async (req, res) => {
  const { sender, message } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO gate_messages (sender, message) VALUES ($1, $2) RETURNING *',
      [sender, message]
    );
    const newMessage = result.rows[0];
    io.emit('new_chat_message', newMessage);
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all chat messages
app.delete('/api/chat/messages', async (req, res) => {
  try {
    await pool.query('DELETE FROM gate_messages');
    io.emit('chat_cleared');
    res.json({ success: true, message: 'Chat history cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PRIVATE ADMIN TRIGGER ROUTE ---
const { importHR } = require('./import_hr');

app.get('/cloud-admin-trigger-import', async (req, res) => {
  try {
    const result = await importHR();
    if (result.success) {
      res.send(`<h1>Import Complete!</h1><pre>${result.logOutput}</pre>`);
    } else {
      res.status(500).send(`<h1>Import Failed</h1><pre>${result.logOutput}</pre>`);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// --- SERVE BOTH REACT FRONTEND BUILDS ---

// 1. Appointer Web Dashboard (/appointer)
const appointerBuildPath = path.join(__dirname, 'build-appointer');
app.use('/appointer', express.static(appointerBuildPath));
app.get('/appointer/*', (req, res) => {
  res.sendFile(path.join(appointerBuildPath, 'index.html'));
});

// 2. Guard Desktop Dashboard (Root /)
const guardBuildPath = path.join(__dirname, 'build');
app.use(express.static(guardBuildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(guardBuildPath, 'index.html'));
});

// --- NETWORK DISCOVERY & INTERACTIVE SELECTION ---
function getLocalNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 of interfaces[k]) {
      if (k2.family === 'IPv4' && !k2.internal) {
        addresses.push({ name: k, ip: k2.address });
      }
    }
  }
  return addresses;
}

server.listen(PORT, '0.0.0.0', () => {
  const localInterfaces = getLocalNetworkIPs();
  const options = [];

  console.log("\n==================================================");
  console.log("     RECEPTION SYSTEM BACKEND & MULTI-GATEWAY     ");
  console.log("==================================================");
  console.log(` Server is active and listening on port ${PORT}\n`);
  console.log(" [DETECTED NETWORK INTERFACES & ENDPOINTS]:\n");

  // Option 1: Localhost
  const localhostOption = {
    label: "LOCALHOST (Same Computer Testing)",
    ip: "localhost",
    guardUrl: `http://localhost:${PORT}`,
    appointerUrl: `http://localhost:${PORT}/appointer`,
    apiUrl: `http://localhost:${PORT}/api`
  };
  options.push(localhostOption);
  console.log(` 1. ${localhostOption.label}`);
  console.log(`    --> Guard Web Dashboard:     ${localhostOption.guardUrl}`);
  console.log(`    --> Appointer Web Portal:    ${localhostOption.appointerUrl}\n`);

  // LAN Options
  localInterfaces.forEach((iface) => {
    const opt = {
      label: `LAN (${iface.name} - ${iface.ip})`,
      ip: iface.ip,
      guardUrl: `http://${iface.ip}:${PORT}`,
      appointerUrl: `http://${iface.ip}:${PORT}/appointer`,
      apiUrl: `http://${iface.ip}:${PORT}/api`
    };
    options.push(opt);
    const idx = options.length;
    console.log(` ${idx}. LOCAL ETHERNET / WI-FI NETWORK: [${iface.name}]`);
    console.log(`    --> IP Address:              ${iface.ip}`);
    console.log(`    --> Guard Web Dashboard:     ${opt.guardUrl}`);
    console.log(`    --> Appointer Web Portal:    ${opt.appointerUrl}`);
    console.log(`    --> Mobile API Base URL:     ${opt.apiUrl}\n`);
  });

  // Public Static IP Option
  if (STATIC_IP && STATIC_IP.length > 0) {
    const staticOpt = {
      label: `PUBLIC STATIC IP (${STATIC_IP})`,
      ip: STATIC_IP,
      guardUrl: `http://${STATIC_IP}:${PORT}`,
      appointerUrl: `http://${STATIC_IP}:${PORT}/appointer`,
      apiUrl: `http://${STATIC_IP}:${PORT}/api`
    };
    options.push(staticOpt);
    const idx = options.length;
    console.log(` ${idx}. PUBLIC STATIC IP (Ethio Telecom WAN Access):`);
    console.log(`    --> IP Address:              ${STATIC_IP}`);
    console.log(`    --> Guard Web Dashboard:     ${staticOpt.guardUrl}`);
    console.log(`    --> Appointer Web Portal:    ${staticOpt.appointerUrl}`);
    console.log(`    --> Mobile API Base URL:     ${staticOpt.apiUrl}\n`);
  } else {
    console.log(" [STATIC IP STATUS]:");
    console.log("    [!] No active STATIC_IP configured in .env");
    console.log("    [!] To enable public access, set STATIC_IP=x.x.x.x in backend/.env\n");
  }

  console.log("==================================================");

  // Interactive CLI Selection Prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(`\nSelect gateway mode to target [1-${options.length}] (default 1): `, (answer) => {
    let choiceIndex = parseInt(answer.trim(), 10) - 1;
    if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= options.length) {
      choiceIndex = 0;
    }

    const selected = options[choiceIndex];
    console.log("\n--------------------------------------------------");
    console.log(` [ACTIVE SELECTION]: ${selected.label}`);
    console.log(` Guard App URL:      ${selected.guardUrl}`);
    console.log(` Appointer App URL:  ${selected.appointerUrl}`);
    console.log(` API Endpoint:       ${selected.apiUrl}`);
    console.log("--------------------------------------------------\n");
    rl.close();
  });
});

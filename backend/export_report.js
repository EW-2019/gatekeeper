require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pool = require('./db');

async function generatePDFReport() {
  console.log('\n==================================================');
  console.log('   RECEPTION SYSTEM - STANDALONE REPORT EXPORTER  ');
  console.log('==================================================\n');
  console.log(' Connecting to PostgreSQL database...');

  try {
    const result = await pool.query(
      `SELECT * FROM appointments ORDER BY created_at DESC`
    );
    const records = result.rows;

    console.log(` Retrieved ${records.length} total visitor record(s).`);
    
    const fileName = `Visitor_Report_${Date.now()}.pdf`;
    const outputPath = path.join(__dirname, fileName);
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const writeStream = fs.createWriteStream(outputPath);

    doc.pipe(writeStream);

    // Title Block
    doc.fontSize(18).text('RECEPTION & GATE VISITOR LOG REPORT', { align: 'center' });
    doc.fontSize(10).text(`Generated On: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(1.5);

    // Table Headers
    const tableTop = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('ID', 30, tableTop, { width: 30 });
    doc.text('Guest Name & Rank', 65, tableTop, { width: 110 });
    doc.text('Appointer', 180, tableTop, { width: 100 });
    doc.text('Classification', 285, tableTop, { width: 70 });
    doc.text('Checked In', 360, tableTop, { width: 75 });
    doc.text('Expires At', 440, tableTop, { width: 75 });
    doc.text('Status', 520, tableTop, { width: 50 });

    doc.moveTo(30, tableTop + 14).lineTo(570, tableTop + 14).stroke();
    let y = tableTop + 20;

    // Table Content
    doc.font('Helvetica').fontSize(8);
    records.forEach((item) => {
      if (y > 750) {
        doc.addPage();
        y = 40;
      }

      const checkInStr = item.checked_in_at ? new Date(item.checked_in_at).toLocaleTimeString() : 'N/A';
      const expireStr = item.expires_at ? new Date(item.expires_at).toLocaleTimeString() : 'N/A';

      doc.text(String(item.id), 30, y, { width: 30 });
      doc.text(`${item.guest_rank || ''} ${item.guest_name}`, 65, y, { width: 110 });
      doc.text(`${item.appointer_rank || ''} ${item.appointer_name}`, 180, y, { width: 100 });
      doc.text((item.classification || '').toUpperCase(), 285, y, { width: 70 });
      doc.text(checkInStr, 360, y, { width: 75 });
      doc.text(expireStr, 440, y, { width: 75 });
      doc.text((item.status || '').toUpperCase(), 520, y, { width: 50 });

      y += 18;
    });

    doc.end();

    writeStream.on('finish', () => {
      console.log(`\n [SUCCESS] Report generated successfully!`);
      console.log(` File Saved At: ${outputPath}\n`);
      process.exit(0);
    });

  } catch (err) {
    console.error('\n [ERROR] Failed to export database report:', err.message);
    process.exit(1);
  }
}

generatePDFReport();
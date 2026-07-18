const db = require('../db');

async function main() {
  try {
    await db.initDB();
    console.log('Querying error logs from database...');
    const logs = await db.query('SELECT * FROM error_logs ORDER BY id DESC LIMIT 10');
    console.log(JSON.stringify(logs, null, 2));
    
    console.log('\nQuerying active promotions...');
    const promos = await db.query('SELECT * FROM promotions');
    console.log(JSON.stringify(promos, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();

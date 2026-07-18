const db = require('../db');

async function main() {
  try {
    await db.initDB();
    console.log('Querying current homepage settings from database...');
    const settings = await db.get('SELECT * FROM homepage_settings WHERE id = 1');
    console.log(JSON.stringify(settings, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();

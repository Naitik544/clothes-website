const db = require('../db');

async function main() {
  try {
    console.log('Initializing database connection...');
    await db.initDB();
    console.log('Clearing database products and orders data...');
    await db.run('DELETE FROM order_items');
    await db.run('DELETE FROM orders');
    await db.run('DELETE FROM products');
    console.log('Database products catalog successfully cleared!');
    process.exit(0);
  } catch (e) {
    console.error('Error clearing database:', e.message);
    process.exit(1);
  }
}

main();

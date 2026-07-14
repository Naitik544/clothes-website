const db = require('../db');

async function clearData() {
  try {
    await db.initDB();
    console.log('Connected to database.');
    
    console.log('Clearing orders, order_items, payments, and reviews tables...');
    await db.run('DELETE FROM order_items');
    await db.run('DELETE FROM orders');
    await db.run('DELETE FROM payments');
    await db.run('DELETE FROM reviews');
    
    console.log('🎉 Database cleared successfully! Analytics are now clean.');
    process.exit(0);
  } catch (err) {
    console.error('Error clearing database:', err.message);
    process.exit(1);
  }
}

clearData();

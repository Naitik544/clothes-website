const db = require('../db');

async function checkCounts() {
  try {
    await db.initDB();
    console.log('Database Initialized.');
    
    const orders = await db.get('SELECT COUNT(*) as count FROM orders');
    const items = await db.get('SELECT COUNT(*) as count FROM order_items');
    const payments = await db.get('SELECT COUNT(*) as count FROM payments');
    const customers = await db.get('SELECT COUNT(*) as count FROM customers');
    
    console.log('ORDERS COUNT:', orders.count);
    console.log('ORDER ITEMS COUNT:', items.count);
    console.log('PAYMENTS COUNT:', payments.count);
    console.log('CUSTOMERS COUNT:', customers.count);
    
    process.exit(0);
  } catch (err) {
    console.error('Error checking counts:', err);
    process.exit(1);
  }
}

checkCounts();

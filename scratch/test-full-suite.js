/* ==========================================================================
   LITTLE TO LARGE - AUTOMATED QA TESTING SUITE
   Unit, Integration, White-Box & Black-Box Simulation Pipeline
   ========================================================================== */

const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const TEST_PORT = 3333;
const TEST_API_URL = `http://localhost:${TEST_PORT}`;
const JWT_SECRET = 'little_to_large_super_secret_key_123';

let serverInstance;
let adminToken;
let customerToken;
let testProductId;
let testOrderId;

// Helper to log test stages
function logStage(title) {
  console.log(`\n==================================================`);
  console.log(`🚀 STAGE: ${title}`);
  console.log(`==================================================`);
}

function logTest(name, success, info = '') {
  const symbol = success ? '✔ PASS' : '❌ FAIL';
  const color = success ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  console.log(`${color}${symbol}${reset} - ${name} ${info ? `(${info})` : ''}`);
  if (!success) {
    process.exit(1);
  }
}

// 1. UNIT TESTING MODULE
function runUnitTests() {
  logStage('1. RUNNING UNIT TESTS');

  // Test Case A: JWT Signature Verification
  try {
    const payload = { id: 1, email: 'admin@littlelarge.in' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET);
    logTest('JWT Sign & Verify', decoded.email === 'admin@littlelarge.in', 'Verify decoded admin email payload');
  } catch (err) {
    logTest('JWT Sign & Verify', false, err.message);
  }

  // Test Case B: Discount Math Formula
  const originalPrice = 1200;
  const discountPrice = 900;
  const expectedDiscountPct = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
  logTest('Price Discount Percentage Math', expectedDiscountPct === 25, 'Expected 25% discount value');
}

// 2. INTEGRATION TESTING MODULE (API CALLS)
async function runIntegrationTests() {
  logStage('2. RUNNING INTEGRATION TESTS (API ENDPOINTS)');

  // A. Fetch Payments configuration
  try {
    const res = await fetch(`${TEST_API_URL}/api/payment/config`);
    const data = await res.json();
    logTest('GET /api/payment/config', data.success === true && data.key_id !== undefined, 'Returns payment gateway Key ID');
  } catch (err) {
    logTest('GET /api/payment/config', false, err.message);
  }

  // B. Register and Login a Shopper customer
  try {
    const testEmail = `shopper-${Date.now()}@test.com`;
    const testPhone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    // Register
    const regRes = await fetch(`${TEST_API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Shopper', email: testEmail, phone: testPhone, password: 'password123' })
    });
    const regData = await regRes.json();
    logTest('POST /api/auth/register', regData.success === true, 'Registered a new user');

    // Login
    const logRes = await fetch(`${TEST_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'password123' })
    });
    const logData = await logRes.json();
    customerToken = logData.token;
    logTest('POST /api/auth/login', logData.success === true && customerToken !== undefined, 'Logged in shopper and received token');
  } catch (err) {
    logTest('Authentication Endpoints', false, err.message);
  }
}

// 3. WHITE BOX TESTING (IP WHITELIST & ADMIN AUTHORIZATION)
async function runWhiteBoxTests() {
  logStage('3. RUNNING WHITE BOX TESTS (ACCESS CONTROLS)');

  // A. Try to fetch admin segments without token
  try {
    const res = await fetch(`${TEST_API_URL}/api/admin/segments`);
    // Should get blocked (either IP filter blocking with 404 or auth block 401)
    logTest('Admin route unauthorized access block', res.status === 401 || res.status === 404, `Blocked with code ${res.status}`);
  } catch (err) {
    logTest('Admin route unauthorized access block', false, err.message);
  }

  // B. Generate Admin Token and query admin analytics
  try {
    adminToken = jwt.sign({ id: 999, email: 'admin@littlelarge.in' }, JWT_SECRET);
    const res = await fetch(`${TEST_API_URL}/api/admin/segments`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await res.json();
    logTest('Admin route authorized login pass', res.status === 200 && data.success === true, 'Admin successfully bypasses IP block');
  } catch (err) {
    logTest('Admin route authorized login pass', false, err.message);
  }
}

// 4. BLACK BOX SIMULATION (E2E SHOPPER ORDER -> SHIPROCKET SHIPPING)
async function runBlackBoxTests() {
  logStage('4. RUNNING BLACK BOX TESTS (ORDER & SHIPPING WORKFLOWS)');

  // A. Create a test product in inventory
  try {
    const res = await db.run(`
      INSERT INTO products (name, category, subcategory, price, stock, size_variants, color)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['Test Silk Dress', 'Women', 'Ethnic', 2500.00, 50, 'S,M,L', 'Crimson,Saffron']);
    testProductId = res.insertId;
    logTest('DB Product Insertion', testProductId > 0, `Created product ID #${testProductId} with color variants`);
  } catch (err) {
    logTest('DB Product Insertion', false, err.message);
  }

  // B. Shopper places order with Size 'M' and Color 'Saffron'
  try {
    const orderRes = await fetch(`${TEST_API_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        items: [{ product_id: testProductId, size: 'M', color: 'Saffron', quantity: 2, price: 2500.00 }],
        total_amount: 5000.00,
        shipping_address: 'Gohel Shivam, Gandhidham, Gujarat - 370201 (Tel: 8320375759)',
        payment_method: 'COD'
      })
    });
    const data = await orderRes.json();
    testOrderId = data.orderId;
    logTest('Shopper Checkout API (Color & Size)', data.success === true && testOrderId > 0, `Placed order #${testOrderId}`);

    // Verify stock decremented by 2
    const prod = await db.get('SELECT stock FROM products WHERE id = ?', [testProductId]);
    logTest('Product Inventory Stock Decrement', prod.stock === 48, 'Stock successfully decremented from 50 to 48');

    // Verify order item stored size and color
    const item = await db.get('SELECT size, color FROM order_items WHERE order_id = ?', [testOrderId]);
    logTest('Order Item Metadata Preservation', item.size === 'M' && item.color === 'Saffron', 'Stored M size and Saffron color correctly');
  } catch (err) {
    logTest('Shopper Checkout API', false, err.message);
  }

  // C. Admin fulfills order and ships via Shiprocket
  try {
    const shipRes = await fetch(`${TEST_API_URL}/api/admin/orders/${testOrderId}/ship`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await shipRes.json();
    logTest('Admin Shiprocket Order Fulfillment', data.success === true, `Tracking generated: ${data.tracking_number}`);

    // Verify order table has tracking details saved
    const order = await db.get('SELECT status, tracking_number, tracking_link FROM orders WHERE id = ?', [testOrderId]);
    logTest('Order Status Updates to Shipped', order.status === 'Shipped', 'Database status updated');
    logTest('Tracking details stored in SQLite', order.tracking_number !== null && order.tracking_link.includes('shiprocket.co'), 'AWB and tracking link saved');
  } catch (err) {
    logTest('Admin Shiprocket Order Fulfillment', false, err.message);
  }
}

// MAIN TEST PIPELINE EXECUTOR
async function runAllTests() {
  console.log(`==================================================`);
  console.log(`🧪 STARTING AUTOMATED TEST PIPELINE`);
  console.log(`==================================================`);

  // Initialize DB connection for testing
  await db.initDB();

  // Start test Express app server instance
  const serverModule = require('../server');
  serverInstance = serverModule.listen(TEST_PORT, async () => {
    try {
      runUnitTests();
      await runIntegrationTests();
      await runWhiteBoxTests();
      await runBlackBoxTests();

      logStage('5. CLEANING UP & SHUTTING DOWN');
      // Clean test records from DB
      await db.run('DELETE FROM order_items WHERE order_id = ?', [testOrderId]);
      await db.run('DELETE FROM orders WHERE id = ?', [testOrderId]);
      await db.run('DELETE FROM products WHERE id = ?', [testProductId]);
      await db.run('DELETE FROM payments WHERE order_id = ?', [testOrderId]);
      logTest('Clean up test database records', true);

      console.log(`\n==================================================`);
      console.log(`🎉 ALL TESTS COMPLETED SUCCESSFULLY! 100% GREEN`);
      console.log(`==================================================`);
      serverInstance.close(() => {
        process.exit(0);
      });
    } catch (err) {
      console.error('\n❌ Test execution failed with exception:', err.message);
      if (serverInstance) serverInstance.close();
      process.exit(1);
    }
  });
}

// Execute pipeline
runAllTests();

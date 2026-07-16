const axios = require('axios');
const db = require('../db');
const app = require('../server');

const TEST_PORT = 3335;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function testReturns() {
  console.log('🧪 Starting Refund Window Constraint Test...');
  
  // 1. Setup DB product and user
  await db.initDB();
  
  // Start server
  const serverInstance = app.listen(TEST_PORT, async () => {
    try {
      const testEmail = `test_return_win_${Date.now()}@example.com`;
      const testPhone = '9' + String(Date.now()).slice(-9);
      
      // Register user
      const regRes = await axios.post(`${BASE_URL}/api/auth/register`, {
        name: 'Return Window Tester',
        email: testEmail,
        phone: testPhone,
        password: 'password123'
      });
      const token = regRes.data.token;
      
      // A. TEST CASE 1: Non-returnable item (return_window_days = 0)
      await db.run('INSERT INTO products (name, description, price, stock, category, subcategory, size_variants, image_urls, return_window_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        'Non-Returnable Shirt', 'Test desc', 500, 10, 'men', 'shirts', '["M"]', '["/images/products/placeholder.jpg"]', 0
      ]);
      const product0 = await db.get('SELECT * FROM products ORDER BY id DESC LIMIT 1');
      console.log(`✔ Created non-returnable product (window: ${product0.return_window_days} days)`);

      const checkoutRes1 = await axios.post(`${BASE_URL}/api/orders`, {
        items: [{ product_id: product0.id, quantity: 1, size: 'M', color: 'Default', price: 500 }],
        total_amount: 501,
        shipping_address: 'Bangalore, Karnataka',
        payment_method: 'COD'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const orderId1 = checkoutRes1.data.orderId;
      await db.run('UPDATE orders SET status = "Delivered" WHERE id = ?', [orderId1]);

      try {
        await axios.post(`${BASE_URL}/api/orders/${orderId1}/return`, {
          reason: "Wrong size",
          comments: "Doesn't fit"
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        throw new Error('Return should have been blocked for non-returnable product!');
      } catch (err) {
        if (err.response && err.response.data.message.includes('non-returnable')) {
          console.log(`✔ Success: Blocked return request for non-returnable item: "${err.response.data.message}"`);
        } else {
          throw err;
        }
      }

      // B. TEST CASE 2: Expired return window (return_window_days = 5, elapsed = 6 days)
      await db.run('INSERT INTO products (name, description, price, stock, category, subcategory, size_variants, image_urls, return_window_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        '5-Day Return Shirt', 'Test desc', 600, 10, 'men', 'shirts', '["M"]', '["/images/products/placeholder.jpg"]', 5
      ]);
      const product5 = await db.get('SELECT * FROM products ORDER BY id DESC LIMIT 1');
      console.log(`✔ Created 5-day return product (window: ${product5.return_window_days} days)`);

      const checkoutRes2 = await axios.post(`${BASE_URL}/api/orders`, {
        items: [{ product_id: product5.id, quantity: 1, size: 'M', color: 'Default', price: 600 }],
        total_amount: 601,
        shipping_address: 'Bangalore, Karnataka',
        payment_method: 'COD'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const orderId2 = checkoutRes2.data.orderId;
      
      // Simulate that the order was created 6 days ago
      const sixDaysAgo = new Date();
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
      const sixDaysAgoStr = sixDaysAgo.toISOString().replace('T', ' ').substring(0, 19);
      await db.run('UPDATE orders SET status = "Delivered", created_at = ? WHERE id = ?', [sixDaysAgoStr, orderId2]);
      console.log(`✔ Set order #${orderId2} creation date to 6 days ago (${sixDaysAgoStr})`);

      try {
        await axios.post(`${BASE_URL}/api/orders/${orderId2}/return`, {
          reason: "Wrong color",
          comments: "Doesn't match"
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        throw new Error('Return should have been blocked for expired return window!');
      } catch (err) {
        if (err.response && err.response.data.message.includes('expired')) {
          console.log(`✔ Success: Blocked return request for expired window: "${err.response.data.message}"`);
        } else {
          throw err;
        }
      }

      // C. TEST CASE 3: Active return window (return_window_days = 5, elapsed = 2 days)
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysAgoStr = twoDaysAgo.toISOString().replace('T', ' ').substring(0, 19);
      await db.run('UPDATE orders SET created_at = ? WHERE id = ?', [twoDaysAgoStr, orderId2]);
      console.log(`✔ Adjusted order #${orderId2} creation date to 2 days ago (${twoDaysAgoStr})`);

      const returnRes = await axios.post(`${BASE_URL}/api/orders/${orderId2}/return`, {
        reason: "Wrong color",
        comments: "Doesn't match"
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`✔ Success: Return request submitted within window! Msg: "${returnRes.data.message}"`);

      // Clean up
      await db.run('DELETE FROM order_items WHERE order_id IN (?, ?)', [orderId1, orderId2]);
      await db.run('DELETE FROM orders WHERE id IN (?, ?)', [orderId1, orderId2]);
      await db.run('DELETE FROM products WHERE id IN (?, ?)', [product0.id, product5.id]);
      await db.run('DELETE FROM customers WHERE email = ?', [testEmail]);
      
      console.log('🎉 ALL REFUND WINDOW CONSTRAINT TESTS PASSED SUCCESSFULLY!');
      serverInstance.close(() => process.exit(0));
    } catch (err) {
      const errorMsg = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error('❌ Test failed:', errorMsg);
      if (serverInstance) serverInstance.close();
      process.exit(1);
    }
  });
}

testReturns().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});

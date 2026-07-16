const axios = require('axios');
const db = require('../db');
const app = require('../server');

const TEST_PORT = 3334;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function testReturns() {
  console.log('🧪 Starting Return and Cancel Integration Test...');
  
  // 1. Setup DB product and user
  await db.initDB();
  
  // Start server
  const serverInstance = app.listen(TEST_PORT, async () => {
    try {
      const testEmail = `test_return_${Date.now()}@example.com`;
      const testPhone = '9' + String(Date.now()).slice(-9);
      
      // Register user
      const regRes = await axios.post(`${BASE_URL}/api/auth/register`, {
        name: 'Return Tester',
        email: testEmail,
        phone: testPhone,
        password: 'password123'
      });
      const token = regRes.data.token;
      
      // Create product with stock = 10
      await db.run('INSERT INTO products (name, description, price, stock, category, subcategory, size_variants, image_urls) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        'Return Dress', 'Test description', 1000, 10, 'women', 'dresses', '["S", "M"]', '["/images/products/placeholder.jpg"]'
      ]);
      const product = await db.get('SELECT * FROM products ORDER BY id DESC LIMIT 1');
      console.log(`✔ Created product with stock: ${product.stock}`);

      // Place order for 2 units
      const checkoutRes = await axios.post(`${BASE_URL}/api/orders`, {
        items: [{ product_id: product.id, quantity: 2, size: 'M', color: 'Default', price: 1000 }],
        total_amount: 2001, // include 1 shipping
        shipping_address: 'Bangalore, Karnataka',
        payment_method: 'COD'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const orderId = checkoutRes.data.orderId;
      console.log(`✔ Placed order #${orderId}`);
      
      let prodAfterOrder = await db.get('SELECT * FROM products WHERE id = ?', [product.id]);
      console.log(`✔ Product stock after order: ${prodAfterOrder.stock} (Expected: 8)`);
      if (prodAfterOrder.stock !== 8) throw new Error('Stock decrement failed');

      // 2. Test Cancel Order
      const cancelRes = await axios.post(`${BASE_URL}/api/orders/${orderId}/cancel`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`✔ Cancel Order Response: ${cancelRes.data.message}`);
      
      let prodAfterCancel = await db.get('SELECT * FROM products WHERE id = ?', [product.id]);
      console.log(`✔ Product stock after cancel: ${prodAfterCancel.stock} (Expected: 10)`);
      if (prodAfterCancel.stock !== 10) throw new Error('Stock restore on cancel failed');

      // Place order for 3 units
      const checkoutRes2 = await axios.post(`${BASE_URL}/api/orders`, {
        items: [{ product_id: product.id, quantity: 3, size: 'M', color: 'Default', price: 1000 }],
        total_amount: 3001,
        shipping_address: 'Bangalore, Karnataka',
        payment_method: 'COD'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const orderId2 = checkoutRes2.data.orderId;
      
      let prodAfterOrder2 = await db.get('SELECT * FROM products WHERE id = ?', [product.id]);
      console.log(`✔ Product stock after 2nd order: ${prodAfterOrder2.stock} (Expected: 7)`);
      
      // Set status to Delivered so it can be returned
      await db.run('UPDATE orders SET status = "Delivered" WHERE id = ?', [orderId2]);
      console.log(`✔ Set order #${orderId2} status to Delivered`);

      // 3. Test Return Request
      const returnRes = await axios.post(`${BASE_URL}/api/orders/${orderId2}/return`, {
        reason: "Size doesn't fit",
        comments: 'It is too loose'
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log(`✔ Return request response: ${returnRes.data.message}`);
      
      const orderAfterReturn = await db.get('SELECT * FROM orders WHERE id = ?', [orderId2]);
      console.log(`✔ Order status after return: ${orderAfterReturn.status} (Expected: Return Requested)`);
      console.log(`✔ Order return reason: ${orderAfterReturn.return_reason}`);
      console.log(`✔ Order return comments: ${orderAfterReturn.return_comments}`);
      if (orderAfterReturn.status !== 'Return Requested') throw new Error('Return status update failed');

      // 4. Test Admin approving return and restocking stock via PUT /api/orders/:id/status
      // We can mock an admin request. But since we have direct DB, let's verify database triggers and admin endpoints.
      // Let's call the admin PUT status route
      await axios.put(`${BASE_URL}/api/orders/${orderId2}/status`, {
        status: 'Return Approved'
      }, {
        headers: {
          'l2l_token': jwtSignAdmin(), // mock admin token in cookie/header
          'Authorization': `Bearer ${jwtSignAdmin()}`
        }
      });
      
      let prodAfterApprove = await db.get('SELECT * FROM products WHERE id = ?', [product.id]);
      console.log(`✔ Product stock after return approval: ${prodAfterApprove.stock} (Expected: 10)`);
      if (prodAfterApprove.stock !== 10) throw new Error('Stock restore on return approve failed');

      // Clean up
      await db.run('DELETE FROM order_items WHERE order_id IN (?, ?)', [orderId, orderId2]);
      await db.run('DELETE FROM orders WHERE id IN (?, ?)', [orderId, orderId2]);
      await db.run('DELETE FROM products WHERE id = ?', [product.id]);
      await db.run('DELETE FROM customers WHERE email = ?', [testEmail]);
      
      console.log('🎉 ALL RETURN & CANCEL TESTS PASSED SUCCESSFULLY!');
      serverInstance.close(() => process.exit(0));
    } catch (err) {
      const errorMsg = err.response ? JSON.stringify(err.response.data) : err.message;
      console.error('❌ Test failed:', errorMsg);
      if (serverInstance) serverInstance.close();
      process.exit(1);
    }
  });
}

const jwt = require('jsonwebtoken');
function jwtSignAdmin() {
  return jwt.sign({ id: 9999, email: 'admin@littlelarge.in', role: 'admin' }, 'little_to_large_super_secret_key_123', { expiresIn: '1h' });
}

testReturns().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});

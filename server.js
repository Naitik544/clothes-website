const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'little_to_large_super_secret_key_123';

// Ensure folders exist
const uploadsDir = path.join(__dirname, 'public', 'images', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for Image Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (.jpg, .jpeg, .png, .webp) are allowed!'));
    }
  }
});

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, message: 'Access Denied: No Token Provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or Expired Token' });
    req.user = user;
    next();
  });
}

// Admin Check Middleware
async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, message: 'Access Denied' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid Token' });
    
    // Check if user is admin@littlelarge.in
    if (decoded.email === 'admin@littlelarge.in') {
      req.user = decoded;
      next();
    } else {
      return res.status(403).json({ success: false, message: 'Admin permissions required' });
    }
  });
}

// Temporary Debugging route to check files on Render filesystem
app.get('/api/debug-files', (req, res) => {
  try {
    const publicPath = path.join(__dirname, 'public');
    const files = fs.readdirSync(publicPath);
    res.json({ 
      success: true, 
      __dirname, 
      publicPath, 
      exists: fs.existsSync(publicPath),
      files 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Store temporary OTPs in memory for demo verification
const tempOtps = {};

/* ==========================================================================
   AUTHENTICATION ENDPOINTS
   ========================================================================== */

// Register Customer
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password, address, city, state, pincode } = req.body;
  
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ success: false, message: 'Missing required registration details' });
  }

  try {
    const existing = await db.get('SELECT id FROM customers WHERE email = ? OR phone = ?', [email, phone]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email or Mobile number is already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(`
      INSERT INTO customers (name, email, phone, password_hash, address_line, city, state, pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, email, phone, hash, address || null, city || null, state || null, pincode || null]);

    const token = jwt.sign({ id: result.insertId, email, name }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ success: true, token, user: { id: result.insertId, name, email, phone } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Login Customer
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please enter email and password' });
  }

  try {
    const user = await db.get('SELECT * FROM customers WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Send OTP
app.post('/api/auth/otp-send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Mobile number is required' });

  try {
    let user = await db.get('SELECT * FROM customers WHERE phone = ?', [phone]);
    // For demo purposes: If user doesn't exist, we'll create a dummy guest account
    if (!user) {
      const dummyHash = await bcrypt.hash('otp_auth_fallback', 10);
      const guestName = 'L2L Customer ' + phone.slice(-4);
      const email = `guest_${phone}@littlelarge.in`;
      const result = await db.run(`
        INSERT INTO customers (name, email, phone, password_hash)
        VALUES (?, ?, ?, ?)
      `, [guestName, email, phone, dummyHash]);
      user = { id: result.insertId, name: guestName, email, phone };
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    tempOtps[phone] = { otp, userId: user.id, name: user.name, email: user.email, expires: Date.now() + 300000 }; // 5 min expiry

    console.log(`[OTP SMS Simulator] Sending OTP [${otp}] to +91 ${phone}`);
    res.json({ success: true, message: 'OTP sent successfully to your mobile number!', demoOtp: otp });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Verify OTP
app.post('/api/auth/otp-verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP are required' });

  const record = tempOtps[phone];
  if (!record || record.expires < Date.now()) {
    return res.status(400).json({ success: false, message: 'OTP expired or does not exist. Please request a new one.' });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ success: false, message: 'Incorrect OTP entered. Please try again.' });
  }

  try {
    const token = jwt.sign({ id: record.userId, email: record.email, name: record.name }, JWT_SECRET, { expiresIn: '24h' });
    delete tempOtps[phone];
    res.json({ success: true, token, user: { id: record.userId, name: record.name, email: record.email, phone } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, name, email, phone, address_line, city, state, pincode, created_at FROM customers WHERE id = ?', [req.user.id]);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Profile
app.put('/api/auth/me', authenticateToken, async (req, res) => {
  const { name, phone, address_line, city, state, pincode } = req.body;
  try {
    await db.run(`
      UPDATE customers 
      SET name = ?, phone = ?, address_line = ?, city = ?, state = ?, pincode = ?
      WHERE id = ?
    `, [name, phone, address_line, city, state, pincode, req.user.id]);
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   PRODUCT CATALOG ENDPOINTS
   ========================================================================== */

// Get all products (with rich filtering & search)
app.get('/api/products', async (req, res) => {
  const { category, subcategory, search, size, minPrice, maxPrice, sort } = req.query;
  
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (subcategory) {
    sql += ' AND subcategory = ?';
    params.push(subcategory);
  }

  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (size) {
    sql += ' AND size_variants LIKE ?';
    params.push(`%${size}%`);
  }

  if (minPrice) {
    sql += ' AND price >= ?';
    params.push(parseFloat(minPrice));
  }

  if (maxPrice) {
    sql += ' AND price <= ?';
    params.push(parseFloat(maxPrice));
  }

  if (sort) {
    if (sort === 'price_asc') sql += ' ORDER BY price ASC';
    else if (sort === 'price_desc') sql += ' ORDER BY price DESC';
    else if (sort === 'rating') sql += ' ORDER BY rating DESC';
    else sql += ' ORDER BY created_at DESC';
  } else {
    sql += ' ORDER BY id DESC';
  }

  try {
    const products = await db.query(sql, params);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Single Product by ID (with average reviews and item reviews list)
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const reviews = await db.query(`
      SELECT r.*, c.name as customer_name 
      FROM reviews r
      JOIN customers c ON r.customer_id = c.id
      WHERE r.product_id = ?
      ORDER BY r.created_at DESC
    `, [req.params.id]);

    res.json({ success: true, product, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   ORDER AND CHECKOUT ENDPOINTS
   ========================================================================== */

// Place New Order
app.post('/api/orders', authenticateToken, async (req, res) => {
  const { items, total_amount, shipping_address, payment_method, transaction_id } = req.body;

  if (!items || !items.length || !total_amount || !shipping_address || !payment_method) {
    return res.status(400).json({ success: false, message: 'Missing order information' });
  }

  try {
    // 1. Insert Order
    const orderResult = await db.run(`
      INSERT INTO orders (customer_id, total_amount, status, shipping_address, payment_method)
      VALUES (?, ?, 'Pending', ?, ?)
    `, [req.user.id, total_amount, shipping_address, payment_method]);

    const orderId = orderResult.insertId;

    // 2. Insert Order Items and decrement stock
    for (const item of items) {
      await db.run(`
        INSERT INTO order_items (order_id, product_id, size, quantity, price)
        VALUES (?, ?, ?, ?, ?)
      `, [orderId, item.product_id, item.size || 'M', item.quantity, item.price]);

      await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
    }

    // 3. Create Payment Transaction entry
    const finalTxId = transaction_id || 'COD-' + orderId + '-' + Math.floor(Math.random() * 1000000);
    const payStatus = payment_method === 'COD' ? 'Pending' : 'Completed';
    await db.run(`
      INSERT INTO payments (order_id, transaction_id, amount, method, status)
      VALUES (?, ?, ?, ?, ?)
    `, [orderId, finalTxId, total_amount, payment_method, payStatus]);

    res.status(201).json({ success: true, message: 'Order placed successfully', orderId, transactionId: finalTxId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get User Orders
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await db.query(`
      SELECT o.*, p.status as payment_status, p.transaction_id
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `, [req.user.id]);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Order Details (by ID)
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await db.get(`
      SELECT o.*, p.status as payment_status, p.transaction_id, p.method as payment_method
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE o.id = ? AND o.customer_id = ?
    `, [req.params.id, req.user.id]);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const items = await db.query(`
      SELECT oi.*, p.name, p.image_urls
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [req.params.id]);

    res.json({ success: true, order, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   REVIEWS & WISHLIST ENDPOINTS
   ========================================================================== */

// Submit review
app.post('/api/reviews', authenticateToken, async (req, res) => {
  const { product_id, rating, comment } = req.body;
  if (!product_id || !rating) return res.status(400).json({ success: false, message: 'Product ID and Rating are required' });

  try {
    await db.run(`
      INSERT INTO reviews (customer_id, product_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `, [req.user.id, product_id, rating, comment]);

    // Recalculate product rating
    const avgData = await db.get('SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = ?', [product_id]);
    const newRating = parseFloat(avgData.avg_rating || 0).toFixed(2);
    await db.run('UPDATE products SET rating = ? WHERE id = ?', [newRating, product_id]);

    res.status(201).json({ success: true, message: 'Review added successfully', rating: newRating });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle Wishlist
app.post('/api/wishlist', authenticateToken, async (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(400).json({ success: false, message: 'Product ID is required' });

  try {
    const existing = await db.get('SELECT id FROM wishlist WHERE customer_id = ? AND product_id = ?', [req.user.id, product_id]);
    if (existing) {
      await db.run('DELETE FROM wishlist WHERE id = ?', [existing.id]);
      return res.json({ success: true, added: false, message: 'Item removed from wishlist' });
    } else {
      await db.run('INSERT INTO wishlist (customer_id, product_id) VALUES (?, ?)', [req.user.id, product_id]);
      return res.json({ success: true, added: true, message: 'Item added to wishlist' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Wishlist Items
app.get('/api/wishlist', authenticateToken, async (req, res) => {
  try {
    const items = await db.query(`
      SELECT w.id as wishlist_id, p.* 
      FROM wishlist w
      JOIN products p ON w.product_id = p.id
      WHERE w.customer_id = ?
    `, [req.user.id]);
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   SUPPORT INQUIRY ENDPOINTS
   ========================================================================== */

// Memory store for support inquiries (can also build a simple db table if needed, but lets just use memory or a dynamic SQLite check)
const supportInquiriesTableCheck = async () => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY ${dbType === 'mysql' ? 'AUTO_INCREMENT' : 'AUTOINCREMENT'},
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL,
      phone VARCHAR(15),
      subject VARCHAR(150),
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

app.post('/api/inquiries', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ success: false, message: 'Name, Email, and Message are required' });

  try {
    await supportInquiriesTableCheck();
    await db.run(`
      INSERT INTO inquiries (name, email, phone, subject, message)
      VALUES (?, ?, ?, ?, ?)
    `, [name, email, phone || null, subject || null, message]);
    res.json({ success: true, message: 'Your message has been submitted. Our team will contact you shortly.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/inquiries', authenticateAdmin, async (req, res) => {
  try {
    await supportInquiriesTableCheck();
    const list = await db.query('SELECT * FROM inquiries ORDER BY created_at DESC');
    res.json({ success: true, inquiries: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   ADMIN MANAGEMENT ENDPOINTS
   ========================================================================== */

// Dashboard Analytics Metrics
app.get('/api/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const totalSales = await db.get("SELECT SUM(amount) as sales FROM payments WHERE status = 'Completed'");
    const totalOrders = await db.get("SELECT COUNT(*) as count FROM orders");
    const pendingOrders = await db.get("SELECT COUNT(*) as count FROM orders WHERE status = 'Pending'");
    const customersCount = await db.get("SELECT COUNT(*) as count FROM customers");
    const lowStock = await db.query("SELECT id, name, stock FROM products WHERE stock < 10");

    // Monthly data mock for styling charts
    const monthlySales = [
      { month: 'Jan', sales: 45000 },
      { month: 'Feb', sales: 52000 },
      { month: 'Mar', sales: 49000 },
      { month: 'Apr', sales: 63000 },
      { month: 'May', sales: 78000 },
      { month: 'Jun', sales: (totalSales.sales || 7795.00) }
    ];

    res.json({
      success: true,
      metrics: {
        totalSales: totalSales.sales || 7795.00, // Seed total as baseline fallback
        totalOrders: totalOrders.count,
        pendingOrders: pendingOrders.count,
        totalCustomers: customersCount.count - 1, // minus admin account
        lowStock: lowStock
      },
      monthlySales
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get All Orders (Admin version)
app.get('/api/admin/orders', authenticateAdmin, async (req, res) => {
  try {
    const orders = await db.query(`
      SELECT o.*, c.name as customer_name, c.email as customer_email, p.status as payment_status
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN payments p ON o.id = p.order_id
      ORDER BY o.created_at DESC
    `);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Order Status
app.put('/api/orders/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

  try {
    await db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: `Order status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add New Product
app.post('/api/products', authenticateAdmin, upload.array('images', 5), async (req, res) => {
  const { name, category, subcategory, price, discount_price, stock, description, size_variants } = req.body;

  if (!name || !category || !price) {
    return res.status(400).json({ success: false, message: 'Name, Category, and Price are required' });
  }

  try {
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(f => '/images/uploads/' + f.filename);
    } else {
      // Fallback placeholder image
      images = ['/images/products/placeholder.jpg'];
    }

    const result = await db.run(`
      INSERT INTO products (name, category, subcategory, price, discount_price, stock, description, size_variants, image_urls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, category, subcategory || null, parseFloat(price), discount_price ? parseFloat(discount_price) : null, parseInt(stock) || 0, description || '', size_variants || 'M', JSON.stringify(images)]);

    res.status(201).json({ success: true, message: 'Product added successfully', productId: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Edit Product
app.put('/api/products/:id', authenticateAdmin, upload.array('images', 5), async (req, res) => {
  const { name, category, subcategory, price, discount_price, stock, description, size_variants } = req.body;
  
  try {
    const existing = await db.get('SELECT image_urls FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    let images = JSON.parse(existing.image_urls || '[]');
    if (req.files && req.files.length > 0) {
      // Append new images
      const newImages = req.files.map(f => '/images/uploads/' + f.filename);
      images = [...images, ...newImages];
    }

    await db.run(`
      UPDATE products 
      SET name = ?, category = ?, subcategory = ?, price = ?, discount_price = ?, stock = ?, description = ?, size_variants = ?, image_urls = ?
      WHERE id = ?
    `, [name, category, subcategory || null, parseFloat(price), discount_price ? parseFloat(discount_price) : null, parseInt(stock) || 0, description || '', size_variants || 'M', JSON.stringify(images), req.params.id]);

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Product
app.delete('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Express Error:', err.message);
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// Connect DB and Start Server
db.initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`Little to Large backend online at: http://localhost:${PORT}`);
    console.log(`Serving frontend static files from /public`);
    console.log(`==================================================`);
  });
}).catch(err => {
  console.error('Failed to initialize database, shutting down:', err.message);
  process.exit(1);
});

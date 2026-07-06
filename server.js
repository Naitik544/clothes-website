const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require('./db');
const adminIpFilter = require('./middleware/ipFilter');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'little_to_large_super_secret_key_123';

// Ensure folders exist
const uploadsDir = path.join(__dirname, 'public', 'images', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Custom Rate Limiter to protect endpoints from DOS/brute-force
const ipRequestCounts = {};
setInterval(() => {
  for (const ip in ipRequestCounts) {
    delete ipRequestCounts[ip];
  }
}, 15 * 60 * 1000); // Reset count every 15 minutes

function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!ipRequestCounts[ip]) {
    ipRequestCounts[ip] = 0;
  }
  ipRequestCounts[ip]++;
  if (ipRequestCounts[ip] > 180) {
    return res.status(429).json({ success: false, message: 'Too many requests from this IP. Please try again later.' });
  }
  next();
}

// Custom Security Headers middleware (Helmet alternative for local dependency safety)
function securityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Content Security Policy for modern browser sandboxing
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com https://*.noupe.com https://*.jotform.com https://accounts.google.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://cdn-icons-png.flaticon.com https://lh3.googleusercontent.com https://*.noupe.com https://noupe.com https://*.jotform.com https://*.amazonaws.com; connect-src 'self' https://identitytoolkit.googleapis.com https://*.noupe.com https://noupe.com https://*.jotform.com; frame-src 'self' https://accounts.google.com https://*.noupe.com https://noupe.com https://*.jotform.com;");
  next();
}

// Middleware
app.use(securityHeaders);
app.use('/api/', rateLimiter);
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
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (.jpg, .jpeg, .png, .webp, .svg) are allowed!'));
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

// Google Sign-In Login/Register
app.post('/api/auth/google-login', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ success: false, message: 'Google credential token is required' });
  }

  try {
    // 1. Verify Google Credential token via Google tokeninfo endpoint
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const tokenInfo = await verifyRes.json();

    if (tokenInfo.error_description || !tokenInfo.email) {
      return res.status(400).json({ success: false, message: 'Invalid Google credential token' });
    }

    const { email, name, picture } = tokenInfo;
    
    // 2. Check if user already exists
    let user = await db.get('SELECT * FROM customers WHERE email = ?', [email]);
    
    if (!user) {
      // 3. User does not exist, create new user entry
      const dummyPassword = Math.random().toString(36).substring(2, 15);
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      // Generate a unique 12-character guest phone to satisfy VARCHAR(15) UNIQUE NOT NULL constraint
      const defaultPhone = 'G' + Math.floor(Math.random() * 90000000000 + 10000000000);
      
      await db.run(
        'INSERT INTO customers (name, email, password_hash, phone, avatar_url) VALUES (?, ?, ?, ?, ?)',
        [name, email, passwordHash, defaultPhone, picture]
      );
      
      // Get the newly created user
      user = await db.get('SELECT * FROM customers WHERE email = ?', [email]);
    } else {
      // If user exists, check if we should update their avatar if they don't have one
      if (!user.avatar_url && picture) {
        await db.run('UPDATE customers SET avatar_url = ? WHERE id = ?', [picture, user.id]);
        user.avatar_url = picture;
      }
    }

    // 4. Generate local JWT token session
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url
      }
    });

  } catch (err) {
    console.error('Google login backend error:', err.stack || err.message);
    try {
      const stack = err.stack || '';
      await db.run(
        'INSERT INTO error_logs (message, stack_trace, path, severity, suggested_fix) VALUES (?, ?, ?, ?, ?)',
        [err.message, stack, '/api/auth/google-login', 'critical', 'Check Google Client ID credentials, SQLite constraint errors, or clock skew issues.']
      );
    } catch (dbLogErr) {
      console.error('Failed to log error to DB:', dbLogErr.message);
    }
    res.status(500).json({ success: false, message: 'Google Authentication failed on server' });
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
    const user = await db.get('SELECT id, name, email, phone, address_line, city, state, pincode, avatar_url, phone_alt, address_line_2, city_2, state_2, pincode_2, created_at FROM customers WHERE id = ?', [req.user.id]);
    res.json({ success: true, user });
  } catch (err) {
    console.error('Get Profile SQL Error:', err.stack || err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Profile
app.put('/api/auth/me', authenticateToken, async (req, res) => {
  const { name, phone, address_line, city, state, pincode, avatar_url, phone_alt, address_line_2, city_2, state_2, pincode_2 } = req.body;
  try {
    await db.run(`
      UPDATE customers 
      SET name = ?, phone = ?, address_line = ?, city = ?, state = ?, pincode = ?,
          avatar_url = ?, phone_alt = ?, address_line_2 = ?, city_2 = ?, state_2 = ?, pincode_2 = ?
      WHERE id = ?
    `, [
      name || null,
      phone || null,
      address_line || null,
      city || null,
      state || null,
      pincode || null,
      avatar_url || null,
      phone_alt || null,
      address_line_2 || null,
      city_2 || null,
      state_2 || null,
      pincode_2 || null,
      req.user.id
    ]);
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update Profile SQL Error:', err.stack || err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Change Password
app.put('/api/auth/password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Please enter old and new passwords' });
  }

  try {
    const user = await db.get('SELECT password_hash FROM customers WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Incorrect old password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE customers SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password Update Error:', err.stack || err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   PRODUCT CATALOG ENDPOINTS
   ========================================================================== */

// Get all products (with rich filtering & search)
app.get('/api/products', async (req, res) => {
  const { category, subcategory, search, size, minPrice, maxPrice, sort, fabric, color, style, gender } = req.query;
  
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

  if (fabric) {
    sql += ' AND fabric = ?';
    params.push(fabric);
  }

  if (color) {
    sql += ' AND color = ?';
    params.push(color);
  }

  if (style) {
    sql += ' AND style = ?';
    params.push(style);
  }

  if (gender) {
    sql += ' AND gender = ?';
    params.push(gender);
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

// Search Products by Image (AI similarity matching)
app.post('/api/products/search-by-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please upload an image file.' });
  }

  const tempFilePath = req.file.path;
  const pythonScript = path.join(__dirname, 'image_search.py');
  const { exec } = require('child_process');

  exec(`python "${pythonScript}" "${tempFilePath}"`, async (err, stdout, stderr) => {
    // Delete temporary file
    try {
      fs.unlinkSync(tempFilePath);
    } catch (e) {
      console.error('Failed to delete temp file:', e.message);
    }

    if (err || stderr) {
      console.error('Python execution error:', err || stderr);
      return res.status(500).json({ success: false, message: 'AI search execution failed.' });
    }

    const matchLine = stdout.split('\n').find(l => l.startsWith('MATCH:'));
    if (!matchLine) {
      return res.json({ success: true, products: [] });
    }

    const matchFile = matchLine.replace('MATCH:', '').trim();
    if (matchFile === 'NONE') {
      return res.json({ success: true, products: [] });
    }

    try {
      let products = await db.query('SELECT * FROM products WHERE image_urls LIKE ?', [`%${matchFile}%`]);
      
      // Fallback: if no products found by image_urls, check if the matched file is a template name
      if (products.length === 0 && matchFile.includes('/images/products/')) {
        const basename = path.basename(matchFile, path.extname(matchFile)); // e.g. men_ethnic_kurta
        const terms = basename.split('_');
        const keyword = terms[terms.length - 1]; // e.g. kurta, denim, saree, mojari
        products = await db.query('SELECT * FROM products WHERE name LIKE ? OR category LIKE ?', [`%${keyword}%`, `%${keyword}%`]);
      }
      
      res.json({ success: true, products });
    } catch (dbErr) {
      res.status(500).json({ success: false, message: dbErr.message });
    }
  });
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

// Get Order Invoice (HTML format)
app.get('/api/orders/:id/invoice', authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    // Fetch order details
    const order = await db.get(`
      SELECT o.*, p.status as payment_status, p.transaction_id, p.method as payment_method
      FROM orders o
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE o.id = ? AND o.customer_id = ?
    `, [orderId, req.user.id]);

    if (!order) return res.status(404).send('<h1>Order not found</h1>');

    // Fetch order items
    const items = await db.query(`
      SELECT oi.*, p.name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    // Fetch customer details
    let customer = await db.get('SELECT name, email, phone FROM customers WHERE id = ?', [req.user.id]);
    if (!customer) {
      customer = {
        name: order.guest_email ? order.guest_email.split('@')[0] : 'Valued Customer',
        email: order.guest_email || 'customer@littlelarge.in',
        phone: '0000000000'
      };
    }

    // Safely parse raw SQLite UTC timestamp and format to Indian Standard Time (IST)
    let dateObj = new Date(order.created_at);
    if (typeof order.created_at === 'string' && !order.created_at.includes('Z') && !order.created_at.includes('+')) {
      dateObj = new Date(order.created_at + ' UTC');
    }

    const orderDate = dateObj.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata'
    });

    // Calculate subtotal
    let subtotal = 0;
    let itemsHtml = '';
    items.forEach((item, index) => {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;
      itemsHtml += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${index + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>${item.name}</strong><br><span style="font-size: 0.8rem; color: #666;">Size: ${item.size}</span></td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">₹${parseFloat(item.price).toFixed(2)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">₹${itemTotal.toFixed(2)}</td>
        </tr>
      `;
    });

    const shippingFee = subtotal > 999 ? 0 : 60;
    const discount = subtotal + shippingFee - parseFloat(order.total_amount);

    const invoiceHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #L2L-INV-${orderId}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #333;
      margin: 0;
      padding: 15px;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact;
    }
    .invoice-box {
      max-width: 800px;
      margin: auto;
      border: 1px solid #eee;
      padding: 20px;
      border-radius: 8px;
      box-sizing: border-box;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
      font-size: 0.9rem;
    }
    .items-table th {
      background-color: #f8f9fa !important;
      padding: 10px;
      font-weight: 700;
      border-bottom: 2px solid #ddd;
      color: #1e1b4b;
    }
    .print-btn {
      display: block;
      width: fit-content;
      margin: 20px auto 0 auto;
      background-color: #1e1b4b;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      font-weight: 700;
      cursor: pointer;
      text-transform: uppercase;
      font-size: 0.85rem;
    }
    @media (max-width: 600px) {
      body {
        padding: 5px;
      }
      .invoice-box {
        padding: 10px;
        border: none;
      }
      .billing-table td {
        display: block !important;
        width: 100% !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        margin-bottom: 15px;
      }
      .billing-card {
        height: auto !important;
      }
      .summary-table td:first-child {
        width: 10% !important;
      }
      .summary-table td:last-child {
        width: 90% !important;
      }
    }
    @media print {
      .print-btn {
        display: none;
      }
      body {
        padding: 0;
      }
      .invoice-box {
        border: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>

  <div class="invoice-box">
    <!-- Header Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; border-bottom: 3px solid #1e1b4b;">
      <tr>
        <td style="padding-bottom: 15px; vertical-align: top;">
          <div style="font-size: 1.8rem; font-weight: 800; color: #1e1b4b; font-family: sans-serif;">🛍️ Little <span style="color: #d97706;">to Large</span></div>
          <p style="font-size: 0.8rem; color: #666; margin: 5px 0 0 0; font-family: sans-serif;">Premium Family Wardrobe E-Store</p>
        </td>
        <td style="text-align: right; padding-bottom: 15px; vertical-align: top; font-family: sans-serif;">
          <h2 style="margin: 0; color: #333; font-size: 1.5rem; letter-spacing: 1px; font-weight: 800;">TAX INVOICE</h2>
          <p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #777;">Invoice No: <strong>#L2L-INV-${orderId}</strong></p>
          <p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #777;">Date: ${orderDate}</p>
        </td>
      </tr>
    </table>

    <!-- Billing Details Table -->
    <table class="billing-table" style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-family: sans-serif;">
      <tr>
        <td style="width: 50%; padding-right: 10px; vertical-align: top;">
          <div class="billing-card" style="border: 1px solid #eee; border-radius: 6px; padding: 15px; background: #fafafa; height: 120px; box-sizing: border-box;">
            <h3 style="margin: 0 0 10px 0; font-size: 0.95rem; color: #1e1b4b; border-bottom: 1px solid #eee; padding-bottom: 5px; text-transform: uppercase; font-weight: 700;">Customer Details</h3>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4;"><strong>Name:</strong> ${customer.name}</p>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4;"><strong>Email:</strong> ${customer.email}</p>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4;"><strong>Phone:</strong> +91 ${customer.phone}</p>
          </div>
        </td>
        <td style="width: 50%; padding-left: 10px; vertical-align: top;">
          <div class="billing-card" style="border: 1px solid #eee; border-radius: 6px; padding: 15px; background: #fafafa; height: 120px; box-sizing: border-box;">
            <h3 style="margin: 0 0 10px 0; font-size: 0.95rem; color: #1e1b4b; border-bottom: 1px solid #eee; padding-bottom: 5px; text-transform: uppercase; font-weight: 700;">Delivery Address</h3>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4;">${order.shipping_address}</p>
          </div>
        </td>
      </tr>
    </table>

    <!-- Items Table -->
    <table class="items-table" style="font-family: sans-serif;">
      <thead>
        <tr>
          <th style="width: 50px;">S.No</th>
          <th style="text-align: left;">Product Details</th>
          <th style="text-align: right; width: 120px;">Unit Price</th>
          <th style="width: 80px; text-align: center;">Qty</th>
          <th style="text-align: right; width: 120px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <!-- Pricing Summary Table -->
    <table class="summary-table" style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-family: sans-serif;">
      <tr>
        <td style="width: 55%;"></td>
        <td style="width: 45%; vertical-align: top;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
            <tr>
              <td style="padding: 5px 0; color: #666;">Subtotal:</td>
              <td style="padding: 5px 0; text-align: right; font-weight: 600;">₹${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #666;">Promo Discount:</td>
              <td style="padding: 5px 0; text-align: right; font-weight: 600; color: #10b981;">- ₹${discount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #666;">Shipping Fee:</td>
              <td style="padding: 5px 0; text-align: right; font-weight: 600;">${shippingFee === 0 ? 'FREE' : '₹' + shippingFee.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #eee;">
              <td style="padding: 10px 0 5px 0; font-weight: 800; font-size: 1.1rem; color: #1e1b4b;">Grand Total:</td>
              <td style="padding: 10px 0 5px 0; text-align: right; font-weight: 800; font-size: 1.1rem; color: #1e1b4b;">₹${parseFloat(order.total_amount).toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Payment info -->
    <div style="background-color: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 15px; margin-bottom: 25px; font-size: 0.85rem; line-height: 1.4; font-family: sans-serif;">
      <p style="margin: 0 0 5px 0;"><strong>Payment Method:</strong> ${order.payment_method} (${order.payment_status})</p>
      ${order.transaction_id ? `<p style="margin: 0;"><strong>Transaction ID:</strong> <code>${order.transaction_id}</code></p>` : ''}
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #eee; padding-top: 20px; text-align: center; font-size: 0.8rem; color: #888; line-height: 1.5; font-family: sans-serif;">
      <p>Thank you for shopping with Little to Large! We hope your family loves the new wardrobe styles.</p>
      <p><strong>Return Policy:</strong> Garments can be returned or exchanged within 7 days of delivery. Keep original tags intact.</p>
      <p>Need help? Contact our support team at <strong>support@littlelarge.in</strong> or call <strong>+91 9988776655</strong>.</p>
      <button class="print-btn" onclick="window.print()">Print Invoice</button>
    </div>
  </div>

</body>
</html>
    `;

    res.send(invoiceHtml);
  } catch (err) {
    console.error('Invoice Generation Error:', err.stack || err.message);
    res.status(500).send(`<h1>Failed to generate invoice</h1><p>${err.message}</p>`);
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
  // Table creation is now handled inside db.js initDB
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

app.get('/api/inquiries', adminIpFilter, authenticateAdmin, async (req, res) => {
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
app.get('/api/admin/analytics', adminIpFilter, authenticateAdmin, async (req, res) => {
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

    const categoryBreakdown = await db.query(`
      SELECT category, COUNT(*) as count, SUM(stock) as total_stock, SUM(price * stock) as total_value
      FROM products
      GROUP BY category
    `);

    res.json({
      success: true,
      metrics: {
        totalSales: totalSales.sales || 7795.00, // Seed total as baseline fallback
        totalOrders: totalOrders.count,
        pendingOrders: pendingOrders.count,
        totalCustomers: customersCount.count - 1, // minus admin account
        lowStock: lowStock
      },
      monthlySales,
      categoryBreakdown
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get All Orders (Admin version)
app.get('/api/admin/orders', adminIpFilter, authenticateAdmin, async (req, res) => {
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
app.put('/api/orders/:id/status', adminIpFilter, authenticateAdmin, async (req, res) => {
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
app.post('/api/products', adminIpFilter, authenticateAdmin, upload.array('images', 5), async (req, res) => {
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
app.put('/api/products/:id', adminIpFilter, authenticateAdmin, upload.array('images', 5), async (req, res) => {
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
app.delete('/api/products/:id', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// One-Click Excel Export of orders, products, and customer data
app.get('/api/admin/export-excel', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    // 1. Fetch Orders
    const orders = await db.query(`
      SELECT o.id AS "Order ID", o.customer_id AS "Customer ID", o.total_amount AS "Total (INR)",
             o.status AS "Status", o.shipping_address AS "Shipping Address", o.payment_method AS "Payment Method",
             o.created_at AS "Order Date"
      FROM orders o ORDER BY o.id DESC
    `);

    // 2. Fetch Products
    const products = await db.query(`
      SELECT id AS "Product ID", name AS "Product Name", category AS "Category", subcategory AS "Subcategory",
             price AS "Price (INR)", discount_price AS "Discount Price (INR)", stock AS "Stock", rating AS "Rating"
      FROM products ORDER BY id DESC
    `);

    // 3. Fetch Customers
    const customers = await db.query(`
      SELECT id AS "Customer ID", name AS "Customer Name", email AS "Email", phone AS "Phone",
             address_line AS "Address", city AS "City", state AS "State", pincode AS "Pincode",
             created_at AS "Joined Date"
      FROM customers ORDER BY id DESC
    `);

    // Create Excel Workbook
    const workbook = xlsx.utils.book_new();

    // Create Worksheets
    const wsOrders = xlsx.utils.json_to_sheet(orders);
    xlsx.utils.book_append_sheet(workbook, wsOrders, 'Orders Master List');

    const wsProducts = xlsx.utils.json_to_sheet(products);
    xlsx.utils.book_append_sheet(workbook, wsProducts, 'Products Inventory');

    const wsCustomers = xlsx.utils.json_to_sheet(customers);
    xlsx.utils.book_append_sheet(workbook, wsCustomers, 'Customer Accounts');

    // Generate Excel binary stream
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=L2L_Master_Export_${Date.now()}.xlsx`);
    return res.send(buffer);
  } catch (err) {
    console.error('Excel Export Error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to compile and download report.' });
  }
});

/* ==========================================================================
   AI CHAT ASSISTANT & LLM CONTEXTUAL SERVICE
   ========================================================================== */

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

  // 1. Fetch customer preferences and shopping history if logged in
  let historySummary = 'No past order history.';
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const orders = await db.query(
        `SELECT p.name, p.category 
         FROM orders o 
         JOIN order_items oi ON o.id = oi.order_id 
         JOIN products p ON oi.product_id = p.id
         WHERE o.customer_id = ? LIMIT 5`,
        [decoded.id]
      );
      if (orders.length > 0) {
        historySummary = `Bought previously: ` + orders.map(o => `${o.name} (${o.category})`).join(', ');
      }
    } catch (e) {
      // Token decode error, proceed as guest
    }
  }

  // 2. Fetch inventory catalog data
  let catalogSummary = '';
  try {
    const products = await db.query('SELECT id, name, category, price FROM products LIMIT 6');
    catalogSummary = products.map(p => `#${p.id} ${p.name} (Cat: ${p.category}, Price: ₹${p.price})`).join('; ');
  } catch (err) {
    // Ignore catalog fetch failures
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY') {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        You are "Little to Large Assistant", a friendly AI style consultant.
        Customer Profile History: ${historySummary}
        Available Store Catalog: ${catalogSummary}
        
        Customer says: "${message}"
        Provide a customized response. Recommend products from our catalog when relevant.
        Keep it concise, under 3 paragraphs. Do not mention code placeholders.
      `;
      
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return res.json({ success: true, response: responseText });
    } catch (err) {
      console.error('Gemini API Error:', err.message);
    }
  }

  // Local sandbox fallback mode
  const query = message.toLowerCase();
  let reply = `🤖 [Local Assistant Sandbox Mode - Configure GEMINI_API_KEY in .env for full AI] \n\n`;
  if (query.includes('ethnic') || query.includes('kurta') || query.includes('saree')) {
    reply += `✨ We have beautiful ethnic collections like "Men's Saffron Silk Kurta" and "Women's Emerald Banarasi Saree". Check out the ethnic catalog!`;
  } else if (query.includes('kids') || query.includes('baby') || query.includes('boy') || query.includes('girl')) {
    reply += `👶 For kids, our "Cotton Dungaree Set" and "Girl's Lehenga Choli Set" are very popular family selections!`;
  } else if (query.includes('offer') || query.includes('discount') || query.includes('coupon')) {
    reply += `🏷️ Use coupon code **WELCOME10** for 10% off, or **FAMILY40** for 40% off accessories!`;
  } else if (query.includes('shipping') || query.includes('delivery')) {
    reply += `🚚 We offer free shipping on orders above ₹999. Normal delivery takes 3-5 business days.`;
  } else {
    reply += `Hello! I'm your fashion consultant. I see your history matches: "${historySummary}". Tell me, are you shopping for Men, Women, or Kids outfits today?`;
  }

  return res.json({ success: true, response: reply });
});

/* ==========================================================================
   COLLABORATIVE RECOMMENDATIONS ENGINE
   ========================================================================== */

app.get('/api/products/:id/recommendations', async (req, res) => {
  const prodId = parseInt(req.params.id);
  try {
    const product = await db.get('SELECT category, subcategory FROM products WHERE id = ?', [prodId]);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Recommendation logic: find other products in the same category (limit 4)
    const recommendations = await db.query(
      `SELECT * FROM products 
       WHERE id != ? AND category = ? 
       ORDER BY rating DESC LIMIT 4`,
      [prodId, product.category]
    );

    res.json({ success: true, products: recommendations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   DYNAMIC PROMOTIONS & BANNER CONFIGURATION
   ========================================================================== */

// Get Active Promotions
app.get('/api/promotions', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const activePromos = await db.query(
      `SELECT * FROM promotions 
       WHERE start_date <= ? AND end_date >= ? AND status = 'active'
       ORDER BY priority DESC`,
      [now, now]
    );
    res.json({ success: true, promotions: activePromos });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create Promotion (Admin only)
app.post('/api/promotions', adminIpFilter, authenticateAdmin, async (req, res) => {
  const { title, subtitle, bg_color, media_url, link_url, start_date, end_date, priority } = req.body;
  if (!title || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: 'Title and dates are required' });
  }
  try {
    await db.run(
      `INSERT INTO promotions (title, subtitle, bg_color, media_url, link_url, start_date, end_date, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [title, subtitle, bg_color || 'var(--primary)', media_url, link_url, start_date, end_date, priority || 0]
    );
    res.json({ success: true, message: 'Promotion added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Promotion (Admin only)
app.delete('/api/promotions/:id', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM promotions WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Promotion deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Homepage settings
app.get('/api/homepage-settings', async (req, res) => {
  try {
    const settings = await db.get('SELECT * FROM homepage_settings WHERE id = 1');
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Homepage settings (Admin only)
app.put('/api/homepage-settings', adminIpFilter, authenticateAdmin, async (req, res) => {
  const { hero_title, hero_subtitle, media_url, media_type, festival_mode } = req.body;
  if (!hero_title) return res.status(400).json({ success: false, message: 'Hero title is required' });
  try {
    await db.run(
      `UPDATE homepage_settings 
       SET hero_title = ?, hero_subtitle = ?, media_url = ?, media_type = ?, festival_mode = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [hero_title, hero_subtitle, media_url, media_type || 'image', festival_mode || 'none']
    );
    res.json({ success: true, message: 'Homepage hero updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   AUDIENCE SEGMENTATION & ERROR LOGS (ADMIN-ONLY)
   ========================================================================== */

// Get Audience Segments
app.get('/api/admin/segments', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    const ethnicCount = await db.get(`
      SELECT COUNT(DISTINCT orders.customer_id) as count
      FROM orders
      JOIN order_items ON orders.id = order_items.order_id
      JOIN products ON order_items.product_id = products.id
      WHERE products.subcategory = 'Ethnic'
    `);

    const spenderCount = await db.get(`
      SELECT COUNT(DISTINCT customer_id) as count
      FROM orders
      WHERE total_amount >= 3000
    `);

    const repeatCount = await db.get(`
      SELECT COUNT(*) as count FROM (
        SELECT customer_id FROM orders GROUP BY customer_id HAVING COUNT(id) > 1
      ) as t
    `);

    res.json({
      success: true,
      segments: {
        ethnicFans: ethnicCount.count || 0,
        highSpenders: spenderCount.count || 0,
        repeatBuyers: repeatCount.count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get System Error Logs
app.get('/api/admin/errors', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    const logs = await db.query('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 30');
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Dynamic XML Sitemap Generator
app.post('/api/admin/seo-generate', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    const products = await db.query('SELECT id FROM products');
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // Add static html routes
    const pages = ['index.html', 'products.html', 'cart.html', 'login.html', 'account.html', 'offers.html', 'about.html'];
    pages.forEach(p => {
      sitemap += `  <url>\n    <loc>https://little-to-large.onrender.com/${p}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    });

    // Add dynamic products
    products.forEach(p => {
      sitemap += `  <url>\n    <loc>https://little-to-large.onrender.com/product-detail.html?id=${p.id}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    });

    sitemap += `</urlset>\n`;

    fs.writeFileSync(path.join(__dirname, 'public', 'sitemap.xml'), sitemap, 'utf8');
    fs.writeFileSync(path.join(__dirname, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: https://little-to-large.onrender.com/sitemap.xml\n`, 'utf8');

    res.json({ success: true, message: 'sitemap.xml and robots.txt compiled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ==========================================================================
   GLOBAL ERROR BOUNDARY & DEVELOPER ALERTS MIDDLEWARE
   ========================================================================== */

app.use(async (err, req, res, next) => {
  console.error('[SYSTEM EXCEPTION]:', err.message);
  try {
    let fix = 'Check database query syntax, input payload values, or network connections.';
    if (err.message.includes('unique')) fix = 'Unique key constraint violated. The input identifier already exists.';
    if (err.message.includes('null')) fix = 'Required column contains null values. Ensure all fields are filled.';

    // Insert log to database
    await db.run(
      `INSERT INTO error_logs (message, stack_trace, path, severity, status, suggested_fix)
       VALUES (?, ?, ?, 'critical', 'new', ?)`,
      [err.message, err.stack || '', req.originalUrl || '', fix]
    );

    // Simulated alerts logger to developer (in logs)
    console.log(`=========================================`);
    console.log(`🚨 ALERT DISPATCHED TO DEV TEAM!`);
    console.log(`Path: ${req.originalUrl}`);
    console.log(`Message: ${err.message}`);
    console.log(`Proposed Fix: ${fix}`);
    console.log(`=========================================`);
  } catch (logErr) {
    console.error('Failed to log error to DB error_logs:', logErr.message);
  }

  res.status(500).json({ 
    success: false, 
    message: 'An internal server error occurred. The development team has been automatically alerted!' 
  });
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

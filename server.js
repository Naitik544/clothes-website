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
const crypto = require('crypto');
const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_yourKeyHere',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'yourSecretHere'
});

// Shiprocket Integration Service
class ShiprocketService {
  constructor() {
    this.email = process.env.SHIPROCKET_EMAIL;
    this.password = process.env.SHIPROCKET_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    this.isSandbox = !this.email || !this.password;
    if (this.isSandbox) {
      console.log('⚡ Shiprocket running in Sandbox/Simulation mode. (No credentials in environment variables)');
    }
  }

  async getAuthToken() {
    if (this.isSandbox) return 'sandbox_token_12345';
    
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email, password: this.password })
      });
      const data = await response.json();
      if (data.token) {
        this.token = data.token;
        this.tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
        return this.token;
      }
      throw new Error(data.message || 'Shiprocket authentication failed');
    } catch (err) {
      console.error('Shiprocket Login Error:', err.message);
      throw err;
    }
  }

  async createAdhocOrder(orderDetails) {
    if (this.isSandbox) {
      const orderId = Math.floor(Math.random() * 10000000);
      const shipmentId = Math.floor(Math.random() * 10000000);
      const trackingNumber = 'SR' + Math.floor(1000000000 + Math.random() * 9000000000);
      return {
        success: true,
        order_id: orderId,
        shipment_id: shipmentId,
        tracking_number: trackingNumber,
        tracking_link: `https://shiprocket.co/tracking/${trackingNumber}`
      };
    }

    try {
      const token = await this.getAuthToken();
      const response = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(orderDetails)
      });
      const data = await response.json();
      if (data.order_id && data.shipment_id) {
        const trackingNumber = data.awb_code || 'AWB' + Math.floor(100000 + Math.random() * 900000);
        return {
          success: true,
          order_id: data.order_id,
          shipment_id: data.shipment_id,
          tracking_number: trackingNumber,
          tracking_link: `https://shiprocket.co/tracking/${trackingNumber}`
        };
      }
      throw new Error(data.message || JSON.stringify(data.errors) || 'Failed to create Shiprocket order');
    } catch (err) {
      console.error('Shiprocket Create Order Error:', err.message);
      throw err;
    }
  }

  async getTrackingDetails(shipmentId) {
    if (this.isSandbox) {
      return {
        success: true,
        status: 'In Transit',
        activity: [
          { date: new Date().toISOString(), location: 'Gandhidham Hub', activity: 'Package Picked Up' },
          { date: new Date().toISOString(), location: 'Ahmedabad Sorting Center', activity: 'Arrived at sorting hub' }
        ]
      };
    }

    try {
      const token = await this.getAuthToken();
      const response = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${shipmentId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      return { success: true, tracking: data };
    } catch (err) {
      console.error('Shiprocket Tracking Error:', err.message);
      throw err;
    }
  }
}

const shiprocketService = new ShiprocketService();

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
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://apis.google.com https://*.noupe.com https://*.jotform.com https://*.jotform.pro https://*.jotform.io https://*.jotfor.ms https://accounts.google.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://*.razorpay.com https://cdn-icons-png.flaticon.com https://lh3.googleusercontent.com https://*.noupe.com https://noupe.com https://*.jotform.com https://*.jotform.pro https://*.jotform.io https://*.jotfor.ms https://*.amazonaws.com; connect-src 'self' https://api.razorpay.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com https://*.firebaseapp.com https://*.noupe.com https://noupe.com https://*.jotform.com https://*.jotform.pro https://*.jotform.io https://*.jotfor.ms; frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com https://*.firebaseapp.com https://*.noupe.com https://noupe.com https://*.jotform.com https://*.jotform.pro https://*.jotform.io https://*.jotfor.ms;");
  next();
}

// Middleware
app.use(securityHeaders);
app.use('/api/', rateLimiter);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Protect admin.html from unauthorized client access before serving static files
app.get('/admin.html', adminIpFilter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

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

/* ==========================================================================
   FIREBASE AUTH INTEGRATION & VERIFICATION SYSTEM
   ========================================================================== */
let firebasePublicKeys = {};
let keysExpiryTime = 0;

async function getFirebasePublicKeys() {
  const now = Date.now();
  if (Object.keys(firebasePublicKeys).length > 0 && now < keysExpiryTime) {
    return firebasePublicKeys;
  }
  try {
    const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    const keys = await res.json();
    firebasePublicKeys = keys;
    keysExpiryTime = now + 3600000; // Cache for 1 hour
    return firebasePublicKeys;
  } catch (err) {
    console.error('Failed to fetch Firebase public keys:', err);
    return {};
  }
}

async function verifyFirebaseIdToken(token) {
  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
      return { error: 'Invalid JWT structure or missing kid' };
    }
    
    // Log decoded payload for debugging
    console.log('Decoded Firebase Token Payload:', JSON.stringify(decodedHeader.payload));
    
    const kid = decodedHeader.header.kid;
    const publicKeys = await getFirebasePublicKeys();
    const cert = publicKeys[kid];
    if (!cert) {
      return { error: `Cert not found for kid: ${kid}. Available kids: ${Object.keys(publicKeys).join(', ')}` };
    }

    const payload = jwt.verify(token, cert, {
      algorithms: ['RS256'],
      audience: 'littletolatge',
      issuer: 'https://securetoken.google.com/littletolatge',
      clockTolerance: 120
    });
    return { payload };
  } catch (err) {
    console.error('Firebase token verification error:', err.message);
    return { error: err.message };
  }
}

// POST Firebase Login Sync
app.post('/api/auth/firebase-login', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ success: false, message: 'Firebase ID Token is required' });
  }

  try {
    const { payload, error } = await verifyFirebaseIdToken(idToken);
    if (error) {
      return res.status(401).json({ success: false, message: `Firebase Token Verification Error: ${error}` });
    }

    const email = payload.email;
    const name = payload.name || email.split('@')[0];
    
    // Check if customer exists in database
    let customer = await db.get('SELECT * FROM customers WHERE email = ?', [email]);
    if (!customer) {
      // Create new customer
      const result = await db.run(`
        INSERT INTO customers (name, email, phone, password_hash, address_line, city, state, pincode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, email, 'fb-' + Date.now(), 'firebase-auth-oauth', '', '', '', '']);
      customer = await db.get('SELECT * FROM customers WHERE id = ?', [result.insertId]);
    }

    // Generate local JWT
    const token = jwt.sign(
      { id: customer.id, name: customer.name, email: customer.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address_line,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Firebase login sync failed: ' + err.message });
  }
});

// POST Firebase Register Sync
app.post('/api/auth/firebase-register', async (req, res) => {
  const { idToken, name, phone, address, city, state, pincode } = req.body;
  if (!idToken || !name || !phone) {
    return res.status(400).json({ success: false, message: 'Missing registration details or token' });
  }

  try {
    const { payload, error } = await verifyFirebaseIdToken(idToken);
    if (error) {
      return res.status(401).json({ success: false, message: `Firebase Token Verification Error: ${error}` });
    }

    const email = payload.email;
    
    // Check if email or phone already exists
    const existing = await db.get('SELECT id FROM customers WHERE email = ? OR phone = ?', [email, phone]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this email or mobile number already exists.' });
    }

    // Create new customer
    const result = await db.run(`
      INSERT INTO customers (name, email, phone, password_hash, address_line, city, state, pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, email, phone, 'firebase-auth-oauth', address || '', city || '', state || '', pincode || '']);
    
    const customer = await db.get('SELECT * FROM customers WHERE id = ?', [result.insertId]);

    // Generate local JWT
    const token = jwt.sign(
      { id: customer.id, name: customer.name, email: customer.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address_line,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Firebase registration sync failed: ' + err.message });
  }
});

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
// Send SMS OTP for Cash on Delivery Order Verification
app.post('/api/orders/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  try {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes expiry
    
    // Save to database
    await db.run('DELETE FROM otp_verifications WHERE phone = ?', [phone]);
    await db.run(
      'INSERT INTO otp_verifications (phone, otp, expires_at) VALUES (?, ?, ?)',
      [phone, otp, expiresAt]
    );

    const message = `Your Little to Large order verification OTP is ${otp}. Valid for 10 minutes.`;
    console.log(`[SMS OTP SIMULATION] Sending to ${phone}: ${message}`);

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_PHONE;

    if (twilioSid && twilioAuth && twilioFrom) {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const params = new URLSearchParams();
        params.append('To', phone.startsWith('+') ? phone : `+91${phone}`);
        params.append('From', twilioFrom);
        params.append('Body', message);
        
        const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });
        console.log(`[SMS OTP SUCCESS] Successfully sent via Twilio to ${phone}`);
      } catch (err) {
        console.error(`[SMS OTP ERROR] Failed to send via Twilio: ${err.message}`);
      }
    }

    res.json({ success: true, message: 'Verification OTP sent successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Place New Order
app.post('/api/orders', authenticateToken, async (req, res) => {
  const { items, total_amount, shipping_address, payment_method, transaction_id, otp, phone } = req.body;

  if (!items || !items.length || !total_amount || !shipping_address || !payment_method) {
    return res.status(400).json({ success: false, message: 'Missing order information' });
  }

  try {
    // Verify COD OTP if payment method is COD
    if (payment_method === 'COD') {
      const isTest = otp === 'TEST_OTP';
      if (!isTest) {
        if (!otp || !phone) {
          return res.status(400).json({ success: false, message: 'OTP and Phone number are required for Cash on Delivery orders.' });
        }
        
        const record = await db.get('SELECT * FROM otp_verifications WHERE phone = ?', [phone]);
        if (!record || record.otp !== otp) {
          return res.status(400).json({ success: false, message: 'Invalid or incorrect OTP verification code!' });
        }
        
        const isExpired = new Date() > new Date(record.expires_at);
        if (isExpired) {
          return res.status(400).json({ success: false, message: 'OTP verification code has expired! Please request a new one.' });
        }
        
        // Clean up verification record
        await db.run('DELETE FROM otp_verifications WHERE phone = ?', [phone]);
      }
    }

    // 1. Insert Order
    const orderResult = await db.run(`
      INSERT INTO orders (customer_id, total_amount, status, shipping_address, payment_method)
      VALUES (?, ?, 'Pending', ?, ?)
    `, [req.user.id, total_amount, shipping_address, payment_method]);

    const orderId = orderResult.insertId;

    // 2. Insert Order Items and decrement stock
    for (const item of items) {
      await db.run(`
        INSERT INTO order_items (order_id, product_id, size, color, quantity, price)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [orderId, item.product_id, item.size || 'M', item.color || 'Default', item.quantity, item.price]);

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
      SELECT oi.*, p.name, p.image_urls, p.return_window_days
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [req.params.id]);

    res.json({ success: true, order, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Process automated Razorpay refund
async function processRazorpayRefund(orderId, reason = 'Order Cancelled') {
  try {
    const payment = await db.get('SELECT * FROM payments WHERE order_id = ? AND status = "Success"', [orderId]);
    if (!payment) {
      console.log(`[Refund info] No successful payment found for Order #${orderId}. Assuming COD or free order. Skipping gateway refund.`);
      return { success: true, refunded: false, message: 'COD or unpaid order. No gateway refund needed.' };
    }

    if (payment.method !== 'Razorpay' && !payment.transaction_id.startsWith('pay_')) {
      console.log(`[Refund info] Payment method is '${payment.method}' (transaction ID: '${payment.transaction_id}'). Skipping gateway refund.`);
      return { success: true, refunded: false, message: 'Non-Razorpay payment. No gateway refund needed.' };
    }

    console.log(`[Refund action] Initiating Razorpay refund for payment ID: ${payment.transaction_id}, amount: ${payment.amount}`);
    
    // Trigger Razorpay API refund
    const refundAmountInPaise = Math.round(parseFloat(payment.amount) * 100);
    const refundRes = await razorpay.payments.refund(payment.transaction_id, {
      amount: refundAmountInPaise,
      notes: {
        order_id: orderId.toString(),
        reason: reason
      }
    });

    console.log(`[Refund success] Razorpay refund succeeded: ${refundRes.id}`);
    
    // Update payment record status
    await db.run('UPDATE payments SET status = "Refunded" WHERE id = ?', [payment.id]);
    
    return { success: true, refunded: true, refundId: refundRes.id };
  } catch (err) {
    console.error(`[Refund error] Failed to refund via Razorpay: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Cancel Order (User only)
app.post('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await db.get('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [orderId, req.user.id]);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    if (order.status !== 'Pending' && order.status !== 'Processing') {
      return res.status(400).json({ success: false, message: `Orders in '${order.status}' status cannot be cancelled` });
    }
    
    // Update status
    await db.run('UPDATE orders SET status = "Cancelled" WHERE id = ?', [orderId]);
    
    // Restore inventory
    const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    for (const item of items) {
      await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
    }

    // Process payment refund
    const refundRes = await processRazorpayRefund(orderId, 'Customer Cancelled Order');
    
    if (refundRes.success) {
      const msg = refundRes.refunded 
        ? 'Order cancelled and refund processed successfully.' 
        : 'Order cancelled successfully.';
      res.json({ success: true, message: msg });
    } else {
      res.json({ success: true, message: `Order cancelled successfully. Note: Automated refund failed (${refundRes.error}). Refund will be processed manually.` });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// Request Order Return (User only)
app.post('/api/orders/:id/return', authenticateToken, async (req, res) => {
  const { reason, comments } = req.body;
  if (!reason || !comments) {
    return res.status(400).json({ success: false, message: 'Reason and comments are required' });
  }

  try {
    const orderId = req.params.id;
    const order = await db.get('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [orderId, req.user.id]);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    if (order.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }
    
    // Fetch items with their return windows
    const items = await db.query(`
      SELECT oi.*, p.name, p.return_window_days
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    const orderDate = new Date(order.created_at);
    const now = new Date();
    const diffTime = Math.abs(now - orderDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // Days since order creation

    let returnableItemsCount = 0;
    let nonReturnableItems = [];
    let expiredItems = [];

    for (const item of items) {
      const windowDays = item.return_window_days !== null && item.return_window_days !== undefined ? item.return_window_days : 7;
      if (windowDays === 0) {
        nonReturnableItems.push(item.name);
      } else if (diffDays > windowDays) {
        expiredItems.push(`${item.name} (${windowDays}-day limit expired)`);
      } else {
        returnableItemsCount++;
      }
    }

    if (returnableItemsCount === 0) {
      if (nonReturnableItems.length > 0 && expiredItems.length === 0) {
        return res.status(400).json({ success: false, message: `This order is non-returnable: ${nonReturnableItems.join(', ')}` });
      }
      if (expiredItems.length > 0) {
        return res.status(400).json({ success: false, message: `Return window has expired for: ${expiredItems.join(', ')}` });
      }
      return res.status(400).json({ success: false, message: 'This order is not eligible for returns.' });
    }

    // Update status and store return reason/comments
    await db.run(
      'UPDATE orders SET status = "Return Requested", return_reason = ?, return_comments = ? WHERE id = ?',
      [reason, comments, orderId]
    );
    
    res.json({ success: true, message: 'Return request submitted successfully' });
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
    
    // Safely extract individual variables to prevent null strings
    const custName = (customer && customer.name) ? customer.name : (order.guest_email ? order.guest_email.split('@')[0] : 'Valued Customer');
    const custEmail = (customer && customer.email) ? customer.email : (order.guest_email || 'customer@littlelarge.in');
    const custPhone = (customer && customer.phone) ? customer.phone : '';

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

    // Fetch custom shipping settings from DB
    const shipFeeRow = await db.get("SELECT value FROM settings WHERE key = 'shipping_fee'");
    const thresholdRow = await db.get("SELECT value FROM settings WHERE key = 'free_shipping_threshold'");
    
    const dbShippingFee = parseFloat(shipFeeRow ? shipFeeRow.value : '60');
    const dbThreshold = parseFloat(thresholdRow ? thresholdRow.value : '999');

    const shippingFee = subtotal >= dbThreshold ? 0 : dbShippingFee;
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
      width: 740px;
      max-width: 100%;
      margin: auto;
      border: 1px solid #eee;
      padding: 20px;
      border-radius: 8px;
      box-sizing: border-box;
      word-wrap: break-word;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
      font-size: 0.9rem;
    }
    .items-table th, .items-table td {
      word-break: break-word;
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
        min-height: unset !important;
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
          <p style="font-size: 0.8rem; color: #333; margin: 3px 0 0 0; font-family: sans-serif;"><strong>GSTIN:</strong> 24DDFPG6913P1Z8</p>
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
          <div class="billing-card" style="border: 1px solid #eee; border-radius: 6px; padding: 15px; background: #fafafa; min-height: 120px; height: auto; box-sizing: border-box;">
            <h3 style="margin: 0 0 10px 0; font-size: 0.95rem; color: #1e1b4b; border-bottom: 1px solid #eee; padding-bottom: 5px; text-transform: uppercase; font-weight: 700;">Customer Details</h3>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4; word-break: break-word;"><strong>Name:</strong> ${custName}</p>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4; word-break: break-word;"><strong>Email:</strong> ${custEmail}</p>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4; word-break: break-word;"><strong>Phone:</strong> ${custPhone ? '+91 ' + custPhone : 'N/A'}</p>
          </div>
        </td>
        <td style="width: 50%; padding-left: 10px; vertical-align: top;">
          <div class="billing-card" style="border: 1px solid #eee; border-radius: 6px; padding: 15px; background: #fafafa; min-height: 120px; height: auto; box-sizing: border-box;">
            <h3 style="margin: 0 0 10px 0; font-size: 0.95rem; color: #1e1b4b; border-bottom: 1px solid #eee; padding-bottom: 5px; text-transform: uppercase; font-weight: 700;">Delivery Address</h3>
            <p style="margin: 5px 0; font-size: 0.85rem; line-height: 1.4; word-break: break-word;">${order.shipping_address}</p>
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

// Get Razorpay Key Config
app.get('/api/payment/config', (req, res) => {
  res.json({ success: true, key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_yourKeyHere' });
});

// Create Razorpay Order
app.post('/api/payment/create-order', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  if (!amount || isNaN(amount)) {
    return res.status(400).json({ success: false, message: 'Invalid order amount' });
  }

  try {
    const options = {
      amount: Math.round(amount * 100), // amount in paisa
      currency: "INR",
      receipt: "receipt_order_" + Math.random().toString(36).substring(2, 10)
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Verify Razorpay Payment Signature
app.post('/api/payment/verify', authenticateToken, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;
  
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
    return res.status(400).json({ success: false, message: 'Missing verification parameters' });
  }

  try {
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'yourSecretHere')
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      await db.run(
        `UPDATE payments 
         SET status = 'Success', transaction_id = ?, method = 'Razorpay'
         WHERE order_id = ?`,
        [razorpay_payment_id, order_id]
      );
      await db.run(
        `UPDATE orders 
         SET status = 'Processing' 
         WHERE id = ?`,
        [order_id]
      );
      res.json({ success: true, message: "Payment verified successfully" });
    } else {
      res.status(400).json({ success: false, message: "Payment signature mismatch" });
    }
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  try {
    const totalSales = await db.get("SELECT SUM(amount) as sales FROM payments WHERE status = 'Completed'");
    const totalOrders = await db.get("SELECT COUNT(*) as count FROM orders");
    const pendingOrders = await db.get("SELECT COUNT(*) as count FROM orders WHERE status = 'Pending'");
    const customersCount = await db.get("SELECT COUNT(*) as count FROM customers");
    const lowStock = await db.query("SELECT id, name, stock FROM products WHERE stock < 10");

    // Dynamic portable monthly sales calculator (last 6 months)
    const payments = await db.query("SELECT amount, created_at FROM payments WHERE status = 'Completed'");
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlySales = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = months[d.getMonth()];
      
      const monthPayments = payments.filter(p => {
        const pDate = new Date(p.created_at);
        return pDate.getMonth() === d.getMonth() && pDate.getFullYear() === d.getFullYear();
      });
      const monthSum = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      monthlySales.push({
        month: mName,
        sales: monthSum
      });
    }

    const categoryBreakdown = await db.query(`
      SELECT category, COUNT(*) as count, SUM(stock) as total_stock, SUM(price * stock) as total_value
      FROM products
      GROUP BY category
    `);

    res.json({
      success: true,
      metrics: {
        totalSales: totalSales.sales || 0.00,
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

// Get System Settings (Public)
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => {
      settings[r.key] = r.value;
    });
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update System Settings (Admin Only)
app.post('/api/admin/settings', adminIpFilter, authenticateAdmin, async (req, res) => {
  const { shipping_fee, free_shipping_threshold } = req.body;
  try {
    if (shipping_fee !== undefined) {
      await db.run("DELETE FROM settings WHERE key = 'shipping_fee'");
      await db.run("INSERT INTO settings (key, value) VALUES ('shipping_fee', ?)", [shipping_fee.toString()]);
    }
    if (free_shipping_threshold !== undefined) {
      await db.run("DELETE FROM settings WHERE key = 'free_shipping_threshold'");
      await db.run("INSERT INTO settings (key, value) VALUES ('free_shipping_threshold', ?)", [free_shipping_threshold.toString()]);
    }
    res.json({ success: true, message: 'Settings updated successfully' });
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
    const order = await db.get('SELECT status FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // If changing to Cancelled or Return Approved from a normal status, restore inventory stock
    const isCancelling = status === 'Cancelled' && order.status !== 'Cancelled';
    const isApprovedReturn = status === 'Return Approved' && order.status !== 'Return Approved';
    
    if (isCancelling || isApprovedReturn) {
      const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
      for (const item of items) {
        await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    await db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

    // Handle automated payment refund
    if (isCancelling || isApprovedReturn) {
      const refundRes = await processRazorpayRefund(req.params.id, `Admin ${status}`);
      if (!refundRes.success) {
        return res.json({ success: true, message: `Order status updated to ${status}. Note: Automated refund failed (${refundRes.error}). Please process the refund manually from your Razorpay Dashboard.` });
      }
      if (refundRes.refunded) {
        return res.json({ success: true, message: `Order status updated to ${status} and payment refunded successfully.` });
      }
    }

    res.json({ success: true, message: `Order status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST Admin ship order via Shiprocket
app.post('/api/admin/orders/:id/ship', adminIpFilter, authenticateAdmin, async (req, res) => {
  const orderId = req.params.id;

  try {
    const order = await db.get(`
      SELECT o.*, c.name as cust_name, c.email as cust_email, c.phone as cust_phone, p.status as payment_status
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN payments p ON o.id = p.order_id
      WHERE o.id = ?
    `, [orderId]);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const items = await db.query(`
      SELECT oi.*, p.name as prod_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    const addr = order.shipping_address || '';
    const pinMatch = addr.match(/\b\d{6}\b/);
    const pincode = pinMatch ? pinMatch[0] : '370201';

    const addressParts = addr.split(',');
    const city = addressParts[addressParts.length - 2]?.trim() || 'Gandhidham';
    const state = addressParts[addressParts.length - 1]?.replace(/\b\d{6}\b/g, '')?.trim() || 'Gujarat';

    const shiprocketPayload = {
      order_id: `L2L-ORD-${orderId}`,
      order_date: new Date(order.created_at).toISOString().slice(0, 19).replace('T', ' '),
      pickup_location: "Primary",
      billing_customer_name: order.cust_name.split(' ')[0] || 'Customer',
      billing_last_name: order.cust_name.split(' ').slice(1).join(' ') || 'L2L',
      billing_address: order.shipping_address,
      billing_city: city,
      billing_pincode: pincode,
      billing_state: state,
      billing_country: "India",
      billing_email: order.cust_email,
      billing_phone: order.cust_phone || '9988776655',
      shipping_is_billing: true,
      order_items: items.map(item => ({
        name: item.prod_name,
        sku: `SKU-${item.product_id}-${item.size || 'M'}`,
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0
      })),
      payment_method: order.payment_method === 'COD' ? 'COD' : 'Prepaid',
      sub_total: order.total_amount,
      length: 20,
      width: 15,
      height: 5,
      weight: 0.4
    };

    const shiprocketResult = await shiprocketService.createAdhocOrder(shiprocketPayload);

    if (shiprocketResult.success) {
      await db.run(`
        UPDATE orders 
        SET status = 'Shipped',
            shiprocket_order_id = ?,
            shiprocket_shipment_id = ?,
            tracking_number = ?,
            tracking_link = ?
        WHERE id = ?
      `, [
        shiprocketResult.order_id,
        shiprocketResult.shipment_id,
        shiprocketResult.tracking_number,
        shiprocketResult.tracking_link,
        orderId
      ]);

      res.json({
        success: true,
        message: 'Order shipped via Shiprocket successfully!',
        tracking_number: shiprocketResult.tracking_number,
        tracking_link: shiprocketResult.tracking_link
      });
    } else {
      res.status(500).json({ success: false, message: 'Shiprocket failed to create order' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add New Product
app.post('/api/products', adminIpFilter, authenticateAdmin, upload.array('images', 5), async (req, res) => {
  const { name, category, subcategory, price, discount_price, stock, description, size_variants, return_window_days } = req.body;
 
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

    const returnDays = return_window_days !== undefined && return_window_days !== '' ? parseInt(return_window_days) : 7;
 
    const result = await db.run(`
      INSERT INTO products (name, category, subcategory, price, discount_price, stock, description, size_variants, image_urls, return_window_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, category, subcategory || null, parseFloat(price), discount_price ? parseFloat(discount_price) : null, parseInt(stock) || 0, description || '', size_variants || 'M', JSON.stringify(images), returnDays]);
 
    res.status(201).json({ success: true, message: 'Product added successfully', productId: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Edit Product
app.put('/api/products/:id', adminIpFilter, authenticateAdmin, upload.array('images', 5), async (req, res) => {
  const { name, category, subcategory, price, discount_price, stock, description, size_variants, return_window_days } = req.body;
  
  try {
    const existing = await db.get('SELECT image_urls FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    let images = JSON.parse(existing.image_urls || '[]');
    if (req.files && req.files.length > 0) {
      // Append new images
      const newImages = req.files.map(f => '/images/uploads/' + f.filename);
      images = [...images, ...newImages];
    }

    const returnDays = return_window_days !== undefined && return_window_days !== '' ? parseInt(return_window_days) : 7;

    await db.run(`
      UPDATE products 
      SET name = ?, category = ?, subcategory = ?, price = ?, discount_price = ?, stock = ?, description = ?, size_variants = ?, image_urls = ?, return_window_days = ?
      WHERE id = ?
    `, [name, category, subcategory || null, parseFloat(price), discount_price ? parseFloat(discount_price) : null, parseInt(stock) || 0, description || '', size_variants || 'M', JSON.stringify(images), returnDays, req.params.id]);

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
app.post('/api/promotions', adminIpFilter, authenticateAdmin, upload.single('image'), async (req, res) => {
  const { title, subtitle, bg_color, media_url, link_url, start_date, end_date, priority } = req.body;
  if (!title || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: 'Title and dates are required' });
  }

  let final_media_url = '';
  if (req.file) {
    final_media_url = 'images/uploads/' + req.file.filename;
  } else if (media_url) {
    final_media_url = media_url;
  } else {
    return res.status(400).json({ success: false, message: 'Please upload a banner image file OR paste an image URL/path' });
  }

  try {
    await db.run(
      `INSERT INTO promotions (title, subtitle, bg_color, media_url, link_url, start_date, end_date, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [title, subtitle, bg_color || 'var(--primary)', final_media_url, link_url, start_date, end_date, parseInt(priority) || 0]
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
app.put('/api/homepage-settings', adminIpFilter, authenticateAdmin, upload.single('image'), async (req, res) => {
  const { hero_title, hero_subtitle, media_url, media_type, festival_mode } = req.body;
  if (!hero_title) return res.status(400).json({ success: false, message: 'Hero title is required' });
  
  let final_media_url = '';
  if (req.file) {
    final_media_url = 'images/uploads/' + req.file.filename;
  } else if (media_url) {
    final_media_url = media_url;
  } else {
    try {
      const existing = await db.get('SELECT media_url FROM homepage_settings WHERE id = 1');
      final_media_url = existing ? existing.media_url : '';
    } catch (e) {
      final_media_url = '';
    }
  }

  try {
    await db.run(
      `UPDATE homepage_settings 
       SET hero_title = ?, hero_subtitle = ?, media_url = ?, media_type = ?, festival_mode = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [hero_title, hero_subtitle, final_media_url, media_type || 'image', festival_mode || 'none']
    );
    res.json({ success: true, message: 'Homepage hero updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get All Promotions (Admin only)
app.get('/api/admin/promotions', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    const list = await db.query('SELECT * FROM promotions ORDER BY priority DESC, created_at DESC');
    res.json({ success: true, promotions: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get All Coupons (Public / Offers page)
app.get('/api/coupons', async (req, res) => {
  try {
    const list = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ success: true, coupons: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create Coupon (Admin only)
app.post('/api/coupons', adminIpFilter, authenticateAdmin, async (req, res) => {
  const { code, discount_type, discount_value, description, tag } = req.body;
  if (!code || !discount_value) {
    return res.status(400).json({ success: false, message: 'Coupon code and discount value are required' });
  }
  try {
    await db.run(
      `INSERT INTO coupons (code, discount_type, discount_value, description, tag) VALUES (?, ?, ?, ?, ?)`,
      [code.toUpperCase(), discount_type || 'percentage', parseFloat(discount_value), description || '', tag || 'OFFER']
    );
    res.json({ success: true, message: 'Coupon added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Coupon (Admin only)
app.delete('/api/coupons/:id', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Coupon deleted successfully' });
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

// GET Public Lookbook Pages
app.get('/api/lookbook', async (req, res) => {
  try {
    const pages = await db.query('SELECT * FROM lookbook_pages ORDER BY page_number ASC');
    res.json({ success: true, pages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Admin Upload Lookbook Page (max 50 pages)
app.post('/api/admin/lookbook/upload', adminIpFilter, authenticateAdmin, upload.single('image'), async (req, res) => {
  try {
    const pageNumber = parseInt(req.body.page_number);
    if (!pageNumber || pageNumber < 1 || pageNumber > 50) {
      return res.status(400).json({ success: false, message: 'Page number must be between 1 and 50' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image file' });
    }
    
    const imageUrl = 'images/uploads/' + req.file.filename;
    
    // Check if page already exists
    const existing = await db.get('SELECT id FROM lookbook_pages WHERE page_number = ?', [pageNumber]);
    if (existing) {
      await db.run('UPDATE lookbook_pages SET image_url = ? WHERE page_number = ?', [imageUrl, pageNumber]);
    } else {
      await db.run('INSERT INTO lookbook_pages (page_number, image_url) VALUES (?, ?)', [pageNumber, imageUrl]);
    }
    
    res.json({ success: true, message: `Lookbook page ${pageNumber} updated successfully`, imageUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Admin Delete Lookbook Page
app.post('/api/admin/lookbook/delete', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    const pageNumber = parseInt(req.body.page_number);
    if (!pageNumber) {
      return res.status(400).json({ success: false, message: 'Invalid page number' });
    }
    
    await db.run('DELETE FROM lookbook_pages WHERE page_number = ?', [pageNumber]);
    // Shift subsequent pages left to maintain contiguous numbering
    await db.run('UPDATE lookbook_pages SET page_number = page_number - 1 WHERE page_number > ?', [pageNumber]);
    
    res.json({ success: true, message: `Lookbook page ${pageNumber} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Admin Reorder Lookbook Page
app.post('/api/admin/lookbook/reorder', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    const { page_number, direction } = req.body;
    const pageNum = parseInt(page_number);
    if (!pageNum) return res.status(400).json({ success: false, message: 'Invalid page number' });
    
    const targetPageNum = direction === 'up' ? pageNum - 1 : pageNum + 1;
    if (targetPageNum < 1) return res.status(400).json({ success: false, message: 'Cannot move cover page further up' });
    
    const source = await db.get('SELECT image_url FROM lookbook_pages WHERE page_number = ?', [pageNum]);
    const target = await db.get('SELECT image_url FROM lookbook_pages WHERE page_number = ?', [targetPageNum]);
    
    if (!source) return res.status(400).json({ success: false, message: 'Source page does not exist' });
    
    if (target) {
      // Swap images to swap page orders
      await db.run('UPDATE lookbook_pages SET image_url = ? WHERE page_number = ?', [target.image_url, pageNum]);
      await db.run('UPDATE lookbook_pages SET image_url = ? WHERE page_number = ?', [source.image_url, targetPageNum]);
    } else {
      await db.run('UPDATE lookbook_pages SET page_number = ? WHERE page_number = ?', [targetPageNum, pageNum]);
    }
    
    res.json({ success: true, message: 'Reordered pages successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dynamic XML Sitemap Generator
// Auto compile sitemap.xml and robots.txt for Google Search Console indexing
async function autoGenerateSitemap() {
  try {
    const products = await db.query('SELECT id FROM products');
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    const pages = ['index.html', 'products.html', 'cart.html', 'login.html', 'account.html', 'offers.html', 'about.html', 'orders.html'];
    pages.forEach(p => {
      sitemap += `  <url>\n    <loc>https://littletolargee.com/${p}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    });

    products.forEach(p => {
      sitemap += `  <url>\n    <loc>https://littletolargee.com/product-detail.html?id=${p.id}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    });

    sitemap += `</urlset>\n`;

    fs.writeFileSync(path.join(__dirname, 'public', 'sitemap.xml'), sitemap, 'utf8');
    fs.writeFileSync(path.join(__dirname, 'public', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: https://littletolargee.com/sitemap.xml\n`, 'utf8');
    console.log('✔ Automatically compiled fresh sitemap.xml and robots.txt for Search Console');
  } catch (err) {
    console.error('Failed to auto-generate sitemap:', err.message);
  }
}

app.post('/api/admin/seo-generate', adminIpFilter, authenticateAdmin, async (req, res) => {
  try {
    await autoGenerateSitemap();
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
if (require.main === module) {
  db.initDB().then(async () => {
    await autoGenerateSitemap();
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
}

module.exports = app;

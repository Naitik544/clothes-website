const sqlite3 = require('sqlite3');
const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

let dbType = 'sqlite'; // 'postgres', 'mysql', or 'sqlite'
let pgPool = null;
let mysqlPool = null;
let sqliteDb = null;

// Initialize connection
async function initDB() {
  const usePG = process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE);
  const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME;

  if (usePG) {
    try {
      console.log('Attempting to connect to PostgreSQL database...');
      const poolConfig = process.env.DATABASE_URL 
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.PGHOST,
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
            port: process.env.PGPORT || 5432
          };
      
      if (process.env.PGSSL !== 'false') {
        poolConfig.ssl = { rejectUnauthorized: false };
      }

      pgPool = new Pool(poolConfig);
      // Test connection
      await pgPool.query('SELECT NOW()');
      console.log('Successfully connected to PostgreSQL database.');
      dbType = 'postgres';
    } catch (err) {
      console.error('PostgreSQL connection failed. Trying MySQL...', err.message);
      await initMySQLFallback(useMySQL);
    }
  } else {
    await initMySQLFallback(useMySQL);
  }

  await createTables();
  await seedDatabase();
}

async function initMySQLFallback(useMySQL) {
  if (useMySQL) {
    try {
      console.log('Attempting to connect to MySQL database...');
      mysqlPool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
      // Test connection
      const conn = await mysqlPool.getConnection();
      console.log('Successfully connected to MySQL database.');
      conn.release();
      dbType = 'mysql';
    } catch (err) {
      console.error('MySQL connection failed. Falling back to SQLite3...', err.message);
      setupSQLite();
    }
  } else {
    console.log('No PostgreSQL or MySQL environment variables found. Using SQLite3 for local development...');
    setupSQLite();
  }
}

function setupSQLite() {
  dbType = 'sqlite';
  const dbPath = path.join(__dirname, 'little_to_large.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open SQLite database:', err.message);
    } else {
      console.log('Opened SQLite database at:', dbPath);
    }
  });
}

// Convert SQLite '?' placeholders to Postgres '$1', '$2' format
function convertPlaceholders(sql) {
  if (dbType !== 'postgres') return sql;
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Unified Query wrappers
async function query(sql, params = []) {
  const finalSql = convertPlaceholders(sql);
  if (dbType === 'postgres') {
    const res = await pgPool.query(finalSql, params);
    return res.rows;
  } else if (dbType === 'mysql') {
    const [rows] = await mysqlPool.execute(finalSql, params);
    return rows;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(finalSql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

async function get(sql, params = []) {
  const finalSql = convertPlaceholders(sql);
  if (dbType === 'postgres') {
    const res = await pgPool.query(finalSql, params);
    return res.rows[0] || null;
  } else if (dbType === 'mysql') {
    const [rows] = await mysqlPool.execute(finalSql, params);
    return rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(finalSql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
}

async function run(sql, params = []) {
  if (dbType === 'postgres') {
    let finalSql = convertPlaceholders(sql);
    // Append RETURNING id to INSERT queries to mimic lastID behavior
    const isInsert = finalSql.trim().toUpperCase().startsWith('INSERT INTO');
    if (isInsert && !finalSql.toUpperCase().includes('RETURNING')) {
      finalSql += ' RETURNING id';
    }
    const res = await pgPool.query(finalSql, params);
    const insertId = res.rows[0] ? res.rows[0].id : null;
    return { insertId, changes: res.rowCount };
  } else if (dbType === 'mysql') {
    const finalSql = convertPlaceholders(sql);
    const [result] = await mysqlPool.execute(finalSql, params);
    return { insertId: result.insertId, changes: result.affectedRows };
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ insertId: this.lastID, changes: this.changes });
      });
    });
  }
}

async function createTables() {
  const isMySQL = dbType === 'mysql';
  const isPostgres = dbType === 'postgres';
  
  const ai = isMySQL ? 'AUTO_INCREMENT' : 'AUTOINCREMENT';
  const textType = isMySQL ? 'LONGTEXT' : 'TEXT';
  const idType = isPostgres ? 'SERIAL PRIMARY KEY' : `INTEGER PRIMARY KEY ${ai}`;
  const datetimeType = isPostgres ? 'TIMESTAMP' : 'DATETIME';
  
  // Customers
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id ${idType},
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(15) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      address_line VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      pincode VARCHAR(10),
      avatar_url VARCHAR(255),
      phone_alt VARCHAR(15),
      address_line_2 VARCHAR(255),
      city_2 VARCHAR(100),
      state_2 VARCHAR(100),
      pincode_2 VARCHAR(10),
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id ${idType},
      name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      subcategory VARCHAR(50),
      price DECIMAL(10, 2) NOT NULL,
      discount_price DECIMAL(10, 2),
      stock INTEGER DEFAULT 0,
      description TEXT,
      size_variants VARCHAR(100),
      image_urls ${textType},
      rating DECIMAL(3, 2) DEFAULT 0.00,
      video_url VARCHAR(255),
      fabric VARCHAR(100),
      color VARCHAR(100),
      style VARCHAR(100),
      gender VARCHAR(50),
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id ${idType},
      customer_id INTEGER,
      total_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'Pending',
      shipping_address TEXT NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Order Items
  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id ${idType},
      order_id INTEGER,
      product_id INTEGER,
      size VARCHAR(10),
      quantity INTEGER NOT NULL,
      price DECIMAL(10, 2) NOT NULL
    )
  `);

  // Payments
  await run(`
    CREATE TABLE IF NOT EXISTS payments (
      id ${idType},
      order_id INTEGER,
      transaction_id VARCHAR(100) UNIQUE NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      method VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'Pending',
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Reviews
  await run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id ${idType},
      customer_id INTEGER,
      product_id INTEGER,
      rating INTEGER NOT NULL,
      comment TEXT,
      media_urls TEXT,
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Wishlist
  await run(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id ${idType},
      customer_id INTEGER,
      product_id INTEGER,
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Support Inquiries table centralized here
  await run(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id ${idType},
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL,
      phone VARCHAR(15),
      subject VARCHAR(150),
      message TEXT NOT NULL,
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Promotions table
  await run(`
    CREATE TABLE IF NOT EXISTS promotions (
      id ${idType},
      title VARCHAR(150) NOT NULL,
      subtitle VARCHAR(255),
      bg_color VARCHAR(50) DEFAULT 'var(--primary)',
      media_url TEXT,
      link_url TEXT,
      start_date ${datetimeType} NOT NULL,
      end_date ${datetimeType} NOT NULL,
      priority INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Homepage Settings table
  await run(`
    CREATE TABLE IF NOT EXISTS homepage_settings (
      id ${idType},
      hero_title VARCHAR(250) NOT NULL,
      hero_subtitle VARCHAR(255),
      media_url VARCHAR(255),
      media_type VARCHAR(50) DEFAULT 'image', -- 'image' or 'video'
      festival_mode VARCHAR(50) DEFAULT 'none', -- 'none', 'diwali', 'christmas', etc.
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Error Logs table
  await run(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id ${idType},
      message TEXT NOT NULL,
      stack_trace TEXT,
      path VARCHAR(255),
      severity VARCHAR(50) DEFAULT 'error', -- 'low', 'warning', 'critical'
      status VARCHAR(50) DEFAULT 'new', -- 'new', 'investigating', 'resolved'
      suggested_fix TEXT,
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lookbook Pages table
  await run(`
    CREATE TABLE IF NOT EXISTS lookbook_pages (
      id ${idType},
      page_number INTEGER UNIQUE NOT NULL,
      image_url TEXT NOT NULL,
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Coupons table
  await run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id ${idType},
      code VARCHAR(50) UNIQUE NOT NULL,
      discount_type VARCHAR(50) DEFAULT 'percentage', -- 'percentage' or 'amount'
      discount_value DECIMAL(10, 2) NOT NULL,
      description VARCHAR(255),
      tag VARCHAR(50) DEFAULT 'OFFER',
      created_at ${datetimeType} DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // OTP Verifications Table
  await run('DROP TABLE IF EXISTS otp_verifications');
  await run(`
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id ${idType},
      phone VARCHAR(15) UNIQUE NOT NULL,
      otp VARCHAR(6) NOT NULL,
      expires_at VARCHAR(100) NOT NULL
    )
  `);

  // Alter tables to add new columns for user settings and dynamic product details
  const alterQueries = [
    `ALTER TABLE customers ADD COLUMN phone_alt VARCHAR(15)`,
    `ALTER TABLE customers ADD COLUMN address_line_2 VARCHAR(255)`,
    `ALTER TABLE customers ADD COLUMN city_2 VARCHAR(100)`,
    `ALTER TABLE customers ADD COLUMN state_2 VARCHAR(100)`,
    `ALTER TABLE customers ADD COLUMN pincode_2 VARCHAR(10)`,
    `ALTER TABLE customers ADD COLUMN avatar_url VARCHAR(255)`,
    
    `ALTER TABLE products ADD COLUMN video_url VARCHAR(255)`,
    `ALTER TABLE products ADD COLUMN fabric VARCHAR(100)`,
    `ALTER TABLE products ADD COLUMN color VARCHAR(100)`,
    `ALTER TABLE products ADD COLUMN style VARCHAR(100)`,
    `ALTER TABLE products ADD COLUMN gender VARCHAR(50)`,
    `ALTER TABLE order_items ADD COLUMN color VARCHAR(50)`,
    `ALTER TABLE orders ADD COLUMN shiprocket_order_id VARCHAR(50)`,
    `ALTER TABLE orders ADD COLUMN shiprocket_shipment_id VARCHAR(50)`,
    `ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(100)`,
    `ALTER TABLE orders ADD COLUMN tracking_link TEXT`,
    `ALTER TABLE orders ADD COLUMN return_reason TEXT`,
    `ALTER TABLE orders ADD COLUMN return_comments TEXT`,
    `ALTER TABLE products ADD COLUMN return_window_days INTEGER DEFAULT 7`,
    `ALTER TABLE reviews ADD COLUMN media_urls TEXT`
  ];

  for (const q of alterQueries) {
    try {
      await run(q);
    } catch (e) {
      // Ignore if columns already exist
    }
  }

  // PostgreSQL specific column type alterations for long AI generated URLs
  if (dbType === 'postgres') {
    const pgAlterQueries = [
      `ALTER TABLE promotions ALTER COLUMN media_url TYPE TEXT`,
      `ALTER TABLE promotions ALTER COLUMN link_url TYPE TEXT`,
      `ALTER TABLE lookbook_pages ALTER COLUMN image_url TYPE TEXT`,
      `ALTER TABLE products ALTER COLUMN video_url TYPE TEXT`
    ];
    for (const q of pgAlterQueries) {
      try {
        await run(q);
      } catch (e) {
        console.warn('Postgres column alter warning:', e.message);
      }
    }
  }

  // Create database indexes for performance optimization (fixes website lagging)
  const indexQueries = [
    `CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`,
    `CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)`
  ];
  for (const q of indexQueries) {
    try {
      await run(q);
    } catch (e) {
      console.warn('Index creation warning:', e.message);
    }
  }
}

async function seedDatabase() {
  // Check if customers seeded
  const customerCount = await get('SELECT COUNT(*) as count FROM customers');
  if (parseInt(customerCount.count) === 0) {
    console.log('Seeding database with default accounts...');
    const customerHash = await bcrypt.hash('password123', 10);
    const adminHash = await bcrypt.hash('admin123', 10);

    // Regular Customer
    await run(`
      INSERT INTO customers (name, email, phone, password_hash, address_line, city, state, pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['Rajesh Kumar', 'customer@littlelarge.in', '9876543210', customerHash, 'Flat 402, Sunshine Heights, MG Road', 'Bengaluru', 'Karnataka', '560001']);

    // Admin Customer (uses same table with identifier or email checks)
    await run(`
      INSERT INTO customers (name, email, phone, password_hash, address_line, city, state, pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['Admin Manager', 'admin@littlelarge.in', '9999999999', adminHash, 'HQ Little to Large', 'Gandhidham', 'Gujarat', '370201']);
  }

  // Check if products seeded
  const productCount = await get('SELECT COUNT(*) as count FROM products');
  if (parseInt(productCount.count) === 0) {
    console.log('Seeding premium clothing product inventory...');

    const products = [];

    for (const p of products) {
      await run(`
        INSERT INTO products (name, category, subcategory, price, discount_price, stock, description, size_variants, image_urls, rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [p.name, p.category, p.subcategory, p.price, p.discount_price, p.stock, p.description, p.size_variants, p.image_urls, p.rating]);
    }
  }

  // Seed homepage settings
  const settingCount = await get('SELECT COUNT(*) as count FROM homepage_settings');
  if (parseInt(settingCount.count) === 0) {
    console.log('Seeding default homepage settings...');
    await run(`
      INSERT INTO homepage_settings (hero_title, hero_subtitle, media_url, media_type, festival_mode)
      VALUES (?, ?, ?, ?, ?)
    `, [
      'Coordinated Styles for Every Generation',
      'Discover premium matching vacation outfits, lounge wear, and festival wear tailored for the entire family.',
      'images/hero_vacation.png',
      'image',
      'none'
    ]);
  }

  // Seed default promotions
  const promoCount = await get('SELECT COUNT(*) as count FROM promotions');
  if (parseInt(promoCount.count) === 0) {
    console.log('Seeding active holiday promotions...');
    const now = new Date();
    const nextMonth = new Date();
    nextMonth.setMonth(now.getMonth() + 1);

    await run(`
      INSERT INTO promotions (title, subtitle, bg_color, media_url, link_url, start_date, end_date, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'Grand Festival Diwali Sale!',
      'Flat 15% discount on all silk ethnic wear outfits. Use code L2LHOLI.',
      'hsl(38, 92%, 50%)',
      'images/hero_ethnic.png',
      'products.html?category=ethnic',
      now.toISOString(),
      nextMonth.toISOString(),
      10,
      'active'
    ]);

    await run(`
      INSERT INTO promotions (title, subtitle, bg_color, media_url, link_url, start_date, end_date, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'Cyber Monday Smart Combos',
      'Buy 2 kidswear outfits and get a leather mojari set free! Use TWINNING500.',
      'hsl(243, 75%, 19%)',
      'images/hero_kids.png',
      'products.html?category=kids',
      now.toISOString(),
      nextMonth.toISOString(),
      5,
      'active'
    ]);
  }
  
  // Backfill products details if null
  try {
    await run(`UPDATE products SET fabric = 'Cotton', color = 'Saffron', style = 'Ethnic', gender = 'Men', video_url = 'https://www.w3schools.com/html/mov_bbb.mp4' WHERE name LIKE '%kurta%'`);
    await run(`UPDATE products SET fabric = 'Cotton', color = 'Indigo', style = 'Western', gender = 'Men', video_url = 'https://www.w3schools.com/html/mov_bbb.mp4' WHERE name LIKE '%denim%'`);
    await run(`UPDATE products SET fabric = 'Silk', color = 'Emerald', style = 'Ethnic', gender = 'Women', video_url = 'https://www.w3schools.com/html/mov_bbb.mp4' WHERE name LIKE '%saree%'`);
    await run(`UPDATE products SET fabric = 'Cotton', color = 'Blue', style = 'Western', gender = 'Kids', video_url = 'https://www.w3schools.com/html/mov_bbb.mp4' WHERE name LIKE '%shorts%'`);
    await run(`UPDATE products SET fabric = 'Cotton', color = 'Red', style = 'Ethnic', gender = 'Women', video_url = 'https://www.w3schools.com/html/mov_bbb.mp4' WHERE fabric IS NULL`);
  } catch (e) {
    console.error('Failed to backfill product values:', e.message);
  }

  // Seed default lookbook pages
  try {
    const lookbookCount = await get('SELECT COUNT(*) as count FROM lookbook_pages');
    if (parseInt(lookbookCount.count) === 0) {
      console.log('Seeding lookbook pages database...');
      const defaultPages = [
        { page_number: 1, image_url: 'images/lookbook_p1.png' },
        { page_number: 2, image_url: 'images/lookbook_p2.png' },
        { page_number: 3, image_url: 'images/lookbook_p3.png' },
        { page_number: 4, image_url: 'images/lookbook_p4.png' },
        { page_number: 5, image_url: 'images/lookbook_p5.png' },
        { page_number: 6, image_url: 'images/lookbook_p6.png' }
      ];
      for (const page of defaultPages) {
        await run('INSERT INTO lookbook_pages (page_number, image_url) VALUES (?, ?)', [page.page_number, page.image_url]);
      }
    }

    // Seed default coupons
    const couponCount = await get('SELECT COUNT(*) as count FROM coupons');
    if (parseInt(couponCount.count) === 0) {
      console.log('Seeding default active promo coupons...');
      const defaultCoupons = [
        { code: 'WELCOME10', discount_type: 'percentage', discount_value: 10.00, description: 'Applicable on all products. No minimum purchase required.', tag: 'NEW USER' },
        { code: 'FAMILY40', discount_type: 'percentage', discount_value: 40.00, description: 'Save massive amounts on clutches, belts, and mojari footwear combos.', tag: 'ACCESSORIES' },
        { code: 'TWINNING500', discount_type: 'amount', discount_value: 500.00, description: 'Valid on purchase of minimum 2 kids outfits. Perfect for twins.', tag: 'MEGA SAVER' }
      ];
      for (const c of defaultCoupons) {
        await run('INSERT INTO coupons (code, discount_type, discount_value, description, tag) VALUES (?, ?, ?, ?, ?)', [c.code, c.discount_type, c.discount_value, c.description, c.tag]);
      }
    }
  } catch (err) {
    console.error('Failed to seed lookbook pages or coupons:', err.message);
  }

  // Migrate any existing SVG hero paths to PNG and update Slide 1 to vacation image
  try {
    await run("UPDATE promotions SET media_url = 'images/hero_ethnic.png' WHERE media_url = 'images/hero_ethnic.svg'");
    await run("UPDATE promotions SET media_url = 'images/hero_kids.png' WHERE media_url = 'images/hero_kids.svg'");
    await run("UPDATE homepage_settings SET media_url = 'images/hero_vacation.png', hero_title = 'Coordinated Styles for Every Generation', hero_subtitle = 'Discover premium matching vacation outfits, lounge wear, and festival wear tailored for the entire family.' WHERE id = 1");
  } catch (e) {
    console.error('Failed to migrate/update hero slide backgrounds to PNG:', e.message);
  }

  // Seed default system settings
  try {
    const settingsCount = await get('SELECT COUNT(*) as count FROM settings');
    if (parseInt(settingsCount.count) === 0) {
      console.log('Seeding default system settings...');
      await run("INSERT INTO settings (key, value) VALUES ('shipping_fee', '1')");
      await run("INSERT INTO settings (key, value) VALUES ('free_shipping_threshold', '999')");
    }
  } catch (e) {
    console.error('Failed to seed default settings:', e.message);
  }
}

module.exports = {
  initDB,
  query,
  get,
  run,
  getDbType: () => dbType
};

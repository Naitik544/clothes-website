const sqlite3 = require('sqlite3');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

let dbType = 'sqlite'; // 'mysql' or 'sqlite'
let mysqlPool = null;
let sqliteDb = null;

// Initialize connection
async function initDB() {
  const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME;

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
    console.log('No MySQL environment variables found. Using SQLite3 for local development...');
    setupSQLite();
  }

  await createTables();
  await seedDatabase();
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

// Unified Query wrappers
async function query(sql, params = []) {
  if (dbType === 'mysql') {
    const [rows] = await mysqlPool.execute(sql, params);
    return rows;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

async function get(sql, params = []) {
  if (dbType === 'mysql') {
    const [rows] = await mysqlPool.execute(sql, params);
    return rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
}

async function run(sql, params = []) {
  if (dbType === 'mysql') {
    const [result] = await mysqlPool.execute(sql, params);
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
  const ai = isMySQL ? 'AUTO_INCREMENT' : 'AUTOINCREMENT';
  const textType = isMySQL ? 'LONGTEXT' : 'TEXT';
  
  // Customers
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY ${ai},
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(15) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      address_line VARCHAR(255),
      city VARCHAR(100),
      state VARCHAR(100),
      pincode VARCHAR(10),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY ${ai},
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY ${ai},
      customer_id INTEGER,
      total_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'Pending',
      shipping_address TEXT NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Order Items
  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY ${ai},
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
      id INTEGER PRIMARY KEY ${ai},
      order_id INTEGER,
      transaction_id VARCHAR(100) UNIQUE NOT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      method VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Reviews
  await run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY ${ai},
      customer_id INTEGER,
      product_id INTEGER,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Wishlist
  await run(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY ${ai},
      customer_id INTEGER,
      product_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function seedDatabase() {
  // Check if customers seeded
  const customerCount = await get('SELECT COUNT(*) as count FROM customers');
  if (customerCount.count === 0) {
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
    `, ['Admin Manager', 'admin@littlelarge.in', '9999999999', adminHash, 'HQ Little to Large, Sector 62', 'Noida', 'Uttar Pradesh', '201301']);
  }

  // Check if products seeded
  const productCount = await get('SELECT COUNT(*) as count FROM products');
  if (productCount.count === 0) {
    console.log('Seeding premium clothing product inventory...');

    const products = [
      {
        name: "Men's Saffron Silk Kurta",
        category: "Men",
        subcategory: "Ethnic",
        price: 1499.00,
        discount_price: 1199.00,
        stock: 55,
        description: "Elegant silk blend kurta in a rich saffron yellow shade, perfect for wedding ceremonies, festivals, and traditional Indian gatherings. Features detailed neck stitching and premium wooden buttons.",
        size_variants: "S,M,L,XL,XXL",
        image_urls: JSON.stringify(["/images/products/men_ethnic_kurta.svg", "/images/products/men_ethnic_kurta_alt1.svg"]),
        rating: 4.8
      },
      {
        name: "Men's Indigo Slim Fit Denim",
        category: "Men",
        subcategory: "Western",
        price: 1999.00,
        discount_price: 1599.00,
        stock: 80,
        description: "Classic deep indigo blue slim-fit stretchable jeans. Designed for daily comfort and styled with a light faded look. Made of 98% breathable cotton and 2% elastane.",
        size_variants: "30,32,34,36",
        image_urls: JSON.stringify(["/images/products/men_western_denim.svg", "/images/products/men_western_denim_alt1.svg"]),
        rating: 4.3
      },
      {
        name: "Women's Emerald Banarasi Saree",
        category: "Women",
        subcategory: "Ethnic",
        price: 4999.00,
        discount_price: 3999.00,
        stock: 15,
        description: "Exquisite handwoven Banarasi silk saree in rich emerald green with intricate golden zari borders. Includes an unstitched matching blouse piece. A timeless traditional masterpiece.",
        size_variants: "Free Size",
        image_urls: JSON.stringify(["/images/products/women_ethnic_saree.svg", "/images/products/women_ethnic_saree_alt1.svg"]),
        rating: 4.9
      },
      {
        name: "Women's Floral Print Summer Dress",
        category: "Women",
        subcategory: "Western",
        price: 2499.00,
        discount_price: 1899.00,
        stock: 45,
        description: "Lightweight and flowy georgette summer dress with pastel floral prints, puff sleeves, and a flattering A-line silhouette. Ideal for casual family brunches and outdoor outings.",
        size_variants: "XS,S,M,L,XL",
        image_urls: JSON.stringify(["/images/products/women_western_dress.svg", "/images/products/women_western_dress_alt1.svg"]),
        rating: 4.5
      },
      {
        name: "Kid's Cotton Dungaree Set",
        category: "Kids",
        subcategory: "Boys",
        price: 999.00,
        discount_price: 799.00,
        stock: 110,
        description: "Super soft, 100% bio-washed cotton dungarees paired with a striped t-shirt. Features adjustable strap buttons and easy snaps for quick diaper changes. Keep your little boy comfortable all day.",
        size_variants: "6-12M,1-2Y,2-3Y,3-4Y",
        image_urls: JSON.stringify(["/images/products/kids_dungaree.svg", "/images/products/kids_dungaree_alt1.svg"]),
        rating: 4.6
      },
      {
        name: "Girl's Lehenga Choli Set",
        category: "Kids",
        subcategory: "Girls",
        price: 1899.00,
        discount_price: 1499.00,
        stock: 35,
        description: "Beautiful cotton-lining lehenga choli with bright mirror work and comfortable elastic waist. Specially designed lightweight fabric ensuring girls can play and dance without restriction during festivals.",
        size_variants: "2-3Y,4-5Y,6-7Y,8-9Y",
        image_urls: JSON.stringify(["/images/products/kids_lehenga.svg", "/images/products/kids_lehenga_alt1.svg"]),
        rating: 4.7
      },
      {
        name: "Unisex Baby Romper Pack",
        category: "Kids",
        subcategory: "Toddlers",
        price: 799.00,
        discount_price: 599.00,
        stock: 140,
        description: "Pack of 3 organic cotton baby rompers with adorable animal prints. Nickel-free snaps on reinforced panels and stretchable shoulders make dressing effortless.",
        size_variants: "0-3M,3-6M,6-12M",
        image_urls: JSON.stringify(["/images/products/kids_romper.svg", "/images/products/kids_romper_alt1.svg"]),
        rating: 4.4
      },
      {
        name: "Handcrafted Leather Mojari",
        category: "Accessories",
        subcategory: "Footwear",
        price: 1299.00,
        discount_price: 999.00,
        stock: 50,
        description: "Premium quality genuine leather Jodhpuri Mojari for men. Fully handcrafted with golden thread embroidery. Pairs perfectly with kurtas and sherwanis.",
        size_variants: "7,8,9,10,11",
        image_urls: JSON.stringify(["/images/products/acc_mojari.svg"]),
        rating: 4.2
      },
      {
        name: "Embroidered Ethnic Clutch",
        category: "Accessories",
        subcategory: "Bags",
        price: 899.00,
        discount_price: 699.00,
        stock: 65,
        description: "Stunning women's clutch handbag detailed with Indian floral embroidery and beadwork. Includes a detachable metallic chain strap. Spaciously holds phones, keys, and cosmetics.",
        size_variants: "One Size",
        image_urls: JSON.stringify(["/images/products/acc_clutch.svg"]),
        rating: 4.5
      },
      {
        name: "Premium Leather Wallet & Belt Gift Set",
        category: "Accessories",
        subcategory: "Combo",
        price: 1799.00,
        discount_price: 1399.00,
        stock: 70,
        description: "Classic formal combo set featuring a bi-fold wallet and a matching reversible leather belt with high-grade metal buckle. Comes inside an elegant gift box, perfect for family gifting.",
        size_variants: "One Size",
        image_urls: JSON.stringify(["/images/products/acc_giftset.svg"]),
        rating: 4.6
      }
    ];

    for (const p of products) {
      await run(`
        INSERT INTO products (name, category, subcategory, price, discount_price, stock, description, size_variants, image_urls, rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [p.name, p.category, p.subcategory, p.price, p.discount_price, p.stock, p.description, p.size_variants, p.image_urls, p.rating]);
    }
  }

  // Seed sample orders to show metrics in dashboard immediately
  const orderCount = await get('SELECT COUNT(*) as count FROM orders');
  if (orderCount.count === 0) {
    console.log('Seeding sample orders for admin dashboard analytics...');
    
    // Seed 3 orders
    const o1 = await run(`
      INSERT INTO orders (customer_id, total_amount, status, shipping_address, payment_method)
      VALUES (?, ?, ?, ?, ?)
    `, [1, 2398.00, 'Delivered', 'Flat 402, Sunshine Heights, MG Road, Bengaluru, Karnataka, 560001', 'UPI']);
    
    await run(`
      INSERT INTO order_items (order_id, product_id, size, quantity, price)
      VALUES (?, ?, ?, ?, ?)
    `, [o1.insertId, 1, 'M', 2, 1199.00]);

    await run(`
      INSERT INTO payments (order_id, transaction_id, amount, method, status)
      VALUES (?, ?, ?, ?, ?)
    `, [o1.insertId, 'TXN891230491823', 2398.00, 'UPI', 'Completed']);

    const o2 = await run(`
      INSERT INTO orders (customer_id, total_amount, status, shipping_address, payment_method)
      VALUES (?, ?, ?, ?, ?)
    `, [1, 3999.00, 'Shipped', 'Flat 402, Sunshine Heights, MG Road, Bengaluru, Karnataka, 560001', 'Card']);

    await run(`
      INSERT INTO order_items (order_id, product_id, size, quantity, price)
      VALUES (?, ?, ?, ?, ?)
    `, [o2.insertId, 3, 'Free Size', 1, 3999.00]);

    await run(`
      INSERT INTO payments (order_id, transaction_id, amount, method, status)
      VALUES (?, ?, ?, ?, ?)
    `, [o2.insertId, 'TXN1029384756', 3999.00, 'Card', 'Completed']);

    const o3 = await run(`
      INSERT INTO orders (customer_id, total_amount, status, shipping_address, payment_method)
      VALUES (?, ?, ?, ?, ?)
    `, [1, 1398.00, 'Processing', 'Flat 402, Sunshine Heights, MG Road, Bengaluru, Karnataka, 560001', 'COD']);

    await run(`
      INSERT INTO order_items (order_id, product_id, size, quantity, price)
      VALUES (?, ?, ?, ?, ?)
    `, [o3.insertId, 9, 'One Size', 2, 699.00]);

    // Seed some reviews
    await run(`
      INSERT INTO reviews (customer_id, product_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `, [1, 1, 5, 'Beautiful Kurta! The silk quality is outstanding and fits perfectly. Wore it for Diwali.']);
    
    await run(`
      INSERT INTO reviews (customer_id, product_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `, [1, 3, 5, 'Absolutely gorgeous saree. The Banarasi borders have a rich feel. High value for money.']);
  }
}

module.exports = {
  initDB,
  query,
  get,
  run
};

const db = require('../db.js');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    await db.initDB();
    const products = await db.query('SELECT id FROM products');
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    const pages = ['index.html', 'products.html', 'cart.html', 'login.html', 'account.html', 'offers.html', 'about.html'];
    pages.forEach(p => {
      sitemap += `  <url>\n    <loc>https://littletolargee.com/${p}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    });

    products.forEach(p => {
      sitemap += `  <url>\n    <loc>https://littletolargee.com/product-detail.html?id=${p.id}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    });

    sitemap += `</urlset>\n`;

    const publicDir = path.join(__dirname, '..', 'public');
    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap, 'utf8');
    fs.writeFileSync(path.join(publicDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: https://littletolargee.com/sitemap.xml\n`, 'utf8');
    
    console.log('Sitemap and robots.txt regenerated successfully for littletolargee.com!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to regenerate sitemap:', err.message);
    process.exit(1);
  }
})();

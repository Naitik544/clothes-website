// Automated Verification Script for Little to Large APIs
const http = require('http');

function testEndpoint(path, description) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.success) {
            console.log(`✅ SUCCESS: ${description} (${path})`);
            resolve(json);
          } else {
            console.error(`❌ FAILED: ${description} - Status: ${res.statusCode}, Success Flag: ${json.success}`);
            reject(new Error(json.message));
          }
        } catch (err) {
          console.error(`❌ FAILED: ${description} - JSON Parsing error`);
          reject(err);
        }
      });
    }).on('error', (err) => {
      console.error(`❌ FAILED: ${description} - Connection error: ${err.message}`);
      reject(err);
    });
  });
}

async function runTests() {
  console.log("Starting Automated API Integration Verification tests...");
  try {
    // 1. Test Products catalog list
    const catalog = await testEndpoint('/api/products', 'Fetch all products list');
    console.log(`   Fetched ${catalog.products.length} seeded products successfully.`);

    // 2. Test Single product fetch
    if (catalog.products.length > 0) {
      const firstId = catalog.products[0].id;
      const detail = await testEndpoint(`/api/products/${firstId}`, 'Fetch single product detail & reviews');
      console.log(`   Fetched product "${detail.product.name}" successfully.`);
    }

    console.log("\nAll API integration tests completed successfully! 🌟");
  } catch (err) {
    console.error("Test suite execution failed:", err.message);
    process.exit(1);
  }
}

// Give server half a second to settle and run
setTimeout(runTests, 500);

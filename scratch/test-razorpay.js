const crypto = require('crypto');

// Simulated Razorpay keys
const secret = 'test_secret_key_abc_123';
const orderId = 'order_ABC123xyz';
const paymentId = 'pay_XYZ987abc';

// Compute expected signature signature format: order_id + "|" + payment_id
const message = orderId + "|" + paymentId;
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(message)
  .digest('hex');

console.log('--- Razorpay Signature Verification Test ---');
console.log('Message:', message);
console.log('Secret:', secret);
console.log('Generated Signature:', expectedSignature);

// Test validation logic
const verifySignature = (order_id, payment_id, signature, key_secret) => {
  const sign = order_id + "|" + payment_id;
  const expected = crypto
    .createHmac('sha256', key_secret)
    .update(sign)
    .digest('hex');
  return signature === expected;
};

const result = verifySignature(orderId, paymentId, expectedSignature, secret);
console.log('Verification Status:', result ? 'PASSED ✅' : 'FAILED ❌');
process.exit(result ? 0 : 1);

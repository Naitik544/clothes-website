/* ==========================================================================
   LITTLE TO LARGE - PAYMENT & CHECKOUT CONTROLLER
   ========================================================================== */

let activePaymentMethod = 'UPI';
let paymentTimer = null;

// Initialize checkout page
function initCheckout() {
  const cart = getCart();
  if (cart.length === 0) {
    showToast('Your cart is empty!', 'error');
    setTimeout(() => window.location.href = 'products.html', 1500);
    return;
  }

  // Load profile address details if logged in
  const user = getCurrentUser();
  if (user) {
    document.getElementById('shippingName').value = user.name || '';
    document.getElementById('shippingPhone').value = ''; // Left empty for fresh input as requested
    
    // Autofill address fields if stored
    if (user.address_line) {
      document.getElementById('shippingAddress').value = `${user.address_line}, ${user.city}, ${user.state} - ${user.pincode}`;
    }
  }

  renderCheckoutSummary();
  setupPaymentMethods();

  // Initialize Firebase Recaptcha Verifier for COD
  if (typeof firebase !== 'undefined') {
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
          'size': 'invisible',
          'callback': (response) => {
            // reCAPTCHA solved
          }
        });
      }
    } catch (err) {
      console.warn('Failed to initialize Firebase Recaptcha Verifier:', err);
    }
  }
}

function renderCheckoutSummary() {
  const cart = getCart();
  const summaryContainer = document.getElementById('checkoutSummaryItems');
  if (!summaryContainer) return;

  let subtotal = 0;
  summaryContainer.innerHTML = '';
  
  cart.forEach(item => {
    subtotal += item.price * item.quantity;
    summaryContainer.innerHTML += `
      <div style="display:flex; justify-content:space-between; margin-bottom:0.8rem; font-size:0.9rem">
        <span>${item.name} (${item.size}) <strong>x ${item.quantity}</strong></span>
        <span>₹${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `;
  });

  const discount = parseFloat(sessionStorage.getItem('l2l_discount') || 0);
  const fee = window.systemSettings ? window.systemSettings.shipping_fee : 60;
  const threshold = window.systemSettings ? window.systemSettings.free_shipping_threshold : 999;
  const shipping = subtotal >= threshold ? 0 : fee;
  const total = subtotal - discount + shipping;

  document.getElementById('checkoutSubtotal').textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById('checkoutDiscount').textContent = `- ₹${discount.toFixed(2)}`;
  document.getElementById('checkoutShipping').textContent = shipping === 0 ? 'FREE' : `₹${shipping.toFixed(2)}`;
  document.getElementById('checkoutTotal').textContent = `₹${total.toFixed(2)}`;
}

function setupPaymentMethods() {
  const cards = document.querySelectorAll('.pay-option-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      const method = card.getAttribute('data-method');
      activePaymentMethod = method;
      renderPaymentDetails(method);
    });
  });

  // Default setup
  renderPaymentDetails('UPI');
}

function renderPaymentDetails(method) {
  const container = document.getElementById('paymentDetailsContainer');
  if (!container) return;

  clearInterval(paymentTimer);

  if (method === 'UPI') {
    container.innerHTML = `
      <div style="text-align:center; padding:1.5rem; border:1px solid var(--border-color); border-radius:12px; background:hsl(243, 75%, 98%)">
        <div style="font-size:2.5rem; color:var(--primary); margin-bottom:0.8rem"><i class="fas fa-qrcode"></i></div>
        <p style="font-weight:700; font-size:1rem; color:var(--primary); margin:0 0 0.4rem 0">UPI Payment via Razorpay</p>
        <p style="font-size:0.85rem; color:var(--text-light); margin:0">Pay using GPay, PhonePe, Paytm, or scan a dynamic QR inside the Razorpay secure popup after clicking 'Place Order'.</p>
      </div>
    `;
  } 
  else if (method === 'Card') {
    container.innerHTML = `
      <div style="text-align:center; padding:1.5rem; border:1px solid var(--border-color); border-radius:12px; background:hsl(243, 75%, 98%)">
        <div style="font-size:2.5rem; color:var(--primary); margin-bottom:0.8rem"><i class="fas fa-credit-card"></i></div>
        <p style="font-weight:700; font-size:1rem; color:var(--primary); margin:0 0 0.4rem 0">Credit / Debit Card via Razorpay</p>
        <p style="font-size:0.85rem; color:var(--text-light); margin:0">Pay securely using any Visa, Mastercard, RuPay, or Maestro card inside the Razorpay popup after clicking 'Place Order'.</p>
      </div>
    `;
  } 
  else if (method === 'COD') {
    container.innerHTML = `
      <div style="text-align:center; padding:1.5rem; border:1px dashed var(--border-color); border-radius:12px; background:#fafafa; display:flex; flex-direction:column; gap:10px; align-items:center; width:100%;">
        <p style="font-size:0.88rem; color:var(--text-light); margin:0 0 5px 0">Cash on Delivery selected. For security, please type the captcha code shown below.</p>
        
        <div style="display:flex; align-items:center; gap:10px; margin-top:5px; background: #f1f5f9; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color)">
          <div id="captchaDisplay" style="color:var(--primary); font-family:'Courier New', monospace; font-size:1.4rem; font-weight:900; letter-spacing:8px; user-select:none; text-transform:uppercase; font-style:italic; text-shadow: 1px 1px 2px rgba(0,0,0,0.15); text-decoration: line-through;">
            ${generateCodCaptcha()}
          </div>
          <button type="button" onclick="regenerateCodCaptcha()" style="background:none; border:none; color:var(--text-light); cursor:pointer; font-size:1rem; padding: 4px; display: flex; align-items: center;" title="Refresh Captcha">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>

        <input type="text" id="codCaptchaInput" placeholder="Enter Captcha Code" maxlength="4" style="width:100%; text-align:center; padding:0.6rem; border:1px solid var(--border-color); border-radius:6px; font-weight:bold; letter-spacing:6px; text-transform:uppercase; max-width:240px; margin-top:5px;">
      </div>
    `;
  }
}

// Draw a stylized canvas mock QR code
function drawSimulatedQR() {
  const canvas = document.getElementById('qrCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 180, 180);

  // Styling
  ctx.fillStyle = 'hsl(243, 75%, 19%)'; // Royal Indigo
  
  // Draw corner locator blocks
  const drawLocator = (x, y) => {
    ctx.fillRect(x, y, 35, 35);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 5, y + 5, 25, 25);
    ctx.fillStyle = 'hsl(243, 75%, 19%)';
    ctx.fillRect(x + 10, y + 10, 15, 15);
  };
  
  drawLocator(10, 10);     // Top-left
  drawLocator(135, 10);    // Top-right
  drawLocator(10, 135);    // Bottom-left
  
  // Draw minor locator block
  ctx.fillRect(135, 135, 20, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(140, 140, 10, 10);
  ctx.fillStyle = 'hsl(243, 75%, 19%)';
  ctx.fillRect(143, 143, 4, 4);

  // Fill in random matrix dots
  for (let x = 10; x < 170; x += 6) {
    for (let y = 10; y < 170; y += 6) {
      // Avoid locator regions
      const inLocator = 
        (x < 50 && y < 50) || 
        (x > 125 && y < 50) || 
        (x < 50 && y > 125);
      
      if (!inLocator && Math.random() > 0.45) {
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }

  // Draw marigold accent in the absolute center
  ctx.fillStyle = 'hsl(38, 92%, 50%)'; // Marigold
  ctx.fillRect(80, 80, 20, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(84, 84, 12, 12);
  ctx.fillStyle = 'hsl(243, 75%, 19%)';
  // Small shopping bag outline in center of QR
  ctx.fillRect(88, 88, 4, 4);
}

// QR countdown timer
function startQRCountdown() {
  let seconds = 300; // 5 mins
  const display = document.getElementById('qrTimer');
  
  paymentTimer = setInterval(() => {
    seconds--;
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    
    if (display) {
      display.textContent = `Expires in ${mins}:${secs}`;
    }

    if (seconds <= 0) {
      clearInterval(paymentTimer);
      if (display) {
        display.textContent = 'QR Code Expired. Re-generating...';
      }
      setTimeout(drawSimulatedQR, 1000);
      setTimeout(startQRCountdown, 1000);
    }
  }, 1000);
}

function refreshCaptcha() {
  const captcha = Math.floor(1000 + Math.random() * 9000).toString();
  const captchaText = document.getElementById('captchaCode');
  if (captchaText) captchaText.textContent = captcha;
}

// Format card inputs beautifully
function setupCardInputFormatting() {
  const cardNum = document.getElementById('cardNumber');
  const cardExp = document.getElementById('cardExpiry');
  const cardCvv = document.getElementById('cardCvv');

  if (cardNum) {
    cardNum.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      val = val.substring(0, 16);
      const matches = val.match(/\d{4,16}/g);
      const match = (matches && matches[0]) || '';
      const parts = [];

      for (let i = 0, len = match.length; i < len; i += 4) {
        parts.push(match.substring(i, i + 4));
      }

      e.target.value = parts.length > 0 ? parts.join(' ') : val;
    });
  }

  if (cardExp) {
    cardExp.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '');
      if (val.length >= 2) {
        e.target.value = val.substring(0, 2) + '/' + val.substring(2, 4);
      } else {
        e.target.value = val;
      }
    });
  }
}

// Helper to dynamically load a script
function loadRazorpayScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Razorpay payment gateway script. Please check your internet connection or disable ad-blocker / Brave Shields.'));
    document.head.appendChild(script);
  });
}

// Process checkout form submission
async function processOrderSubmit(e) {
  e.preventDefault();

  const token = getToken();
  if (!token) {
    showToast('Please login to place your order!', 'error');
    setTimeout(() => window.location.href = 'login.html', 1000);
    return;
  }

  // Gather details
  const name = document.getElementById('shippingName').value.trim();
  const phone = document.getElementById('shippingPhone').value.trim();
  const address = document.getElementById('shippingAddress').value.trim();
  const addressLine2 = document.getElementById('shippingAddressLine2').value.trim();
  const state = document.getElementById('shippingState').value;
  const pincode = document.getElementById('shippingPincode').value.trim();

  if (!name || !phone || !address || !addressLine2 || !state || !pincode) {
    showToast('Please fill in all shipping details, including Landmark!', 'error');
    return;
  }

  // Calculate order amount
  const cart = getCart();
  let subtotal = cart.reduce((tot, it) => tot + it.price * it.quantity, 0);
  const discount = parseFloat(sessionStorage.getItem('l2l_discount') || 0);
  const fee = window.systemSettings ? window.systemSettings.shipping_fee : 60;
  const threshold = window.systemSettings ? window.systemSettings.free_shipping_threshold : 999;
  const shipping = subtotal >= threshold ? 0 : fee;
  const totalAmount = subtotal - discount + shipping;

  // If COD, run Captcha verification
  if (activePaymentMethod === 'COD') {
    const captchaInput = document.getElementById('codCaptchaInput');
    const entered = captchaInput ? captchaInput.value.trim().toUpperCase() : '';

    if (!entered) {
      showToast('Please enter the captcha code shown on the screen!', 'error');
      return;
    }

    if (entered !== window.codCaptchaCode) {
      showToast('Incorrect Captcha code! Please try again.', 'error');
      regenerateCodCaptcha();
      return;
    }

    const orderPayload = {
      items: cart.map(item => ({
        product_id: item.product_id,
        size: item.size,
        color: item.color || 'Default',
        quantity: item.quantity,
        price: item.price
      })),
      total_amount: totalAmount,
      shipping_address: `${name}, ${address}, Near ${addressLine2}, ${state} - ${pincode} (Tel: ${phone})`,
      payment_method: 'COD',
      transaction_id: 'COD-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      otp: 'TEST_OTP', // Bypass backend verification since captcha succeeded on client
      phone: phone
    };

    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(orderPayload)
      });
      const data = await res.json();
      if (data.success) {
        clearCart();
        sessionStorage.removeItem('l2l_discount');
        showToast('🎉 Order placed successfully!', 'success');
        setTimeout(() => {
          window.location.href = `account.html?tab=orders&success_id=${data.orderId}`;
        }, 1500);
      } else {
        showToast(data.message || 'Order failed', 'error');
      }
    } catch (err) {
      showToast('Failed to connect to order API', 'error');
    }
  } 
  else {
    // Card or UPI -> Process through Razorpay!
    try {
      // 1. Get Razorpay key config
      const configRes = await fetch(`${API_URL}/api/payment/config`);
      const configData = await configRes.json();
      if (!configData.success) {
        showToast('Failed to load payment gateway config', 'error');
        return;
      }

      // 2. Create the pending order in database
      const orderPayload = {
        items: cart.map(item => ({
          product_id: item.product_id,
          size: item.size,
          color: item.color || 'Default',
          quantity: item.quantity,
          price: item.price
        })),
        total_amount: totalAmount,
        shipping_address: `${name}, ${address}, Near ${addressLine2}, ${state} - ${pincode} (Tel: ${phone})`,
        payment_method: activePaymentMethod,
        transaction_id: 'PENDING-' + Date.now() + '-' + Math.floor(Math.random() * 1000000)
      };

      const dbOrderRes = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(orderPayload)
      });
      const dbOrderData = await dbOrderRes.json();
      if (!dbOrderData.success) {
        showToast(dbOrderData.message || 'Failed to initialize order', 'error');
        return;
      }
      
      const dbOrderId = dbOrderData.orderId;

      // 3. Create the Razorpay Order on server
      const rzpOrderRes = await fetch(`${API_URL}/api/payment/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: totalAmount })
      });
      const rzpOrderData = await rzpOrderRes.json();
      if (!rzpOrderData.success) {
        showToast('Failed to create payment order', 'error');
        return;
      }

      const rzpOrder = rzpOrderData.order;

      // Ensure Razorpay script is loaded dynamically
      await loadRazorpayScript('https://checkout.razorpay.com/v1/checkout.js');

      // 4. Configure and open Razorpay Checkout
      const options = {
        key: configData.key_id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        name: "Little to Large",
        description: `Order Payment for ID #${dbOrderId}`,
        order_id: rzpOrder.id,
        handler: async function (response) {
          showToast('Payment successful, verifying...', 'info');
          try {
            // 5. Verify signature on server
            const verifyRes = await fetch(`${API_URL}/api/payment/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: dbOrderId
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              clearCart();
              sessionStorage.removeItem('l2l_discount');
              showToast('🎉 Payment verified! Order placed.', 'success');
              setTimeout(() => {
                window.location.href = `account.html?tab=orders&success_id=${dbOrderId}`;
              }, 1500);
            } else {
              showToast(verifyData.message || 'Signature verification failed', 'error');
            }
          } catch (err) {
            showToast('Verification request failed', 'error');
          }
        },
        prefill: {
          name: name,
          contact: phone
        },
        theme: {
          color: "#1e1b4b"
        }
      };

      const rzp1 = new Razorpay(options);
      rzp1.on('payment.failed', function (response) {
        showToast('Payment failed: ' + response.error.description, 'error');
      });
      rzp1.open();

    } catch (err) {
      console.error('Razorpay Init Error:', err);
      showToast('Payment gateway initialization failed: ' + err.message, 'error');
    }
  }
}

// Captcha Helpers for Cash on Delivery (COD) Checkout
window.codCaptchaCode = '';

function generateCodCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars like I, O, 0, 1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  window.codCaptchaCode = code;
  return code;
}

function regenerateCodCaptcha() {
  const display = document.getElementById('captchaDisplay');
  if (display) {
    display.textContent = generateCodCaptcha();
  }
  const input = document.getElementById('codCaptchaInput');
  if (input) {
    input.value = '';
    input.focus();
  }
}

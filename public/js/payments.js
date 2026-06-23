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
    document.getElementById('shippingPhone').value = user.phone || '';
    
    // Autofill address fields if stored
    if (user.address_line) {
      document.getElementById('shippingAddress').value = `${user.address_line}, ${user.city}, ${user.state} - ${user.pincode}`;
    }
  }

  renderCheckoutSummary();
  setupPaymentMethods();
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
  const shipping = subtotal > 999 ? 0 : 60;
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
      <div class="qr-code-display">
        <canvas id="qrCanvas" width="180" height="180"></canvas>
        <p style="font-weight:700; font-size:0.9rem; color:var(--primary); margin:0">Scan dynamic UPI QR code</p>
        <span style="font-size:0.75rem; color:var(--text-light)">GPay, PhonePe, Paytm or any UPI App</span>
        <div id="qrTimer" style="font-weight:800; font-size:0.85rem; color:var(--danger)">Expires in 05:00</div>
      </div>
    `;
    drawSimulatedQR();
    startQRCountdown();
  } 
  else if (method === 'Card') {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:1rem">
        <div>
          <label style="font-size:0.8rem; font-weight:700">Cardholder Name</label>
          <input type="text" id="cardName" placeholder="Enter name on card" class="form-input" style="width:100%; padding:0.6rem; border:1px solid var(--border-color); border-radius:6px; margin-top:0.3rem" required>
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:700">Card Number</label>
          <input type="text" id="cardNumber" placeholder="1234 5678 9101 1121" maxlength="19" class="form-input" style="width:100%; padding:0.6rem; border:1px solid var(--border-color); border-radius:6px; margin-top:0.3rem" required>
        </div>
        <div style="display:flex; gap:1rem">
          <div style="flex:1">
            <label style="font-size:0.8rem; font-weight:700">Expiry (MM/YY)</label>
            <input type="text" id="cardExpiry" placeholder="MM/YY" maxlength="5" class="form-input" style="width:100%; padding:0.6rem; border:1px solid var(--border-color); border-radius:6px; margin-top:0.3rem" required>
          </div>
          <div style="flex:1">
            <label style="font-size:0.8rem; font-weight:700">CVV</label>
            <input type="password" id="cardCvv" placeholder="***" maxlength="3" class="form-input" style="width:100%; padding:0.6rem; border:1px solid var(--border-color); border-radius:6px; margin-top:0.3rem" required>
          </div>
        </div>
      </div>
    `;
    setupCardInputFormatting();
  } 
  else if (method === 'COD') {
    // Generate simple captcha code
    const captcha = Math.floor(1000 + Math.random() * 9000).toString();
    container.innerHTML = `
      <div style="text-align:center; padding:1rem; border:1px dashed var(--border-color); border-radius:var(--radius); background:#fafafa">
        <p style="font-size:0.88rem; color:var(--text-light); margin-bottom:0.8rem">Cash on Delivery option selected. Please verify yourself to avoid fraud orders.</p>
        <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:0.8rem">
          <span id="captchaCode" style="font-size:1.4rem; font-weight:800; background:#eee; padding:0.3rem 1rem; border-radius:4px; letter-spacing:4px; user-select:none; color:var(--primary)">${captcha}</span>
          <button type="button" onclick="refreshCaptcha()" style="background:none; border:none; color:var(--text-light); cursor:pointer"><i class="fas fa-sync-alt"></i></button>
        </div>
        <input type="text" id="captchaInput" placeholder="Enter 4-Digit Code" maxlength="4" style="width:180px; text-align:center; padding:0.5rem; border:1px solid var(--border-color); border-radius:6px" required>
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
  const state = document.getElementById('shippingState').value;
  const pincode = document.getElementById('shippingPincode').value.trim();

  if (!name || !phone || !address || !state || !pincode) {
    showToast('Please fill in all shipping details!', 'error');
    return;
  }

  // Validate payment inputs
  let txnId = '';
  if (activePaymentMethod === 'Card') {
    const cardName = document.getElementById('cardName').value.trim();
    const cardNum = document.getElementById('cardNumber').value.trim();
    const cardExp = document.getElementById('cardExpiry').value.trim();
    const cardCvv = document.getElementById('cardCvv').value.trim();

    if (!cardName || cardNum.length < 19 || cardExp.length < 5 || cardCvv.length < 3) {
      showToast('Please check card payment details!', 'error');
      return;
    }
    txnId = 'TXN-CARD-' + Date.now();
  } 
  else if (activePaymentMethod === 'COD') {
    const captcha = document.getElementById('captchaCode').textContent;
    const input = document.getElementById('captchaInput').value.trim();

    if (captcha !== input) {
      showToast('Verification code is incorrect!', 'error');
      return;
    }
  } 
  else {
    // UPI QR simulated payment ID
    txnId = 'TXN-UPI-' + Math.floor(Math.random() * 9E9) + 'L2L';
  }

  // Construct payload
  const cart = getCart();
  let subtotal = cart.reduce((tot, it) => tot + it.price * it.quantity, 0);
  const discount = parseFloat(sessionStorage.getItem('l2l_discount') || 0);
  const shipping = subtotal > 999 ? 0 : 60;
  const totalAmount = subtotal - discount + shipping;

  const orderPayload = {
    items: cart.map(item => ({
      product_id: item.product_id,
      size: item.size,
      quantity: item.quantity,
      price: item.price
    })),
    total_amount: totalAmount,
    shipping_address: `${name}, ${address}, ${state} - ${pincode} (Tel: ${phone})`,
    payment_method: activePaymentMethod,
    transaction_id: txnId
  };

  try {
    // Trigger placing order API
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
      // Clear Cart state
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

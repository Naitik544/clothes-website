/* ==========================================================================
   LITTLE TO LARGE - CHATBOT LOGIC
   ========================================================================= */

function handleChatKey(e) {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
}

function handleChipClick(text) {
  appendMessage(text, 'user');
  processBotResponse(text);
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  appendMessage(text, 'user');
  input.value = '';
  processBotResponse(text);
}

function appendMessage(text, sender) {
  const msgs = document.getElementById('chatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;
  msgDiv.innerHTML = text;
  msgs.appendChild(msgDiv);
  msgs.scrollTop = msgs.scrollHeight;
}

async function processBotResponse(text) {
  const query = text.toLowerCase().trim();
  
  // Show loading indicator
  const msgs = document.getElementById('chatMessages');
  const loader = document.createElement('div');
  loader.className = 'chat-msg bot loading';
  loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Typist is typing...';
  msgs.appendChild(loader);
  msgs.scrollTop = msgs.scrollHeight;

  // 1. Structured Order Tracking Check
  if (query.startsWith('track') || query.includes('order status') || query.includes('track order')) {
    const match = query.match(/\d+/); // Find numeric order id
    if (match) {
      loader.remove();
      const orderId = match[0];
      await fetchOrderTracking(orderId);
      return;
    }
  }

  // 2. Dynamic LLM Assistant Call
  try {
    const token = getToken(); // From app.js
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: text })
    });
    
    loader.remove();
    const data = await res.json();
    
    if (data.success && data.response) {
      // Basic markdown replacement for formatting
      const formatted = data.response
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      appendMessage(formatted, 'bot');
    } else {
      appendMessage('🤖 I am currently resting. Please try asking me again in a moment!', 'bot');
    }
  } catch (err) {
    loader.remove();
    appendMessage('🤖 Connection failed. Please check your internet connection and try again.', 'bot');
  }
}

// Helper to query products based on category for chatbot
async function fetchProductRecommendations(category) {
  try {
    const res = await fetch(`/api/products?category=${category}`);
    const data = await res.json();
    if (data.success && data.products.length > 0) {
      let botHtml = `🛍️ Here are some featured items in <strong>${category}</strong>:<br><br>`;
      const items = data.products.slice(0, 3); // top 3 items
      items.forEach(p => {
        const image = JSON.parse(p.image_urls || '[]')[0] || '/images/products/placeholder.jpg';
        botHtml += `
          <div style="display:flex; gap:10px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #eee">
            <img src="${image}" style="width:40px; height:50px; object-fit:cover; border-radius:4px">
            <div style="flex:1">
              <a href="product-detail.html?id=${p.id}" style="color:var(--primary); font-weight:700; font-size:0.82rem">${p.name}</a><br>
              <span style="color:var(--accent); font-weight:800; font-size:0.8rem">₹${p.discount_price || p.price}</span>
              ${p.discount_price ? `<span style="text-decoration:line-through; font-size:0.75rem; color:#888; margin-left:5px">₹${p.price}</span>` : ''}
            </div>
          </div>
        `;
      });
      botHtml += `<a href="products.html?category=${category}" style="display:block; text-align:center; font-size:0.8rem; font-weight:700; color:var(--primary)">View all ${category} items →</a>`;
      appendMessage(botHtml, 'bot');
    } else {
      appendMessage(`Sorry, I couldn't fetch recommended products for ${category} at this time.`, 'bot');
    }
  } catch (err) {
    appendMessage('Unable to access catalog server. Please try again later.', 'bot');
  }
}

// Helper to fetch tracking updates
async function fetchOrderTracking(orderId) {
  const token = getToken();
  if (!token) {
    appendMessage(`🔑 Please <a href="login.html" style="color:var(--accent); font-weight:700">Login</a> to track your orders securely.`, 'bot');
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (data.success) {
      const order = data.order;
      let statusColor = 'var(--text-light)';
      let statusIcon = '⏳';
      let details = '';

      if (order.status === 'Pending') {
        statusColor = '#d97706';
        details = 'Your order has been received and is awaiting payment validation.';
      } else if (order.status === 'Processing') {
        statusColor = '#2563eb';
        statusIcon = '⚙️';
        details = 'Our team is carefully packing your clothes in eco-friendly family boxes.';
      } else if (order.status === 'Shipped') {
        statusColor = '#3b82f6';
        statusIcon = '🚚';
        details = 'Your shipment is in transit via BlueDart express courier.';
      } else if (order.status === 'Delivered') {
        statusColor = 'hsl(162, 72%, 41%)';
        statusIcon = '✅';
        details = 'Package delivered successfully. Hope your family loves the outfits!';
      } else {
        statusColor = '#dc2626';
        statusIcon = '❌';
        details = 'This order was cancelled.';
      }

      appendMessage(`
        <strong>Order Status: #${order.id}</strong><br>
        Status: <span style="color:${statusColor}; font-weight:700">${statusIcon} ${order.status}</span><br>
        Total: <strong>₹${order.total_amount}</strong><br>
        Payment Method: <strong>${order.payment_method}</strong><br><br>
        <em>${details}</em>
      `, 'bot');
    } else {
      appendMessage(`❌ Order <strong>#${orderId}</strong> was not found. Please verify the ID on your profile page.`, 'bot');
    }
  } catch (err) {
    appendMessage('Error querying order tracking server. Please try again.', 'bot');
  }
}

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

  // Add subtle delay to feel organic
  await new Promise(resolve => setTimeout(resolve, 800));
  loader.remove();

  // 1. Order Tracking Check
  if (query.startsWith('track') || query.includes('order status') || query.includes('track order')) {
    const match = query.match(/\d+/); // Find numeric order id
    if (match) {
      const orderId = match[0];
      await fetchOrderTracking(orderId);
      return;
    } else {
      appendMessage(`📦 <strong>Order Tracking:</strong> Please provide your order number by typing <strong>"track [orderID]"</strong> (e.g., <strong>track 1</strong> or <strong>track 3</strong>).`, 'bot');
      return;
    }
  }

  // 2. Product Search Categories
  if (query.includes('kid') || query.includes('boy') || query.includes('girl') || query.includes('baby') || query.includes('child')) {
    await fetchProductRecommendations('Kids');
    return;
  }
  if (query.includes('women') || query.includes('saree') || query.includes('dress') || query.includes('girl clothing')) {
    await fetchProductRecommendations('Women');
    return;
  }
  if (query.includes('men') || query.includes('kurta') || query.includes('denim') || query.includes('male')) {
    await fetchProductRecommendations('Men');
    return;
  }
  if (query.includes('accessories') || query.includes('bag') || query.includes('clutch') || query.includes('wallet')) {
    await fetchProductRecommendations('Accessories');
    return;
  }

  // 3. Offers
  if (query.includes('offer') || query.includes('discount') || query.includes('coupon') || query.includes('sale') || query.includes('deal')) {
    appendMessage(`🏷️ <strong>Exclusive Active Coupons:</strong><br>
    • <strong>WELCOME10</strong> - Get 10% off on your first purchase.<br>
    • <strong>FAMILY40</strong> - Flat 40% off on all accessories.<br>
    • <strong>L2LHOLI</strong> - Special 15% discount on traditional ethnic wear.<br><br>
    Check out our <a href="offers.html" style="color:var(--accent); font-weight:700">Offers Page</a> for active clearance bargains!`, 'bot');
    return;
  }

  // 4. Shipping & Returns FAQ
  if (query.includes('shipping') || query.includes('delivery') || query.includes('charge') || query.includes('pincode')) {
    appendMessage(`🚚 <strong>Shipping Policy:</strong><br>
    - We deliver to over 19,000+ pincodes in India.<br>
    - Delivery is free for all orders above <strong>₹999</strong>. For orders below ₹999, a flat delivery fee of ₹60 is charged.<br>
    - Standard delivery takes 3 to 5 business days in metro cities, and 5 to 7 days globally/internationally.`, 'bot');
    return;
  }

  if (query.includes('return') || query.includes('refund') || query.includes('exchange')) {
    appendMessage(`🔄 <strong>Easy 7-Day Returns:</strong><br>
    - We offer a hassle-free 7-day return and exchange policy on unwashed & unused garments with tags intact.<br>
    - To initiate a return, go to your <strong>My Orders</strong> tab in the Account profile and click "Return".<br>
    - Refund is processed to the source account within 48 hours of product pickup.`, 'bot');
    return;
  }

  // 5. Size Guide Help
  if (query.includes('size') || query.includes('fit') || query.includes('measurement')) {
    appendMessage(`📏 <strong>Size Guide assistance:</strong><br>
    - We cater to sizes starting from newborn babies (<strong>0-3M</strong>) all the way up to double extra large (<strong>XXL</strong>) for adults.<br>
    - Every product details page includes a measurement chart link. If you fall between sizes, we recommend choosing one size larger for kids as they grow fast!`, 'bot');
    return;
  }

  // Default response
  appendMessage(`🤖 I'm not sure I understood that request perfectly. I can assist you with:<br>
  - Finding clothing (e.g. "Show me Men Kurtas" or "Kids wear")<br>
  - Order tracking (e.g. type "track 1")<br>
  - Offers and coupons (type "offers")<br>
  - Shipping & Returns info.<br><br>
  Alternatively, you can email us at <strong>support@littlelarge.in</strong> or choose an option below:`, 'bot');
  
  // Show chips again
  const chipsDiv = document.createElement('div');
  chipsDiv.className = 'chat-chips';
  chipsDiv.innerHTML = `
    <span class="chat-chip" onclick="handleChipClick('Shop Kids Wear')">👶 Kids wear</span>
    <span class="chat-chip" onclick="handleChipClick('Shop Women Wear')">👗 Women wear</span>
    <span class="chat-chip" onclick="handleChipClick('Track My Order')">📦 Track Order</span>
    <span class="chat-chip" onclick="handleChipClick('Offers & Discount')">🏷️ Offers</span>
  `;
  msgs.appendChild(chipsDiv);
  msgs.scrollTop = msgs.scrollHeight;
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

/* ==========================================================================
   LITTLE TO LARGE - COMMON APP JS (STATE & UI TEMPLATES)
   ========================================================================== */

const API_URL = ''; // Relative path for unified host

// Toast Notification Helper
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.left = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.style.padding = '0.8rem 1.5rem';
  toast.style.borderRadius = '8px';
  toast.style.color = '#fff';
  toast.style.fontWeight = '600';
  toast.style.fontSize = '0.9rem';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.animation = 'fadeInUp 0.3s ease';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '0.5rem';

  if (type === 'success') {
    toast.style.backgroundColor = 'hsl(162, 72%, 41%)'; // Emerald Green
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
  } else if (type === 'error') {
    toast.style.backgroundColor = 'hsl(354, 78%, 57%)'; // Crimson Red
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
  } else {
    toast.style.backgroundColor = 'hsl(243, 75%, 19%)'; // Royal Indigo
    toast.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
  }

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Session Helpers
function getToken() {
  return localStorage.getItem('l2l_token');
}

function saveToken(token, user) {
  localStorage.setItem('l2l_token', token);
  localStorage.setItem('l2l_user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('l2l_token');
  localStorage.removeItem('l2l_user');
  showToast('Logged out successfully', 'info');
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1000);
}

function getCurrentUser() {
  const userStr = localStorage.getItem('l2l_user');
  return userStr ? JSON.parse(userStr) : null;
}

// Cart Management Helpers
function getCart() {
  const cartStr = localStorage.getItem('l2l_cart');
  return cartStr ? JSON.parse(cartStr) : [];
}

function saveCart(cart) {
  localStorage.setItem('l2l_cart', JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(product, size = 'M', qty = 1) {
  if (!getToken()) {
    showToast('Please login or register to add outfits to your family box!', 'error');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1200);
    return;
  }
  if (product.stock !== undefined && parseInt(product.stock) <= 0) {
    showToast(`Sorry, ${product.name} is currently Out of Stock!`, 'error');
    return;
  }
  const cart = getCart();
  const index = cart.findIndex(item => item.product_id === product.id && item.size === size);

  if (index > -1) {
    cart[index].quantity += qty;
  } else {
    cart.push({
      product_id: product.id,
      name: product.name,
      price: product.discount_price || product.price,
      image: JSON.parse(product.image_urls || '[]')[0] || '/images/products/placeholder.jpg',
      size: size,
      quantity: qty,
      stock: product.stock
    });
  }

  saveCart(cart);
  showToast(`${product.name} (${size}) added to cart!`);
}

function removeFromCart(productId, size) {
  let cart = getCart();
  cart = cart.filter(item => !(item.product_id === productId && item.size === size));
  saveCart(cart);
  showToast('Item removed from cart', 'info');
}

function updateCartQty(productId, size, qty) {
  const cart = getCart();
  const index = cart.findIndex(item => item.product_id === productId && item.size === size);
  if (index > -1) {
    cart[index].quantity = parseInt(qty);
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    saveCart(cart);
  }
}

function clearCart() {
  localStorage.removeItem('l2l_cart');
  updateCartBadge();
}

function updateCartBadge() {
  const cart = getCart();
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const badges = document.querySelectorAll('.cart-badge');
  badges.forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
    
    // Trigger CSS bounce animation
    badge.classList.remove('badge-bounce');
    void badge.offsetWidth; // Force reflow
    badge.classList.add('badge-bounce');
  });
}

// Wishlist Helpers
async function toggleWishlistItem(productId) {
  const token = getToken();
  if (!token) {
    // Local fallback for guest
    let wishlist = getLocalWishlist();
    const index = wishlist.indexOf(productId);
    if (index > -1) {
      wishlist.splice(index, 1);
      saveLocalWishlist(wishlist);
      showToast('Removed from wishlist', 'info');
      return false;
    } else {
      wishlist.push(productId);
      saveLocalWishlist(wishlist);
      showToast('Added to wishlist!');
      return true;
    }
  }

  try {
    const res = await fetch(`${API_URL}/api/wishlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ product_id: productId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message);
      return data.added;
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to sync wishlist', 'error');
  }
}

function getLocalWishlist() {
  const listStr = localStorage.getItem('l2l_wishlist');
  return listStr ? JSON.parse(listStr) : [];
}

function saveLocalWishlist(list) {
  localStorage.setItem('l2l_wishlist', JSON.stringify(list));
}

// Layout Render Engine
function renderHeaderFooter() {
  const user = getCurrentUser();
  const isAdmin = user && user.email === 'admin@littlelarge.in';

  // Inject font awesome link in head dynamically if missing
  if (!document.querySelector('link[href*="cdnjs.cloudflare.com/ajax/libs/font-awesome"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(link);
  }

  // Find header & footer tags
  const headerTag = document.querySelector('header');
  const footerTag = document.querySelector('footer');

  if (headerTag) {
    const avatarImg = user && user.avatar_url ? user.avatar_url : 'https://cdn-icons-png.flaticon.com/512/147/147144.png';
    headerTag.innerHTML = `
      <div class="top-bar">
        🚚 Free Shipping across India on orders above ₹999 | <span>Festive Sale: Up to 40% OFF</span>
      </div>
      <div class="container navbar">
        <button class="hamburger-btn" onclick="toggleNavDrawer()"><i class="fas fa-bars"></i></button>
        
        <a href="index.html" class="logo">
          🛍️ Little <span class="logo-accent">to</span> Large
        </a>
        
        <nav class="nav-links">
          <a href="index.html">Home</a>
          <a href="products.html">Shop All</a>
          <a href="products.html?category=Men">Men</a>
          <a href="products.html?category=Women">Women</a>
          <a href="products.html?category=Kids">Kids</a>
          <a href="products.html?style=Ethnic">Festival Wear</a>
          <a href="products.html?sort=newest">New Trends</a>
        </nav>
        
        <div class="nav-actions">
          <button class="mobile-search-toggle" onclick="toggleMobileSearch()"><i class="fas fa-search"></i></button>
          
          <form class="search-bar" action="products.html" method="GET">
            <input type="text" name="search" placeholder="Search clothes..." required>
            <button type="submit"><i class="fas fa-search"></i></button>
          </form>
          
          <a href="account.html" class="action-icon" title="My Account" style="display:flex; align-items:center">
            ${user ? `<img src="${avatarImg}" class="header-avatar" alt="Avatar">` : `<i class="far fa-user"></i>`}
          </a>
          
          <a href="account.html?tab=wishlist" class="action-icon" title="Wishlist">
            <i class="far fa-heart"></i>
          </a>

          <a href="cart.html" class="action-icon" title="Cart">
            <i class="fas fa-shopping-bag"></i>
            <span class="badge cart-badge">0</span>
          </a>

          ${isAdmin ? `<a href="admin.html" class="btn btn-primary" style="padding: 0.4rem 1rem; font-size: 0.8rem;">Admin</a>` : ''}
          ${user ? `<button onclick="logout()" class="btn btn-accent" style="padding: 0.4rem 1rem; font-size: 0.8rem;">Logout</button>` : `<a href="login.html" class="btn btn-primary" style="padding: 0.4rem 1rem; font-size: 0.8rem;">Login</a>`}
        </div>
      </div>
      
      <!-- Mobile Search Container -->
      <div class="mobile-search-container" id="mobileSearchContainer">
        <form style="display:flex; width:100%; gap:10px" action="products.html" method="GET">
          <input type="text" name="search" placeholder="Search clothes..." style="flex:1; padding:0.5rem 1rem; border:1px solid var(--border-color); border-radius:50px" required>
          <button type="submit" class="btn btn-primary" style="padding:0.5rem 1.2rem; border-radius:50px"><i class="fas fa-search"></i></button>
        </form>
      </div>

    `;
  }

  // Inject mobile drawer to body if missing so it has global viewport stacking context
  if (!document.getElementById('navDrawer')) {
    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.id = 'drawerOverlay';
    overlay.onclick = toggleNavDrawer;
    document.body.appendChild(overlay);

    const drawer = document.createElement('div');
    drawer.className = 'nav-drawer';
    drawer.id = 'navDrawer';
    
    const avatarImg = user && user.avatar_url ? user.avatar_url : 'https://cdn-icons-png.flaticon.com/512/147/147144.png';
    drawer.innerHTML = `
        <!-- Header Profile Block -->
        <div class="drawer-header">
          <button class="drawer-close-btn" onclick="toggleNavDrawer()"><i class="fas fa-times"></i></button>
          ${user ? `
            <div class="drawer-user-info">
              <img src="${avatarImg}" alt="User Avatar" onerror="this.src='https://cdn-icons-png.flaticon.com/512/147/147144.png'">
              <div>
                <div class="drawer-user-name">${user.name}</div>
                <div class="drawer-user-email">${user.email}</div>
              </div>
            </div>
          ` : `
            <div class="drawer-user-info">
              <div class="guest-icon"><i class="far fa-user"></i></div>
              <div>
                <div class="drawer-user-name">Welcome Guest</div>
                <div class="drawer-user-email">Shop premium clothes</div>
              </div>
            </div>
            <a href="login.html" class="drawer-login-btn" onclick="toggleNavDrawer()">Login / Sign Up</a>
          `}
        </div>

        <div class="drawer-body">
          <!-- Section 1: Quick Actions -->
          <div class="drawer-links-group">
            <a href="index.html" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-home"></i> Home</a>
            <a href="products.html" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-shopping-bag"></i> Shop All Collections</a>
            <a href="account.html" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-box"></i> My Orders & Profile</a>
            <a href="account.html?tab=wishlist" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-heart"></i> My Wishlist</a>
            <a href="cart.html" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-shopping-cart"></i> My Shopping Bag</a>
          </div>

          <!-- Section 2: Shop by Category -->
          <div class="drawer-section-title">Shop Categories</div>
          <div class="drawer-links-group">
            <a href="products.html?category=Men" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-male"></i> Men's Wear</a>
            <a href="products.html?category=Women" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-female"></i> Women's Wear</a>
            <a href="products.html?category=Kids" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-child"></i> Children's Wear</a>
            <a href="products.html?style=Ethnic" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-star"></i> Festival Wear</a>
            <a href="products.html?sort=newest" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-fire"></i> New Trends</a>
          </div>

          <!-- Section 3: More Info -->
          <div class="drawer-section-title">More Info</div>
          <div class="drawer-links-group">
            <a href="offers.html" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-tags"></i> Promo Offers & Deals</a>
            <a href="about.html" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-info-circle"></i> Our Brand Story</a>
            <a href="about.html#contact" class="drawer-link" onclick="toggleNavDrawer()"><i class="fas fa-headset"></i> Contact Support</a>
          </div>

          <!-- Section 4: Logout (If logged in) -->
          ${user ? `
            <a href="#" class="drawer-link logout-link" onclick="toggleNavDrawer(); logout();"><i class="fas fa-sign-out-alt"></i> Logout</a>
          ` : ''}
        </div>
    `;
    document.body.appendChild(drawer);
  }

  if (footerTag) {
    footerTag.innerHTML = `
      <div class="container footer-grid">
        <div class="footer-col">
          <div class="footer-logo">🛍️ Little <span class="logo-accent">to</span> Large</div>
          <p>India's premium family clothing store. We bring comfortable, beautiful ethnic and western outfits from infants to adults. Designed to grow and scale with Indian family values.</p>
          <div class="social-links">
            <a href="#" class="social-icon"><i class="fab fa-facebook-f"></i></a>
            <a href="#" class="social-icon"><i class="fab fa-instagram"></i></a>
            <a href="#" class="social-icon"><i class="fab fa-youtube"></i></a>
            <a href="#" class="social-icon"><i class="fab fa-twitter"></i></a>
          </div>
        </div>
        <div class="footer-col">
          <h3>Quick Links</h3>
          <ul>
            <li><a href="products.html">Collections</a></li>
            <li><a href="offers.html">Deals & Coupons</a></li>
            <li><a href="about.html">Our Brand Story</a></li>
            <li><a href="about.html#contact">Contact Support</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3>Family Wardrobe</h3>
          <ul>
            <li><a href="products.html?category=Men">Men's Apparel</a></li>
            <li><a href="products.html?category=Women">Women's Sarees & Dresses</a></li>
            <li><a href="products.html?category=Kids">Kids' Ethnic & Toddler Sets</a></li>
            <li><a href="products.html?category=Accessories">Premium Accessories</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h3>Customer Trust</h3>
          <p>📞 Support: +91 7383874045<br>✉️ Email: indiancloths980@gmail.com</p>
          <p style="margin-top: 1rem; font-size: 0.8rem; color: rgba(255,255,255,0.5)">🔒 Safe Payments: UPI, Credit Card, Cash on Delivery</p>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="container">
          <p>&copy; 2026 Little to Large E-Commerce. Made with ❤️ in India. All Rights Reserved.</p>
        </div>
      </div>
      <!-- Cookie Consent Banner -->
      <div id="cookieConsentBanner" class="cookie-banner" style="display: none;">
        <div class="cookie-content">
          <p>🍪 We use cookies to optimize your family shopping experience, manage your active bag, and secure payments. By continuing, you agree to our privacy policy.</p>
          <div class="cookie-buttons">
            <button onclick="acceptCookies(true)" class="btn-cookie accept">Accept All</button>
            <button onclick="acceptCookies(false)" class="btn-cookie reject">Essential Only</button>
          </div>
        </div>
      </div>
    `;
  }

  updateCartBadge();
}

// Global Cookie Consent actions
window.acceptCookies = function(allowAll) {
  localStorage.setItem("cookie_preference", allowAll ? "accepted" : "essential_only");
  const banner = document.getElementById("cookieConsentBanner");
  if (banner) banner.style.display = "none";
};

window.checkCookiePreference = function() {
  if (!localStorage.getItem("cookie_preference")) {
    const banner = document.getElementById("cookieConsentBanner");
    if (banner) banner.style.display = "block";
  }
};

// Injected Header/Footer execution on DOM load
document.addEventListener('DOMContentLoaded', () => {
  renderHeaderFooter();
  setupChatbotUI();
  checkCookiePreference();
});

// Chatbot UI dynamic loader (External Integration)
function setupChatbotUI() {
  if (window.location.pathname.includes('admin.html')) return;

  const script = document.createElement('script');
  script.src = 'https://www.noupe.com/embed/019ef86078af765e89d9a700fd6f73d533b6.js';
  script.async = true;
  document.head.appendChild(script);
}

function toggleNavDrawer() {
  const drawer = document.getElementById('navDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (drawer && overlay) {
    const isActive = drawer.classList.toggle('active');
    overlay.classList.toggle('active');
    
    if (isActive) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
  }
}

function toggleMobileSearch() {
  const searchContainer = document.getElementById('mobileSearchContainer');
  if (searchContainer) {
    searchContainer.classList.toggle('active');
  }
}

/* ==========================================================================
   LITTLE TO LARGE - PREMIUM FASHION UX & INTERACTION ENGINE
   ========================================================================== */

// 1. DYNAMIC NAVIGATION PROGRESS BAR & GLOBAL LOADER
let progressInterval = null;

function initGlobalProgressBar() {
  if (!document.getElementById('globalProgressBar')) {
    const bar = document.createElement('div');
    bar.id = 'globalProgressBar';
    document.body.appendChild(bar);
  }
}

function startGlobalProgressBar() {
  initGlobalProgressBar();
  const bar = document.getElementById('globalProgressBar');
  bar.style.opacity = '1';
  bar.style.width = '0%';
  
  let width = 0;
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (width < 85) {
      width += Math.random() * 8;
      bar.style.width = `${width}%`;
    }
  }, 150);
}

function completeGlobalProgressBar() {
  const bar = document.getElementById('globalProgressBar');
  if (!bar) return;
  clearInterval(progressInterval);
  bar.style.width = '100%';
  setTimeout(() => {
    bar.style.opacity = '0';
    setTimeout(() => { bar.style.width = '0%'; }, 200);
  }, 300);
}

// 2. SMART BROWSING HISTORY TRACKER (Smart Loading fallback)
function recordProductInHistory(product) {
  if (!product || !product.id) return;
  try {
    let history = JSON.parse(localStorage.getItem('l2l_browsing_history') || '[]');
    // Remove if already exists to push to front
    history = history.filter(p => p.id !== product.id);
    history.unshift({
      id: product.id,
      name: product.name,
      price: product.price,
      discount_price: product.discount_price,
      image: JSON.parse(product.image_urls || '[]')[0] || ''
    });
    // Keep max 6 items
    if (history.length > 6) history.pop();
    localStorage.setItem('l2l_browsing_history', JSON.stringify(history));
  } catch (e) {
    console.error('History track error:', e.message);
  }
}

function getBrowsingHistory() {
  try {
    return JSON.parse(localStorage.getItem('l2l_browsing_history') || '[]');
  } catch (e) {
    return [];
  }
}

// 3. SHIMMER SKELETON INJECTORS
function injectProductGridSkeleton(container, count = 4) {
  if (!container) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="product-card" style="pointer-events:none">
        <div class="skeleton-box skeleton-img"></div>
        <div class="product-details" style="padding:1rem">
          <div class="skeleton-box skeleton-text" style="width:40%; margin-bottom:8px"></div>
          <div class="skeleton-box skeleton-title" style="width:90%; height:18px; margin-bottom:12px"></div>
          <div class="skeleton-box skeleton-text" style="width:30%; height:12px; margin-bottom:12px"></div>
          <div class="skeleton-box skeleton-text" style="width:50%; height:16px; margin-bottom:15px"></div>
          <div class="skeleton-box skeleton-btn"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function injectProductDetailSkeleton(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="skeleton-detail-grid" style="margin:3rem 0; pointer-events:none">
      <div style="display:flex; flex-direction:column; gap:1rem">
        <div class="skeleton-box" style="height:500px; border-radius:20px"></div>
        <div style="display:flex; gap:1rem">
          <div class="skeleton-box" style="width:80px; height:80px; border-radius:12px"></div>
          <div class="skeleton-box" style="width:80px; height:80px; border-radius:12px"></div>
          <div class="skeleton-box" style="width:80px; height:80px; border-radius:12px"></div>
        </div>
      </div>
      <div>
        <div class="skeleton-box skeleton-text" style="width:25%; height:14px; margin-bottom:12px"></div>
        <div class="skeleton-box skeleton-title" style="width:85%; height:32px; margin-bottom:15px"></div>
        <div class="skeleton-box skeleton-text" style="width:40%; height:20px; margin-bottom:20px"></div>
        <div class="skeleton-box skeleton-text" style="width:95%; height:80px; margin-bottom:25px"></div>
        <div class="skeleton-box skeleton-text" style="width:50%; height:24px; margin-bottom:15px"></div>
        <div style="display:flex; gap:10px; margin-bottom:25px">
          <div class="skeleton-box" style="width:40px; height:40px; border-radius:50%"></div>
          <div class="skeleton-box" style="width:40px; height:40px; border-radius:50%"></div>
          <div class="skeleton-box" style="width:40px; height:40px; border-radius:50%"></div>
        </div>
        <div style="display:flex; gap:1.5rem">
          <div class="skeleton-box skeleton-btn" style="flex:1; height:50px; border-radius:50px"></div>
          <div class="skeleton-box skeleton-btn" style="flex:1; height:50px; border-radius:50px"></div>
        </div>
      </div>
    </div>
  `;
}

// 4. DYNAMIC BUTTON LOADER Feedback wrapper
async function wrapButtonLoader(button, promise) {
  if (!button || button.disabled) return;
  
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.classList.add('btn-ripple');
  button.innerHTML = `<span class="btn-loading-spinner"></span> Loading...`;
  
  try {
    const result = await promise;
    button.classList.add('btn-success-state');
    button.innerHTML = `<i class="fas fa-check"></i> Success`;
    setTimeout(() => {
      resetButton(button, originalHtml);
    }, 1500);
    return result;
  } catch (err) {
    button.classList.add('btn-error-state');
    button.innerHTML = `<i class="fas fa-times"></i> Failed`;
    setTimeout(() => {
      resetButton(button, originalHtml);
    }, 1500);
    throw err;
  }
}

function resetButton(button, originalHtml) {
  button.disabled = false;
  button.innerHTML = originalHtml;
  button.classList.remove('btn-success-state', 'btn-error-state');
}

// 5. FLY-TO-CART ENGINE
function animateFlyToCart(imgElement, cartIconSelector = '.fa-shopping-bag') {
  if (!imgElement) return;
  const cartIcon = document.querySelector(cartIconSelector);
  if (!cartIcon) return;

  const rect = imgElement.getBoundingClientRect();
  const cartRect = cartIcon.getBoundingClientRect();

  // Create clone
  const clone = document.createElement('img');
  clone.src = imgElement.src;
  clone.className = 'fly-item';
  clone.style.top = `${rect.top}px`;
  clone.style.left = `${rect.left}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  document.body.appendChild(clone);

  // Animate parabolic movement
  setTimeout(() => {
    clone.style.transform = `translate(${cartRect.left - rect.left}px, ${cartRect.top - rect.top}px) scale(0.1)`;
    clone.style.opacity = '0.3';
  }, 50);

  // Clean up and bounce
  setTimeout(() => {
    clone.remove();
    // Trigger cart badge bounce and glow
    const badge = document.querySelector('.cart-badge');
    if (badge) {
      badge.classList.remove('cart-badge-bounce');
      void badge.offsetWidth; // trigger reflow
      badge.classList.add('cart-badge-bounce');
    }
    const cartBtn = cartIcon.parentElement;
    if (cartBtn) {
      cartBtn.classList.add('cart-icon-glow');
      setTimeout(() => { cartBtn.classList.remove('cart-icon-glow'); }, 600);
    }
  }, 850);
}

// 6. IMAGE PROGRESSIVE LAZY LOADING (Observer)
function setupLazyImages() {
  const images = document.querySelectorAll('.lazy-image');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.getAttribute('data-src') || img.src;
          img.onload = () => {
            img.classList.add('loaded');
          };
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '0px 0px 100px 0px' });
    
    images.forEach(img => observer.observe(img));
  } else {
    // Fallback if no observer support
    images.forEach(img => {
      img.src = img.getAttribute('data-src') || img.src;
      img.classList.add('loaded');
    });
  }
}

// 7. OFFLINE CONNECTION WARNING MONITOR
function initOfflineMonitor() {
  // Offline monitoring disabled to prevent mobile false-positives
}

// 8. BTN CLICK RIPPLE EFFECTS
function setupRippleEffects() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .auth-btn, .btn-add-cart, .btn-primary');
    if (!btn) return;
    
    // Create ripple element
    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    btn.appendChild(ripple);
    setTimeout(() => { ripple.remove(); }, 500);
  });
}

// 9. 3D PERSPECTIVE TILT HOVER EFFECTS
function initPremium3DEffects() {
  const applyTilt = () => {
    document.querySelectorAll('.product-card').forEach(card => {
      if (card.classList.contains('tilt-card-3d')) return;
      card.classList.add('tilt-card-3d');

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const xc = rect.width / 2;
        const yc = rect.height / 2;
        const angleX = (yc - y) / 12; // tilt up/down
        const angleY = (x - xc) / 12; // tilt left/right
        
        card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) translateY(-8px) scale(1.02)`;
        card.style.transition = 'transform 0.05s ease';
      });
      
      card.addEventListener('mouseleave', () => {
        card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)`;
        card.style.transition = 'transform 0.5s ease';
      });
    });
  };

  applyTilt();
  
  // Watch for dynamic DOM changes (catalog filters / sorting)
  const grid = document.getElementById('catalogGrid') || document.getElementById('featuredProductsGrid') || document.querySelector('.products-grid');
  if (grid) {
    const observer = new MutationObserver(applyTilt);
    observer.observe(grid, { childList: true });
  }
}

// 10. SMOOTH FADE SLIDE UP ENTRANCE ANIMATIONS
function initEntranceAnimations() {
  document.querySelectorAll('main, section.container, .about-hero, .cart-container, .account-layout, .login-container').forEach(el => {
    el.classList.add('fade-slide-up');
  });
}

// 11. INTERACTIVE SHOPPING GUIDE & USER ONBOARDING WIDGET
function initInteractiveShopperGuide() {
  // Only inject on storefront customer pages (avoid admin)
  if (window.location.pathname.includes('admin') || window.location.pathname.includes('login') && !window.location.pathname.endsWith('/')) {
    return;
  }

  const guideBtn = document.createElement('div');
  guideBtn.id = 'shopperGuideBtn';
  guideBtn.innerHTML = `<i class="fas fa-lightbulb"></i> Guide`;
  guideBtn.style.cssText = `
    position: fixed;
    bottom: 85px;
    right: 20px;
    background: linear-gradient(135deg, var(--marigold), #f59e0b);
    color: var(--primary);
    padding: 10px 18px;
    border-radius: 50px;
    font-weight: 800;
    font-size: 0.85rem;
    box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
    cursor: pointer;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(255,255,255,0.2);
  `;
  
  const guideCard = document.createElement('div');
  guideCard.id = 'shopperGuideCard';
  guideCard.style.cssText = `
    position: fixed;
    bottom: 145px;
    right: -400px;
    width: 320px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 10px 25px rgba(30, 27, 75, 0.15);
    border: 1px solid var(--border-color);
    padding: 18px;
    z-index: 9999;
    font-family: inherit;
    transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  
  guideCard.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom:10px; margin-bottom:12px;">
      <h4 style="margin:0; font-size:0.95rem; color:var(--primary); font-weight:800; display:flex; align-items:center; gap:6px;">
        <span style="font-size:1.1rem;">🛍️</span> Shopper Guide
      </h4>
      <button id="closeGuideBtn" style="background:none; border:none; color:var(--text-light); cursor:pointer; font-size:0.9rem;"><i class="fas fa-times"></i></button>
    </div>
    <div style="display:flex; flex-direction:column; gap:10px; font-size:0.8rem; line-height:1.45; color:var(--text-dark);">
      <div style="display:flex; gap:8px;">
        <span style="font-weight:800; color:var(--marigold-dark);">1.</span>
        <span>Browse categories like <strong>Men, Women, or Kids</strong> outfits from the navigation.</span>
      </div>
      <div style="display:flex; gap:8px;">
        <span style="font-weight:800; color:var(--marigold-dark);">2.</span>
        <span>Select your desired <strong>Color swatch</strong> and <strong>Size</strong> on product details.</span>
      </div>
      <div style="display:flex; gap:8px;">
        <span style="font-weight:800; color:var(--marigold-dark);">3.</span>
        <span>Add items to cart. (Cart gets <strong>Free Shipping</strong> above ₹999!)</span>
      </div>
      <div style="display:flex; gap:8px;">
        <span style="font-weight:800; color:var(--marigold-dark);">4.</span>
        <span>Open Cart, type active promo code like <strong>WELCOME10</strong>, and click Apply.</span>
      </div>
      <div style="display:flex; gap:8px;">
        <span style="font-weight:800; color:var(--marigold-dark);">5.</span>
        <span>Select Cash on Delivery (COD) or online payment, fill shipping details, type the Captcha, and click Place Order!</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(guideBtn);
  document.body.appendChild(guideCard);
  
  // Show card on button click
  guideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    guideCard.style.right = '20px';
    guideBtn.style.transform = 'scale(0.9) rotate(-3deg)';
  });
  
  // Hide card on close click
  guideCard.querySelector('#closeGuideBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    guideCard.style.right = '-400px';
    guideBtn.style.transform = 'scale(1) rotate(0deg)';
  });
  
  // Hide on click outside
  document.addEventListener('click', (e) => {
    if (!guideCard.contains(e.target) && e.target !== guideBtn) {
      guideCard.style.right = '-400px';
      guideBtn.style.transform = 'scale(1) rotate(0deg)';
    }
  });

  // Pulse effect periodically to draw attention
  setInterval(() => {
    if (guideCard.style.right !== '20px') {
      guideBtn.style.transform = 'scale(1.1)';
      setTimeout(() => {
        if (guideCard.style.right !== '20px') {
          guideBtn.style.transform = 'scale(1)';
        }
      }, 300);
    }
  }, 8000);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initGlobalProgressBar();
  initOfflineMonitor();
  setupRippleEffects();
  setupLazyImages();
  initPremium3DEffects();
  initEntranceAnimations();
  initInteractiveShopperGuide();
});

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
  if (!document.getElementById('offlineWarningBanner')) {
    const banner = document.createElement('div');
    banner.id = 'offlineWarningBanner';
    banner.className = 'offline-banner';
    banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> You are currently offline. Check your internet connection.`;
    document.body.appendChild(banner);
  }

  window.addEventListener('offline', () => {
    document.getElementById('offlineWarningBanner').classList.add('active');
  });

  window.addEventListener('online', () => {
    const banner = document.getElementById('offlineWarningBanner');
    banner.classList.remove('active');
    // Briefly show green reconnect toast
    if (typeof showToast === 'function') {
      showToast('Connection restored! Re-syncing data...', 'success');
    }
  });
  
  if (!navigator.onLine) {
    document.getElementById('offlineWarningBanner').classList.add('active');
  }
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initGlobalProgressBar();
  initOfflineMonitor();
  setupRippleEffects();
  setupLazyImages();
});

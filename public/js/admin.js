/* ==========================================================================
   LITTLE TO LARGE - ADMIN DASHBOARD LOGIC
   ========================================================================= */

const token = getToken();

// Verify Admin on page entry
document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user || user.email !== 'admin@littlelarge.in') {
    showToast('Unauthorized access!', 'error');
    setTimeout(() => window.location.href = 'login.html', 1000);
    return;
  }

  // Load active tab
  loadDashboardAnalytics();
  setupSidebarNavigation();
});

function setupSidebarNavigation() {
  const links = document.querySelectorAll('.admin-sidebar-menu a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const targetSection = link.getAttribute('data-section');
      showSection(targetSection);
    });
  });
}

function showSection(sectionId) {
  const sections = ['analyticsSection', 'ordersSection', 'productsSection', 'inquiriesSection'];
  sections.forEach(id => {
    document.getElementById(id).style.display = id === sectionId ? 'block' : 'none';
  });

  if (sectionId === 'analyticsSection') loadDashboardAnalytics();
  else if (sectionId === 'ordersSection') loadAdminOrders();
  else if (sectionId === 'productsSection') loadAdminProducts();
  else if (sectionId === 'inquiriesSection') loadAdminInquiries();
}

/* ==========================================================================
   1. ANALYTICS & DASHBOARD METRICS
   ========================================================================== */
async function loadDashboardAnalytics() {
  try {
    const res = await fetch('/api/admin/analytics', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('metricSales').textContent = `₹${parseFloat(data.metrics.totalSales).toLocaleString('en-IN')}`;
      document.getElementById('metricOrders').textContent = data.metrics.totalOrders;
      document.getElementById('metricPending').textContent = data.metrics.pendingOrders;
      document.getElementById('metricCustomers').textContent = data.metrics.totalCustomers;

      renderLowStockAlerts(data.metrics.lowStock);
      renderSalesChart(data.monthlySales);
    }
  } catch (err) {
    showToast('Failed to load dashboard analytics', 'error');
  }
}

function renderLowStockAlerts(items) {
  const list = document.getElementById('lowStockList');
  if (!list) return;
  list.innerHTML = '';
  
  if (items.length === 0) {
    list.innerHTML = '<li style="color:var(--success); font-weight:600">✅ All products have healthy stock levels.</li>';
    return;
  }

  items.forEach(it => {
    list.innerHTML += `
      <li style="color:var(--danger); display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid #eee">
        <span>⚠️ ${it.name}</span>
        <strong>Only ${it.stock} left!</strong>
      </li>
    `;
  });
}

// Draw a beautiful custom CSS bar chart inside dashboard
function renderSalesChart(data) {
  const chartWrapper = document.getElementById('salesChartWrapper');
  if (!chartWrapper) return;
  chartWrapper.innerHTML = '';

  const maxVal = Math.max(...data.map(d => d.sales));
  
  data.forEach(d => {
    const pctHeight = (d.sales / maxVal) * 85; // cap height at 85%
    chartWrapper.innerHTML += `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end">
        <span style="font-size:0.75rem; font-weight:700; color:var(--primary); margin-bottom:5px">₹${Math.round(d.sales/1000)}k</span>
        <div style="width:35px; height:${pctHeight}%; background:linear-gradient(180deg, var(--marigold) 0%, var(--primary) 100%); border-radius:6px; transition:height 1s ease"></div>
        <span style="font-size:0.8rem; font-weight:600; color:var(--text-light); margin-top:8px">${d.month}</span>
      </div>
    `;
  });
}

/* ==========================================================================
   2. ORDER MANAGEMENT
   ========================================================================== */
async function loadAdminOrders() {
  try {
    const res = await fetch('/api/admin/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      const tbody = document.querySelector('#adminOrdersTable tbody');
      tbody.innerHTML = '';

      data.orders.forEach(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        tbody.innerHTML += `
          <tr>
            <td><strong>#${o.id}</strong></td>
            <td>
              <strong>${o.customer_name}</strong><br>
              <span style="font-size:0.78rem; color:var(--text-light)">${o.customer_email}</span>
            </td>
            <td>${date}</td>
            <td><strong>₹${parseFloat(o.total_amount).toFixed(2)}</strong></td>
            <td>${o.payment_method} (${o.payment_status})</td>
            <td>
              <select onchange="updateOrderStatus(${o.id}, this.value)" class="form-select" style="padding:0.3rem 0.5rem; border-radius:4px; border:1px solid var(--border-color); font-weight:700; color:var(--primary)">
                <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
                <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
              </select>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showToast('Failed to load orders', 'error');
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Order #${orderId} status updated to ${newStatus}`);
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Error changing order status', 'error');
  }
}

/* ==========================================================================
   3. PRODUCT CRUD OPERATIONS
   ========================================================================== */
let editingProductId = null;

async function loadAdminProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success) {
      const tbody = document.querySelector('#adminProductsTable tbody');
      tbody.innerHTML = '';

      data.products.forEach(p => {
        const image = JSON.parse(p.image_urls || '[]')[0] || '/images/products/placeholder.jpg';
        tbody.innerHTML += `
          <tr>
            <td><img src="${image}" style="width:40px; height:50px; object-fit:cover; border-radius:4px"></td>
            <td><strong>${p.name}</strong><br><span style="font-size:0.75rem; color:#888">${p.category} | ${p.subcategory}</span></td>
            <td><strong>₹${p.price}</strong> ${p.discount_price ? `<br><span style="text-decoration:line-through; font-size:0.75rem; color:#999">₹${p.discount_price}</span>` : ''}</td>
            <td>${p.stock} units</td>
            <td>${p.size_variants}</td>
            <td>
              <button onclick="openEditProductModal(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="btn" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--primary); color:#fff"><i class="fas fa-edit"></i></button>
              <button onclick="deleteProduct(${p.id})" class="btn" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--danger); color:#fff"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showToast('Failed to load products list', 'error');
  }
}

function openAddProductModal() {
  editingProductId = null;
  document.getElementById('productModalTitle').textContent = 'Add New Clothing Product';
  document.getElementById('productForm').reset();
  document.getElementById('productModal').style.display = 'flex';
}

function openEditProductModal(product) {
  editingProductId = product.id;
  document.getElementById('productModalTitle').textContent = 'Edit Clothing Product';
  
  // Prefill form
  document.getElementById('prodName').value = product.name;
  document.getElementById('prodCategory').value = product.category;
  document.getElementById('prodSubcategory').value = product.subcategory || '';
  document.getElementById('prodPrice').value = product.price;
  document.getElementById('prodDiscountPrice').value = product.discount_price || '';
  document.getElementById('prodStock').value = product.stock;
  document.getElementById('prodSizes').value = product.size_variants;
  document.getElementById('prodDesc').value = product.description;

  document.getElementById('productModal').style.display = 'flex';
}

function closeProductModal() {
  document.getElementById('productModal').style.display = 'none';
}

async function handleProductFormSubmit(e) {
  e.preventDefault();

  const form = document.getElementById('productForm');
  const formData = new FormData(form);

  const url = editingProductId ? `/api/products/${editingProductId}` : '/api/products';
  const method = editingProductId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeProductModal();
      loadAdminProducts();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Error uploading product data', 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to permanently delete this product?')) return;

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Product deleted successfully');
      loadAdminProducts();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to delete product', 'error');
  }
}

/* ==========================================================================
   4. INQUIRIES MANAGEMENT
   ========================================================================== */
async function loadAdminInquiries() {
  try {
    const res = await fetch('/api/inquiries', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      const tbody = document.querySelector('#adminInquiriesTable tbody');
      tbody.innerHTML = '';

      if (data.inquiries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-light)">No customer support inquiries available.</td></tr>';
        return;
      }

      data.inquiries.forEach(inq => {
        const date = new Date(inq.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        tbody.innerHTML += `
          <tr>
            <td>${date}</td>
            <td><strong>${inq.name}</strong><br><span style="font-size:0.75rem; color:#888">${inq.email} | ${inq.phone || 'N/A'}</span></td>
            <td><strong style="color:var(--primary)">${inq.subject || 'General'}</strong></td>
            <td><div style="max-width:350px; font-size:0.85rem">${inq.message}</div></td>
            <td>
              <a href="mailto:${inq.email}?subject=Re: ${inq.subject || 'Little to Large Support'}" class="btn btn-primary" style="padding:0.3rem 0.8rem; font-size:0.75rem">Reply</a>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showToast('Failed to load customer inquiries', 'error');
  }
}

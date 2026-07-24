/* ==========================================================================
   LITTLE TO LARGE - ADMIN DASHBOARD LOGIC
   ========================================================================= */

const token = getToken();

function toggleAdminSidebar(e) {
  if (e) e.stopPropagation();
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('adminSidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  }
}

// Verify Admin on page entry
document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user || user.email !== 'admin@littlelarge.in') {
    showToast('Unauthorized access!', 'error');
    setTimeout(() => window.location.href = 'login.html', 1000);
    return;
  }

  // Auto-close sidebar on mobile menu clicks
  const sidebarLinks = document.querySelectorAll('.admin-sidebar-menu a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      const sidebar = document.getElementById('adminSidebar');
      const overlay = document.getElementById('adminSidebarOverlay');
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      }
    });
  });

  // Load active tab
  loadDashboardAnalytics();
  setupSidebarNavigation();
});

function setupSidebarNavigation() {
  const links = document.querySelectorAll('.admin-sidebar-menu a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetSection = link.getAttribute('data-section');
      if (targetSection) {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        showSection(targetSection);
      }
    });
  });
}

function showSection(sectionId) {
  const sections = ['analyticsSection', 'ordersSection', 'productsSection', 'inquiriesSection', 'promotionsSection', 'errorSection', 'lookbookSection', 'settingsSection'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === sectionId ? 'block' : 'none';
  });

  if (sectionId === 'analyticsSection') loadDashboardAnalytics();
  else if (sectionId === 'ordersSection') loadAdminOrders();
  else if (sectionId === 'productsSection') loadAdminProducts();
  else if (sectionId === 'inquiriesSection') loadAdminInquiries();
  else if (sectionId === 'promotionsSection') {
    loadHomepageSettings();
    loadAdminPromotions();
    loadAdminCoupons();
    prefillPromoDates();
  }
  else if (sectionId === 'errorSection') loadAdminErrors();
  else if (sectionId === 'lookbookSection') loadAdminLookbook();
  else if (sectionId === 'settingsSection') loadAdminShippingSettings();
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
      renderInventoryCharts(data.categoryBreakdown); // Render GA charts!
      loadAudienceSegments(); // Load marketing segments
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

  const maxVal = Math.max(...data.map(d => d.sales)) || 1; // Prevent division by zero (NaN)
  
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

let pieChartInstance = null;
let valuationChartInstance = null;

function renderInventoryCharts(categoryData) {
  if (!categoryData || categoryData.length === 0) return;

  const categories = categoryData.map(d => d.category);
  const itemCounts = categoryData.map(d => d.count);
  const stockLevels = categoryData.map(d => d.total_stock || 0);
  const stockValuations = categoryData.map(d => d.total_value || 0);

  // 1. Render Pie Chart (Inventory Category Share)
  const pieCtx = document.getElementById('inventoryPieChart');
  if (pieCtx) {
    if (pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: categories,
        datasets: [{
          data: itemCounts,
          backgroundColor: [
            'hsl(243, 75%, 25%)', // Indigo
            'hsl(38, 92%, 50%)',  // Marigold
            'hsl(162, 72%, 41%)', // Emerald
            'hsl(354, 78%, 57%)'  // Crimson
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              font: { weight: 'bold', size: 10 }
            }
          }
        }
      }
    });
  }

  // 2. Render Bar Chart (Stock Levels vs Valuations)
  const valCtx = document.getElementById('inventoryValuationChart');
  if (valCtx) {
    if (valuationChartInstance) valuationChartInstance.destroy();
    valuationChartInstance = new Chart(valCtx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [
          {
            label: 'Total Stock (Units)',
            data: stockLevels,
            backgroundColor: 'rgba(30, 27, 75, 0.7)',
            borderColor: 'hsl(243, 75%, 19%)',
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Stock Value (₹)',
            data: stockValuations,
            backgroundColor: 'rgba(217, 119, 6, 0.7)',
            borderColor: 'hsl(38, 92%, 50%)',
            borderWidth: 1,
            type: 'line',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Stock (Units)', font: { weight: 'bold' } }
          },
          y1: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Valuation (₹)', font: { weight: 'bold' } }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { weight: 'bold', size: 10 } }
          }
        }
      }
    });
  }
}

async function exportOrdersToExcel() {
  try {
    const res = await fetch('/api/admin/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success || data.orders.length === 0) {
      showToast('No orders found to export', 'error');
      return;
    }

    // Format the orders data for Excel
    const formattedRows = data.orders.map(o => {
      const dateStr = new Date(o.created_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      return {
        'Order ID': `#${o.id}`,
        'Customer Name': o.customer_name,
        'Customer Email': o.customer_email,
        'Order Date': dateStr,
        'Total Amount (₹)': parseFloat(o.total_amount),
        'Payment Method': o.payment_method,
        'Payment Status': o.payment_status,
        'Fulfillment Status': o.status,
        'Shipping Address': o.shipping_address
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);
    const workbook = XLSX.utils.book_new();
    const targetSheetName = "Orders Report";
    XLSX.utils.book_append_sheet(workbook, worksheet, targetSheetName);

    // Adjust column widths automatically
    worksheet["!cols"] = [
      { wch: 10 }, // Order ID
      { wch: 20 }, // Customer Name
      { wch: 25 }, // Customer Email
      { wch: 15 }, // Order Date
      { wch: 18 }, // Total Amount
      { wch: 16 }, // Payment Method
      { wch: 16 }, // Payment Status
      { wch: 18 }, // Fulfillment Status
      { wch: 45 }  // Shipping Address
    ];

    // Download file
    XLSX.writeFile(workbook, `L2L_Orders_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Orders report exported to Excel successfully!', 'success');
  } catch (err) {
    showToast('Failed to export orders to Excel', 'error');
  }
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
        
        let shiprocketColHtml = '';
        if (o.status === 'Shipped' || o.status === 'Delivered') {
          shiprocketColHtml = `
            <span style="font-size:0.8rem; color:var(--success); font-weight:bold"><i class="fas fa-truck"></i> Shipped</span><br>
            <span style="font-size:0.75rem">AWB: <a href="${o.tracking_link || '#'}" target="_blank" style="color:var(--secondary); text-decoration:underline; font-weight:bold">${o.tracking_number || 'Track'}</a></span>
          `;
        } else if (o.status === 'Cancelled') {
          shiprocketColHtml = `<span style="font-size:0.8rem; color:var(--danger)">N/A (Cancelled)</span>`;
        } else {
          shiprocketColHtml = `
            <button onclick="shipOrderViaShiprocket(${o.id})" class="btn" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--secondary); color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:4px">
              <i class="fas fa-rocket"></i> Ship order
            </button>
            <button onclick="shipOrderManually(${o.id})" class="btn" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:#4b5563; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-top:4px">
              <i class="fas fa-edit"></i> Manual AWB
            </button>
            <button onclick="adminCancelOrder(${o.id})" class="btn" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--danger); color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-top:4px">
              <i class="fas fa-ban"></i> Cancel
            </button>
          `;
        }

        tbody.innerHTML += `
          <tr>
            <td><strong>#${o.id}</strong></td>
            <td>
              <strong>${o.customer_name}</strong><br>
              <span style="font-size:0.78rem; color:var(--text-light)">${o.customer_email}</span>
              ${o.return_reason ? `
                <div style="margin-top:6px; padding:4px 8px; background:#fff7ed; border-left:3px solid #ea580c; border-radius:3px; font-size:0.75rem; text-align:left; line-height:1.2">
                  <strong style="color:#ea580c">Return Request:</strong><br>
                  <strong>Reason:</strong> ${o.return_reason}<br>
                  <strong>Comments:</strong> ${o.return_comments || 'None'}
                </div>
              ` : ''}
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
                <option value="Return Requested" ${o.status === 'Return Requested' ? 'selected' : ''}>Return Requested</option>
                <option value="Return Approved" ${o.status === 'Return Approved' ? 'selected' : ''}>Return Approved</option>
                <option value="Return Rejected" ${o.status === 'Return Rejected' ? 'selected' : ''}>Return Rejected</option>
              </select>
            </td>
            <td>${shiprocketColHtml}</td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showToast('Failed to load orders', 'error');
  }
}

async function adminCancelOrder(orderId) {
  if (!confirm(`Are you sure you want to cancel Order #${orderId}? This will automatically restock the items.`)) return;
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'Cancelled' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Order cancelled and inventory restocked!', 'success');
      loadAdminOrders();
    } else {
      showToast(data.message || 'Failed to cancel order', 'error');
    }
  } catch (err) {
    showToast('Error cancelling order', 'error');
  }
}

async function shipOrderViaShiprocket(orderId) {
  if (!confirm(`Are you sure you want to create a Shiprocket shipment for Order #${orderId}?`)) {
    return;
  }

  showToast('Connecting to Shiprocket...', 'info');
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/ship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Shiprocket Order Created successfully!', 'success');
      loadAdminOrders();
    } else {
      showToast(data.message || 'Shiprocket creation failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to Shiprocket API', 'error');
  }
}

async function shipOrderManually(orderId) {
  const trackingNumber = prompt("Enter Courier Tracking Number (AWB):");
  if (!trackingNumber) {
    loadAdminOrders();
    return;
  }
  const trackingLink = prompt("Enter Tracking Link (Optional, leave blank for Delhivery auto-link):");
  
  try {
    showToast('Saving shipment details...', 'info');
    const res = await fetch(`/api/admin/orders/${orderId}/manual-ship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        tracking_number: trackingNumber.trim(),
        tracking_link: trackingLink ? trackingLink.trim() : `https://www.delhivery.com/track/package/${trackingNumber.trim()}`
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Order successfully marked as Shipped with Tracking AWB!', 'success');
      loadAdminOrders();
    } else {
      showToast(data.message || 'Manual shipment save failed', 'error');
      loadAdminOrders();
    }
  } catch (err) {
    showToast('Failed to save manual shipment details', 'error');
    loadAdminOrders();
  }
}

async function updateOrderStatus(orderId, newStatus) {
  if (newStatus === 'Shipped') {
    shipOrderManually(orderId);
    return;
  }
  
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
let allProducts = [];

async function loadAdminProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.success) {
      allProducts = data.products;
      const tbody = document.querySelector('#adminProductsTable tbody');
      tbody.innerHTML = '';

      data.products.forEach(p => {
        const image = JSON.parse(p.image_urls || '[]')[0] || '/images/products/placeholder.jpg';
        tbody.innerHTML += `
          <tr>
            <td><img src="${image}" style="width:40px; height:50px; object-fit:cover; border-radius:4px"></td>
            <td><strong>${p.name}</strong><br><span style="font-size:0.75rem; color:#888">${p.category} | ${p.subcategory}</span></td>
            <td><strong>₹${p.discount_price || p.price}</strong> ${p.discount_price ? `<br><span style="text-decoration:line-through; font-size:0.75rem; color:#999">₹${p.price}</span>` : ''}</td>
            <td>${p.stock} units</td>
            <td>${p.size_variants}</td>
            <td>
              <button onclick="openEditProductModal(${p.id})" class="btn" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--primary); color:#fff"><i class="fas fa-edit"></i></button>
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
  document.getElementById('prodReturnWindow').value = '7';
  document.getElementById('productAiPreviewArea').style.display = 'none';
  document.getElementById('productAiPrompt').value = '';
  document.getElementById('productModal').style.display = 'flex';
}

function openEditProductModal(id) {
  const product = allProducts.find(p => p.id === id);
  if (!product) return;
  
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
  document.getElementById('prodReturnWindow').value = product.return_window_days !== undefined ? product.return_window_days : '7';
  document.getElementById('prodDesc').value = product.description;
  
  const urls = JSON.parse(product.image_urls || '[]');
  document.getElementById('prodImageUrl').value = urls.length > 0 ? urls[0] : '';
  document.getElementById('productAiPreviewArea').style.display = 'none';
  document.getElementById('productAiPrompt').value = '';

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

/* ==========================================================================
   5. MARKETING AUDIENCE SEGMENTATION & SEO SITEMAPS
   ========================================================================== */

async function loadAudienceSegments() {
  try {
    const res = await fetch('/api/admin/segments', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.segments) {
      document.getElementById('segmentEthnic').textContent = `${data.segments.ethnicFans} users`;
      document.getElementById('segmentSpender').textContent = `${data.segments.highSpenders} users`;
      document.getElementById('segmentRepeat').textContent = `${data.segments.repeatBuyers} users`;
    }
  } catch (err) {
    console.error('Failed to load marketing segments:', err);
  }
}

async function generateSitemapSEO() {
  const alertBox = document.getElementById('seoAlertBox');
  alertBox.style.display = 'block';
  alertBox.style.color = 'var(--primary)';
  alertBox.textContent = 'Generating sitemap.xml...';

  try {
    const res = await fetch('/api/admin/seo-generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      alertBox.style.color = 'var(--success)';
      alertBox.textContent = '🎉 sitemap.xml & robots.txt updated in /public!';
      showToast('Sitemap compiled successfully!');
    } else {
      alertBox.style.color = 'var(--danger)';
      alertBox.textContent = 'Sitemap compilation failed.';
      showToast(data.message, 'error');
    }
  } catch (err) {
    alertBox.style.color = 'var(--danger)';
    alertBox.textContent = 'Connection error.';
    showToast('SEO Sitemap error', 'error');
  }
}

/* ==========================================================================
   6. DYNAMIC HOMEPAGE CONTENT & CAMPAIGN EDITORS
   ========================================================================== */

async function loadHomepageSettings() {
  try {
    const res = await fetch('/api/homepage-settings');
    const data = await res.json();
    if (data.success && data.settings) {
      const s = data.settings;
      document.getElementById('heroTitleInput').value = s.hero_title;
      document.getElementById('heroSubtitleInput').value = s.hero_subtitle || '';
      document.getElementById('heroMediaUrlInput').value = s.media_url || '';
      document.getElementById('heroMediaTypeInput').value = s.media_type || 'image';
      document.getElementById('heroFestivalInput').value = s.festival_mode || 'none';
    }
  } catch (err) {
    showToast('Failed to load homepage settings', 'error');
  }
}

async function handleHeroSubmit(e) {
  e.preventDefault();
  
  const formData = new FormData();
  formData.append('hero_title', document.getElementById('heroTitleInput').value.trim());
  formData.append('hero_subtitle', document.getElementById('heroSubtitleInput').value.trim());
  formData.append('media_url', document.getElementById('heroMediaUrlInput').value.trim());
  formData.append('media_type', document.getElementById('heroMediaTypeInput').value);
  formData.append('festival_mode', document.getElementById('heroFestivalInput').value);
  
  const heroFileInput = document.getElementById('heroFile');
  if (heroFileInput && heroFileInput.files[0]) {
    formData.append('image', heroFileInput.files[0]);
  }

  try {
    const res = await fetch('/api/homepage-settings', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('Homepage hero configuration updated!', 'success');
      // Reset file input
      if (heroFileInput) heroFileInput.value = '';
      loadHomepageSettings();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to update homepage settings', 'error');
  }
}

async function loadAdminPromotions() {
  try {
    const res = await fetch('/api/admin/promotions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const tbody = document.querySelector('#adminPromotionsTable tbody');
    tbody.innerHTML = '';

    if (data.success && data.promotions) {
      if (data.promotions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-light)">No active campaigns running.</td></tr>';
        return;
      }

      data.promotions.forEach(p => {
        const start = new Date(p.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const end = new Date(p.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        tbody.innerHTML += `
          <tr>
            <td><strong>${p.priority}</strong></td>
            <td>
              <strong>${p.title}</strong><br>
              <span style="font-size:0.75rem; color:#888">${p.subtitle || ''}</span>
            </td>
            <td>${start} - ${end}</td>
            <td><span style="padding:0.2rem 0.6rem; border-radius:4px; color:#fff; font-size:0.75rem; font-weight:700; background-color:${p.bg_color}">${p.bg_color}</span></td>
            <td>
              <button onclick="deletePromo(${p.id})" class="btn btn-accent" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--danger); color:#fff"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showToast('Error loading active campaigns', 'error');
  }
}

async function handlePromoSubmit(e) {
  e.preventDefault();
  
  const title = document.getElementById('promoTitle').value.trim();
  const subtitle = document.getElementById('promoSubtitle').value.trim();
  const bg_color = document.getElementById('promoBgColor').value.trim();
  const priority = parseInt(document.getElementById('promoPriority').value) || 0;
  const start_date = document.getElementById('promoStartDate').value;
  const end_date = document.getElementById('promoEndDate').value;
  const link_url = document.getElementById('promoLinkUrl').value.trim();
  const fileInput = document.getElementById('promoFile');
  const mediaUrlInput = document.getElementById('promoMediaUrl');

  const file = fileInput.files[0];
  const media_url = mediaUrlInput.value.trim();

  if (!file && !media_url) {
    showToast('Please upload an image file OR paste an image URL/path', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('subtitle', subtitle);
  formData.append('bg_color', bg_color);
  formData.append('priority', priority);
  formData.append('start_date', start_date);
  formData.append('end_date', end_date);
  formData.append('link_url', link_url);

  if (file) {
    formData.append('image', file);
  } else {
    formData.append('media_url', media_url);
  }

  try {
    showToast('Creating campaign banner...', 'info');
    const res = await fetch('/api/promotions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('Campaign launched successfully!', 'success');
      document.getElementById('promoCreateForm').reset();
      loadAdminPromotions();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to create promotion campaign', 'error');
  }
}

async function deletePromo(id) {
  if (!confirm('Are you sure you want to delete this promotion campaign?')) return;
  try {
    const res = await fetch(`/api/promotions/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Promotion deleted');
      loadAdminPromotions();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to delete campaign', 'error');
  }
}

/* ==========================================================================
   7. DIAGNOSTICS & SYSTEM ERROR LOGS
   ========================================================================== */

async function loadAdminErrors() {
  try {
    const res = await fetch('/api/admin/errors', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const tbody = document.querySelector('#adminErrorLogsTable tbody');
    tbody.innerHTML = '';

    if (data.success && data.logs) {
      if (data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--success); font-weight:700">✅ No system exceptions logged. All systems operational!</td></tr>';
        return;
      }

      data.logs.forEach(log => {
        const time = new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        tbody.innerHTML += `
          <tr>
            <td style="font-size:0.75rem">${time}</td>
            <td><code style="background:#eee; padding:2px 4px; border-radius:3px; font-size:0.8rem">${log.path || '/'}</code></td>
            <td><strong style="color:var(--danger); font-size:0.85rem">${log.message}</strong></td>
            <td><span style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:var(--danger)">${log.severity}</span></td>
            <td><div style="font-size:0.82rem; font-style:italic; color:#444">${log.suggested_fix || 'No solution cached.'}</div></td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showToast('Failed to load system diagnostics logs', 'error');
  }
}

/* ==========================================================================
   8. INTERACTIVE LOOKBOOK CATALOG MANAGER
   ========================================================================== */

async function loadAdminLookbook() {
  try {
    const res = await fetch('/api/lookbook');
    const data = await res.json();
    const grid = document.getElementById('lookbookPagesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (data.success && data.pages) {
      if (data.pages.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-light); grid-column:1/-1; text-align:center">No pages added to lookbook catalog yet. Add your first page using the form above.</p>';
        return;
      }

      data.pages.forEach((page, index) => {
        const isFirst = index === 0;
        const isLast = index === data.pages.length - 1;
        
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff; border:1px solid var(--border-color); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; box-shadow:var(--shadow-sm);';
        card.innerHTML = `
          <div style="height:180px; background-image:url(\'${page.image_url}\'); background-size:cover; background-position:center; background-color:#faf7f2; border-bottom:1px solid #eee"></div>
          <div style="padding:1rem; display:flex; flex-direction:column; gap:0.8rem; flex-grow:1; justify-content:space-between">
            <div>
              <strong style="color:var(--primary); font-size:0.95rem">Page ${page.page_number}</strong>
              <div style="font-size:0.75rem; color:var(--text-light); text-overflow:ellipsis; overflow:hidden; white-space:nowrap" title="${page.image_url}">${page.image_url}</div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:0.4rem">
              <div style="display:flex; gap:0.4rem">
                <button class="btn btn-accent" style="flex:1; padding:0.4rem !important; font-size:0.75rem !important; cursor:pointer" onclick="reorderLookbook(${page.page_number}, \'up\')" ${isFirst ? 'disabled style="opacity:0.5"' : ''} title="Move page up"><i class="fas fa-arrow-up"></i> Up</button>
                <button class="btn btn-accent" style="flex:1; padding:0.4rem !important; font-size:0.75rem !important; cursor:pointer" onclick="reorderLookbook(${page.page_number}, \'down\')" ${isLast ? 'disabled style="opacity:0.5"' : ''} title="Move page down"><i class="fas fa-arrow-down"></i> Down</button>
              </div>
              <button class="btn btn-danger" style="width:100%; padding:0.4rem !important; font-size:0.75rem !important; cursor:pointer" onclick="deleteLookbookPage(${page.page_number})"><i class="fas fa-trash-alt"></i> Delete Page</button>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
    }
  } catch (err) {
    showToast('Failed to load lookbook catalogue pages', 'error');
  }
}

// Upload/Update a page handler
document.addEventListener('DOMContentLoaded', () => {
  const uploadForm = document.getElementById('lookbookUploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const pageNumInput = document.getElementById('lookbookPageNum');
      const fileInput = document.getElementById('lookbookFile');
      
      const pageNumber = pageNumInput.value;
      const file = fileInput.files[0];
      
      if (!pageNumber || !file) {
        showToast('Please fill all required upload fields', 'warning');
        return;
      }
      
      const formData = new FormData();
      formData.append('page_number', pageNumber);
      formData.append('image', file);
      
      try {
        showToast('Uploading lookbook catalog page...', 'info');
        const res = await fetch('/api/admin/lookbook/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          uploadForm.reset();
          loadAdminLookbook();
        } else {
          showToast(data.message || 'Failed to upload lookbook page', 'error');
        }
      } catch (err) {
        showToast('Error uploading lookbook page', 'error');
      }
    });
  }
});

async function reorderLookbook(pageNumber, direction) {
  try {
    const res = await fetch('/api/admin/lookbook/reorder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_number: pageNumber, direction })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminLookbook();
    } else {
      showToast(data.message || 'Failed to reorder page', 'error');
    }
  } catch (err) {
    showToast('Error reordering lookbook page', 'error');
  }
}

async function deleteLookbookPage(pageNumber) {
  if (!confirm(`Are you sure you want to delete Lookbook Page ${pageNumber}? Subsequent pages will automatically shift left.`)) {
    return;
  }
  
  try {
    const res = await fetch('/api/admin/lookbook/delete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ page_number: pageNumber })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Page deleted', 'success');
      loadAdminLookbook();
    } else {
      showToast(data.message || 'Failed to delete page', 'error');
    }
  } catch (err) {
    showToast('Error deleting lookbook page', 'error');
  }
}

function prefillPromoDates() {
  const startDateInput = document.getElementById('promoStartDate');
  const endDateInput = document.getElementById('promoEndDate');
  if (startDateInput && endDateInput && !startDateInput.value) {
    const now = new Date();
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now - tzoffset)).toISOString().slice(0, 16);
    startDateInput.value = localISOTime;

    // Set end date to 30 days in future
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const localFutureTime = (new Date(future - tzoffset)).toISOString().slice(0, 16);
    endDateInput.value = localFutureTime;
  }
}

async function loadAdminCoupons() {
  try {
    const res = await fetch('/api/coupons');
    const data = await res.json();
    const tbody = document.querySelector('#adminCouponsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.success && data.coupons) {
      if (data.coupons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-light)">No coupon codes created yet.</td></tr>';
        return;
      }

      data.coupons.forEach(c => {
        let discountText = '';
        if (c.discount_type === 'percentage') {
          discountText = `${Math.round(c.discount_value)}%`;
        } else {
          discountText = `₹${Math.round(c.discount_value)}`;
        }

        tbody.innerHTML += `
          <tr>
            <td><strong>${c.code}</strong></td>
            <td>${discountText}</td>
            <td style="font-size:0.8rem">${c.description || ''}</td>
            <td><span style="padding:0.2rem 0.5rem; background:#e1e1e1; font-weight:700; border-radius:4px; font-size:0.75rem">${c.tag}</span></td>
            <td>
              <button onclick="deleteCoupon(${c.id})" class="btn btn-accent" style="padding:0.3rem 0.6rem; font-size:0.75rem; background:var(--danger); color:#fff"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    showToast('Error loading coupons list', 'error');
  }
}

async function handleCouponSubmit(e) {
  e.preventDefault();

  const code = document.getElementById('couponCode').value.trim();
  const discount_type = document.getElementById('couponDiscountType').value;
  const discount_value = parseFloat(document.getElementById('couponDiscountValue').value);
  const description = document.getElementById('couponDescription').value.trim();
  const tag = document.getElementById('couponTag').value.trim();

  if (!code || isNaN(discount_value) || discount_value <= 0) {
    showToast('Please enter valid coupon details', 'error');
    return;
  }

  try {
    const res = await fetch('/api/coupons', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ code, discount_type, discount_value, description, tag })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Coupon code created successfully!', 'success');
      document.getElementById('couponCreateForm').reset();
      loadAdminCoupons();
    } else {
      showToast(data.message || 'Failed to create coupon', 'error');
    }
  } catch (err) {
    showToast('Error saving coupon code', 'error');
  }
}

async function deleteCoupon(id) {
  if (!confirm('Are you sure you want to delete this coupon code? Customers will no longer be able to apply it.')) return;
  try {
    const res = await fetch(`/api/coupons/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Coupon code deleted');
      loadAdminCoupons();
    } else {
      showToast(data.message || 'Failed to delete coupon', 'error');
    }
  } catch (err) {
    showToast('Error deleting coupon code', 'error');
  }
}

/* ==========================================================================
   9. SHIPPING & DELIVERY SETTINGS
   ========================================================================== */
async function loadAdminShippingSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      document.getElementById('settingShippingFee').value = data.settings.shipping_fee || '60';
      document.getElementById('settingFreeThreshold').value = data.settings.free_shipping_threshold || '999';
    } else {
      showToast(data.message || 'Failed to load shipping settings', 'error');
    }
  } catch (err) {
    showToast('Error connecting to settings API', 'error');
  }

  // Load Shiprocket configurations
  try {
    const res = await fetch('/api/admin/shiprocket-config', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('shiprocketEmail').value = data.email || '';
      document.getElementById('shiprocketPickup').value = data.pickup_location || 'Primary';
      document.getElementById('shiprocketPassword').value = ''; // keep blank for security
    }
  } catch (err) {
    console.error('Failed to load Shiprocket settings:', err);
  }
}

async function saveShippingSettings(e) {
  e.preventDefault();
  const shipping_fee = parseFloat(document.getElementById('settingShippingFee').value);
  const free_shipping_threshold = parseFloat(document.getElementById('settingFreeThreshold').value);

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ shipping_fee, free_shipping_threshold })
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Shipping settings saved successfully!', 'success');
      localStorage.setItem('l2l_settings', JSON.stringify({ shipping_fee, free_shipping_threshold }));
      if (window.systemSettings) {
        window.systemSettings.shipping_fee = shipping_fee;
        window.systemSettings.free_shipping_threshold = free_shipping_threshold;
      }
    } else {
      showToast(data.message || 'Failed to save shipping settings', 'error');
    }
  } catch (err) {
    showToast('Error saving shipping settings', 'error');
  }
}

async function saveShiprocketSettings(e) {
  e.preventDefault();
  const email = document.getElementById('shiprocketEmail').value;
  const password = document.getElementById('shiprocketPassword').value;
  const pickup_location = document.getElementById('shiprocketPickup').value;

  try {
    showToast('Verifying connection with Shiprocket API...', 'info');
    const res = await fetch('/api/admin/shiprocket-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ email, password, pickup_location })
    });
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Shiprocket Configured and Connected successfully!', 'success');
      document.getElementById('shiprocketPassword').value = ''; // clear input
      loadAdminShippingSettings();
    } else {
      showToast(data.message || 'Connection failed', 'error');
    }
  } catch (err) {
    showToast('Error saving Shiprocket settings', 'error');
  }
}

async function handleAdminPasswordChange(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('adminOldPassword').value;
  const newPassword = document.getElementById('adminNewPassword').value;
  const confirmPassword = document.getElementById('adminConfirmPassword').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    
    const data = await res.json();
    if (data.success) {
      showToast('🎉 Admin password updated successfully!', 'success');
      document.getElementById('changePasswordForm').reset();
    } else {
      showToast(data.message || 'Failed to update password', 'error');
    }
  } catch (err) {
    showToast('Error updating password', 'error');
  }
}

// Generate banner/product image via Pollinations.ai API
function generateBannerImage(type) {
  let promptId, previewAreaId, previewImgId, targetInputId;
  
  if (type === 'hero') {
    promptId = 'heroAiPrompt';
    previewAreaId = 'heroAiPreviewArea';
    previewImgId = 'heroAiPreview';
    targetInputId = 'heroMediaUrlInput';
  } else if (type === 'promo') {
    promptId = 'promoAiPrompt';
    previewAreaId = 'promoAiPreviewArea';
    previewImgId = 'promoAiPreview';
    targetInputId = 'promoMediaUrl';
  } else if (type === 'product') {
    promptId = 'productAiPrompt';
    previewAreaId = 'productAiPreviewArea';
    previewImgId = 'productAiPreview';
    targetInputId = 'prodImageUrl';
  }

  const promptInput = document.getElementById(promptId);
  const prompt = promptInput ? promptInput.value.trim() : '';

  if (!prompt) {
    showToast('Please type a descriptive prompt first!', 'warning');
    return;
  }

  showToast('Generating AI Image... please wait a few seconds.', 'info');
  
  const previewArea = document.getElementById(previewAreaId);
  const previewImg = document.getElementById(previewImgId);
  const targetInput = document.getElementById(targetInputId);
  
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true&seed=${seed}`;

  if (previewImg && previewArea) {
    previewImg.src = url;
    previewArea.style.display = 'block';
    
    // Assign instantly so the admin doesn't have to wait for preview download to click save
    if (targetInput) {
      targetInput.value = url;
    }
    
    previewImg.onload = () => {
      showToast('🎉 AI Image successfully generated and applied!', 'success');
    };
  }
}

// Danger: Reset all sales, orders, reviews, inquiries, and customer accounts (except admin)
async function triggerCompleteStoreReset() {
  const confirm1 = confirm("⚠️ DANGER: Are you absolutely sure you want to delete all orders, transaction history, wishlist items, support inquiries, and customer accounts? This will reset all analytics charts to 0!");
  if (!confirm1) return;

  const confirm2 = prompt("To verify, please type 'RESET ALL DATA' in all caps:");
  if (confirm2 !== 'RESET ALL DATA') {
    showToast('Reset cancelled. Verification text did not match.', 'warning');
    return;
  }

  showToast('Cleaning up database tables...', 'info');

  try {
    const res = await fetch('/api/admin/reset-all-data', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (data.success) {
      showToast('🎉 ' + data.message, 'success');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      showToast(data.message || 'Reset failed', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to reset API', 'error');
  }
}

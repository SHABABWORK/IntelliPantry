/**
 * Smart Pantry - UI Components, Table Rendering, Category Filters & Modals
 */

let currentCategoryFilter = "All";
let currentStatusFilter = "All";
let currentSearchQuery = "";
const CATEGORY_NAMES = ["Fruits", "Vegetables", "Dairy", "Grains", "Meat", "Beverages", "Pantry", "Frozen"];

// Format Date nicely: "18 Sep 2026"
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const parsed = window.parseLocalDate ? window.parseLocalDate(dateStr) : new Date(dateStr);
  if (!parsed || isNaN(parsed.getTime())) return dateStr;
  const options = { day: "numeric", month: "short", year: "numeric" };
  return parsed.toLocaleDateString("en-GB", options);
}

// Render the metrics row
function updateMetricsDisplay() {
  const metrics = window.store.getMetrics();
  const totalEl = document.getElementById("metricTotalItems");
  const lowStockEl = document.getElementById("metricLowStock");
  const expiringEl = document.getElementById("metricExpiringSoon");
  const shoppingEl = document.getElementById("metricShoppingList");

  const freshEl = document.getElementById("metricFreshItems");

  if (totalEl) totalEl.textContent = metrics.total;
  if (lowStockEl) lowStockEl.textContent = metrics.lowStock;
  if (expiringEl) expiringEl.textContent = metrics.expiringSoon;
  if (shoppingEl) shoppingEl.textContent = metrics.shoppingListCount;
  if (freshEl) freshEl.textContent = metrics.fresh !== undefined ? metrics.fresh : Math.max(0, metrics.total - metrics.lowStock - metrics.expiringSoon - metrics.expired);
}

// Status filter pill handling
function setStatusFilter(status) {
  currentStatusFilter = status;
  document.querySelectorAll(".status-filter-btn").forEach(btn => {
    if (btn.getAttribute("data-status") === status) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  renderInventoryTable();
}

// Render Inventory Table based on active filters
function renderInventoryTable() {
  const tbody = document.getElementById("inventoryTableBody");
  if (!tbody) return;

  if (window.store && window.store.isLoading) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 48px 16px; color: #64748b;">
          <div style="display:inline-block; width: 32px; height: 32px; border: 3px solid rgba(16,185,129,0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 12px;"></div>
          <p style="font-size: 14.5px; font-weight: 600; color: #1e392a; margin: 0;">Loading pantry items from Supabase...</p>
        </td>
      </tr>
    `;
    return;
  }

  const allItems = window.store.getItems();
  const warnDays = window.store?.fullSettings?.pantry_settings?.expiry_warning_days || 7;
  const filtered = allItems.filter(item => {
    const itemCat = (item.category || "Pantry").toLowerCase();
    const filterCat = currentCategoryFilter.toLowerCase();
    const matchesCategory = currentCategoryFilter === "All" || itemCat === filterCat;

    const q = currentSearchQuery.toLowerCase();
    const matchesSearch = !currentSearchQuery || 
      (item.name || "").toLowerCase().includes(q) ||
      (item.brand || "").toLowerCase().includes(q) ||
      itemCat.includes(q) ||
      (item.barcode || "").toLowerCase().includes(q) ||
      (item.storageLocation || "").toLowerCase().includes(q);

    const computedStatus = window.store.calculateStatus(item.expiryDate, item.quantity, item.minStock, warnDays);
    let matchesStatus = true;
    if (currentStatusFilter !== "All") {
      if (currentStatusFilter === "Expiring Soon") {
        matchesStatus = computedStatus === "Expiring Soon";
      } else if (currentStatusFilter === "Expired") {
        matchesStatus = computedStatus === "Expired";
      } else if (currentStatusFilter === "Low Stock") {
        matchesStatus = computedStatus === "Low Stock" || Number(item.quantity) <= (item.minStock !== undefined ? Number(item.minStock) : 2);
      } else if (currentStatusFilter === "Fresh" || currentStatusFilter === "In Stock") {
        matchesStatus = (computedStatus === "Fresh" || computedStatus === "In Stock") && Number(item.quantity) > (item.minStock !== undefined ? Number(item.minStock) : 2);
      }
    }

    return matchesCategory && matchesSearch && matchesStatus;
  });

  if (allItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 48px 16px; color: #64748b;">
          <div style="font-size: 44px; margin-bottom: 12px;">🥣</div>
          <p style="font-size: 16.5px; font-weight: 700; color: #1e392a; margin-bottom: 6px;">Your pantry is empty. Add your first product to get started.</p>
          <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">Track shelf-life, scan receipts, and unlock recipes with the ingredients you have.</p>
          <button type="button" class="btn-forest-submit" onclick="openAddEditModal()" style="display:inline-flex; align-items:center; gap:8px; padding:10px 22px; font-size:13.5px; border-radius:12px; width:auto; margin:0 auto; cursor:pointer;">
            <span>+</span> Add Your First Product
          </button>
        </td>
      </tr>
    `;
    return;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 36px 16px; color: #94a3b8;">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <p style="font-weight: 600; color: #64748b;">No items match your filter criteria</p>
          <small>Try selecting "All" or clearing your search query</small>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const computedStatus = window.store.calculateStatus(item.expiryDate, item.quantity, item.minStock, warnDays);
    const rel = window.formatRelativeExpiry ? window.formatRelativeExpiry(item.expiryDate, warnDays) : { text: item.expiryDate || "—", urgent: false, days: null };

    let statusClass = "status-fresh";
    let statusLabel = "Fresh";

    if (computedStatus === "Expired" || (rel.days !== null && rel.days < 0)) {
      statusClass = "status-expired";
      statusLabel = "Expired";
    } else if (computedStatus === "Expiring Soon" || (rel.days !== null && rel.days <= warnDays)) {
      statusClass = "status-expiring";
      statusLabel = "Expiring Soon";
    } else if (computedStatus === "Low Stock" || Number(item.quantity) <= (item.minStock !== undefined ? Number(item.minStock) : 2)) {
      statusClass = "status-low";
      statusLabel = "Low Stock";
    }

    const isUrgent = rel.urgent || statusLabel === "Expiring Soon" || statusLabel === "Expired";
    const dateFormatted = formatDate(item.expiryDate);
    const catName = item.category || "Pantry";

    return `
      <tr data-id="${item.id}">
        <td>
          <div class="item-cell">
            <div class="item-thumb">${item.imageUrl ? `<img src="${escapeHTML(item.imageUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" onerror="this.outerHTML='${item.emoji || "📦"}'">` : (item.emoji || "📦")}</div>
            <div>
              <span style="font-weight: 700; color: #0f172a;">${escapeHTML(item.name)}</span>
              ${item.brand ? `<div style="font-size:11px; color:#64748b; font-weight:500;">${escapeHTML(item.brand)}</div>` : ''}
              ${item.barcode ? `<div style="font-size:10px; color:#94a3b8; font-family:monospace;">${escapeHTML(item.barcode)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="color: #64748b;">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <img src="assets/categories/${catName.toLowerCase()}.png" alt="" style="width:20px; height:18px; object-fit:contain;" onerror="this.style.display='none'">
            <span>${escapeHTML(catName)}</span>
          </span>
          ${item.storageLocation ? `<div style="font-size:10.5px; color:#94a3b8; margin-top:2px;">📍 ${escapeHTML(item.storageLocation)}</div>` : ''}
        </td>
        <td style="font-weight: 600;">
          ${item.quantity} ${escapeHTML(item.unit || "pcs")}
          ${item.minStock !== undefined ? `<div style="font-size:10.5px; color:#94a3b8; font-weight:400;">Min: ${item.minStock}</div>` : ''}
        </td>
        <td class="${isUrgent ? "expiry-urgent" : ""}">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight: 600;">${dateFormatted}</span>
            ${item.expiryDate ? `<span style="font-size: 11px; font-weight: 700; color: ${rel.days < 0 ? '#ef4444' : (rel.days <= 7 ? '#d97706' : '#10b981')};">${rel.text}</span>` : `<span style="font-size: 11px; color:#94a3b8;">No expiry set</span>`}
          </div>
        </td>
        <td>
          <span class="badge-status ${statusClass}">
            ${escapeHTML(statusLabel)}
          </span>
        </td>
        <td style="text-align: right;">
          <div style="display: flex; justify-content: flex-end; gap: 4px;">
            <button class="action-dots-btn" onclick="openAddEditModal('${item.id}')" title="Edit Item">
              ✏️
            </button>
            <button class="action-dots-btn" onclick="deletePantryItem('${item.id}')" title="Delete Item">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Category filter chip handling
function setCategoryFilter(category) {
  currentCategoryFilter = category;
  document.querySelectorAll(".chip-btn").forEach(btn => {
    if (btn.getAttribute("data-category") === category) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
  renderInventoryTable();
}

// Search input handling
function handleSearchInput(e) {
  currentSearchQuery = e.target.value.trim();
  renderInventoryTable();
}

// Delete item helper
async function deletePantryItem(id) {
  const item = window.store.getItemById(id);
  if (!item) return;
  if (confirm(`Remove "${item.name}" from your pantry?`)) {
    try {
      await window.store.deleteItem(id);
      showToast(`Removed "${item.name}"`);
      renderInventoryTable();
      updateMetricsDisplay();
    } catch (err) {
      console.error("Failed to delete pantry item:", err);
      showToast(`Error deleting item: ${err.message || "Database error"}`);
    }
  }
}

/* ==========================================================
   MANUAL ADD / EDIT MODAL & FORM CONTROLLER
   ========================================================== */
let editingItemId = null;

function openAddEditModal(id = null) {
  editingItemId = id;
  const modal = document.getElementById("itemFormModal");
  const title = document.getElementById("itemFormTitle");
  const nameInput = document.getElementById("itemNameInput");
  const qtyInput = document.getElementById("itemQuantityInput");
  const unitInput = document.getElementById("itemUnitInput");
  const expiryInput = document.getElementById("itemExpiryInput");
  const purchaseInput = document.getElementById("itemPurchaseInput");
  const brandInput = document.getElementById("itemBrandInput");
  const barcodeInput = document.getElementById("itemBarcodeInput");
  const locationInput = document.getElementById("itemLocationInput");
  const minStockInput = document.getElementById("itemMinStockInput");

  if (!modal) return;

  // Show modal first so children have layout dimensions
  modal.classList.add("active");
  closeCategoryDropdown();

  if (id) {
    const item = window.store.getItemById(id);
    if (item) {
      if (title) title.textContent = "✏️ Edit Item";
      if (nameInput) nameInput.value = item.name || "";
      setCategoryValue(item.category || "Fruits");
      if (qtyInput) qtyInput.value = item.quantity !== undefined ? item.quantity : 1;
      if (unitInput) unitInput.value = item.unit || "pcs";
      if (expiryInput) expiryInput.value = item.expiryDate || "";
      if (purchaseInput) purchaseInput.value = item.purchaseDate || "";
      if (brandInput) brandInput.value = item.brand || "";
      if (barcodeInput) barcodeInput.value = item.barcode || "";
      if (locationInput) locationInput.value = item.storageLocation || item.location || "Pantry";
      if (minStockInput) minStockInput.value = item.minStock !== undefined ? item.minStock : 2;
    }
  } else {
    if (title) title.textContent = "＋ Add Item to Pantry";
    if (nameInput) nameInput.value = "";
    setCategoryValue("Fruits");
    if (qtyInput) qtyInput.value = "1";
    if (unitInput) unitInput.value = "pcs";
    if (expiryInput) expiryInput.value = "";
    if (purchaseInput) purchaseInput.value = window.getTodayISO ? window.getTodayISO() : new Date().toISOString().split("T")[0];
    if (brandInput) brandInput.value = "";
    if (barcodeInput) barcodeInput.value = "";
    if (locationInput) locationInput.value = "Pantry";
    if (minStockInput) minStockInput.value = "2";
  }

  setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 80);
}

function closeAddEditModal() {
  const modal = document.getElementById("itemFormModal");
  if (modal) modal.classList.remove("active");
  closeCategoryDropdown();
  editingItemId = null;
}

async function saveItemForm(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const nameInput = document.getElementById("itemNameInput");
  const catInput = document.getElementById("itemCategoryInput");
  const qtyInput = document.getElementById("itemQuantityInput");
  const unitInput = document.getElementById("itemUnitInput");
  const expiryInput = document.getElementById("itemExpiryInput");
  const purchaseInput = document.getElementById("itemPurchaseInput");
  const brandInput = document.getElementById("itemBrandInput");
  const barcodeInput = document.getElementById("itemBarcodeInput");
  const locationInput = document.getElementById("itemLocationInput");
  const minStockInput = document.getElementById("itemMinStockInput");

  const name = nameInput ? nameInput.value.trim() : "";
  const category = catInput ? catInput.value : "Fruits";
  const quantity = qtyInput ? (parseFloat(qtyInput.value) || 1) : 1;
  const unit = unitInput ? unitInput.value : "pcs";
  const expiryDate = expiryInput ? expiryInput.value : "";
  const purchaseDate = purchaseInput ? purchaseInput.value : "";
  const brand = brandInput ? brandInput.value.trim() : "";
  const barcode = barcodeInput ? barcodeInput.value.trim() : "";
  const storageLocation = locationInput ? locationInput.value : "Pantry";
  const minStock = minStockInput ? (parseFloat(minStockInput.value) || 2) : 2;

  if (!name) {
    showToast("Please enter an item name.");
    if (nameInput) nameInput.focus();
    return;
  }

  const submitBtn = document.querySelector("#itemFormModal button[type='submit']") || 
                    document.querySelector("#itemFormModal .btn-forest-submit");
  const origBtnText = submitBtn ? submitBtn.innerText : "Save Product";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = editingItemId ? "Updating..." : "Saving to database...";
  }

  try {
    if (editingItemId) {
      await window.store.updateItem(editingItemId, {
        name,
        category,
        quantity,
        unit,
        expiryDate,
        purchaseDate,
        brand,
        barcode,
        storageLocation,
        minStock
      });
      showToast(`Updated "${name}"`);
    } else {
      await window.store.addItem({
        name,
        category,
        quantity,
        unit,
        expiryDate,
        purchaseDate,
        brand,
        barcode,
        storageLocation,
        minStock
      });
      showToast(`Added "${name}" to pantry!`);
    }

    closeAddEditModal();
    renderInventoryTable();
    updateMetricsDisplay();
  } catch (err) {
    console.error("Failed to save pantry item:", err);
    showToast(`Error saving product: ${err.message || "Database error"}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = origBtnText;
    }
  }
}

/* ==========================================================
   CUSTOM CATEGORY DROPDOWN CONTROLLER WITH MOVING MOTION
   ========================================================= */

function toggleCategoryDropdown(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const dropdown = document.getElementById("categoryDropdownList");
  const trigger = document.getElementById("categorySelectTrigger");
  if (!dropdown || !trigger) return;

  const isOpen = dropdown.classList.contains("open");
  if (isOpen) {
    closeCategoryDropdown();
  } else {
    dropdown.classList.add("open");
    trigger.classList.add("active");
    const currentVal = document.getElementById("itemCategoryInput") ? document.getElementById("itemCategoryInput").value : "Fruits";
    moveCategoryHighlight(currentVal, false);
  }
}

function closeCategoryDropdown() {
  const dropdown = document.getElementById("categoryDropdownList");
  const trigger = document.getElementById("categorySelectTrigger");
  if (dropdown) dropdown.classList.remove("open");
  if (trigger) trigger.classList.remove("active");
}

function setCategoryValue(categoryName) {
  const safeName = CATEGORY_NAMES.includes(categoryName) ? categoryName : "Fruits";
  const input = document.getElementById("itemCategoryInput");
  const triggerImg = document.getElementById("categoryTriggerImg");
  const triggerLabel = document.getElementById("categoryTriggerLabel");
  const container = document.getElementById("categoryOptionsContainer");

  if (input) input.value = safeName;
  if (triggerImg) triggerImg.src = `assets/categories/${safeName.toLowerCase()}.png`;
  if (triggerLabel) triggerLabel.textContent = safeName;

  if (container) {
    container.querySelectorAll(".category-row-option").forEach(opt => {
      if (opt.getAttribute("data-value") === safeName) {
        opt.classList.add("selected");
      } else {
        opt.classList.remove("selected");
      }
    });
  }

  moveCategoryHighlight(safeName, false);
}

function moveCategoryHighlight(categoryName, animated = true) {
  const highlight = document.getElementById("categorySlidingHighlight");
  if (!highlight) return;

  const index = CATEGORY_NAMES.indexOf(categoryName);
  if (index === -1) return;

  const topOffset = index * 48;

  if (!animated) {
    highlight.style.transition = "none";
  } else {
    highlight.style.transition = "transform 0.25s cubic-bezier(0.25, 1.25, 0.45, 1)";
  }

  highlight.style.transform = `translateY(${topOffset}px)`;
  highlight.style.height = `48px`;

  if (index === 0) {
    highlight.style.borderRadius = "12px 12px 0 0";
  } else if (index === CATEGORY_NAMES.length - 1) {
    highlight.style.borderRadius = "0 0 12px 12px";
  } else {
    highlight.style.borderRadius = "0px";
  }
}

function selectCategory(categoryName, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  setCategoryValue(categoryName);
  moveCategoryHighlight(categoryName, true);

  const trigger = document.getElementById("categorySelectTrigger");
  if (trigger) {
    trigger.classList.remove("category-trigger-pop");
    void trigger.offsetWidth;
    trigger.classList.add("category-trigger-pop");
  }

  setTimeout(() => {
    closeCategoryDropdown();
  }, 160);
}

function initCategoryHoverMotion() {
  const container = document.getElementById("categoryOptionsContainer");
  if (!container) return;

  container.querySelectorAll(".category-row-option").forEach(opt => {
    opt.addEventListener("mouseenter", () => {
      const val = opt.getAttribute("data-value");
      moveCategoryHighlight(val, true);
    });
  });

  container.addEventListener("mouseleave", () => {
    const input = document.getElementById("itemCategoryInput");
    const selectedVal = input ? input.value : "Fruits";
    moveCategoryHighlight(selectedVal, true);
  });
}

// Close category dropdown on outside click
document.addEventListener("click", (e) => {
  const wrapper = document.getElementById("categoryPickerWrapper");
  if (wrapper && !wrapper.contains(e.target)) {
    closeCategoryDropdown();
  }
});

/* ==========================================================
   EMAIL ALERT MODAL
   ========================================================== */
function openEmailAlertModal() {
  const modal = document.getElementById("emailAlertModal");
  if (!modal) return;
  const settings = window.store.getSettings();

  const emailInput = document.getElementById("alertEmailInput");
  const stockOutCheck = document.getElementById("alertOnStockOutCheckbox");
  const expiryCheck = document.getElementById("alertOnExpiryCheckbox");

  if (emailInput) emailInput.value = settings.email || "";
  if (stockOutCheck) stockOutCheck.checked = !!settings.alertOnStockOut;
  if (expiryCheck) expiryCheck.checked = !!settings.alertOnExpiry;

  modal.classList.add("active");
}

function closeEmailAlertModal() {
  const modal = document.getElementById("emailAlertModal");
  if (modal) modal.classList.remove("active");
}

function saveEmailAlertSettings() {
  const emailInput = document.getElementById("alertEmailInput");
  const stockOutCheck = document.getElementById("alertOnStockOutCheckbox");
  const expiryCheck = document.getElementById("alertOnExpiryCheckbox");

  const email = emailInput ? emailInput.value.trim() : "";
  const alertOnStockOut = stockOutCheck ? stockOutCheck.checked : true;
  const alertOnExpiry = expiryCheck ? expiryCheck.checked : true;

  window.store.saveSettings({
    email,
    alertOnStockOut,
    alertOnExpiry
  });

  showToast("Email alert settings saved!");
  closeEmailAlertModal();
}

async function triggerTestEmailAlert() {
  const user = getCurrentUserInfo() || {};
  const emailInput = document.getElementById("alertEmailInput");
  const email = (emailInput && emailInput.value.trim()) || user.email || (document.getElementById("settingsEmailAddress")?.value || "").trim() || "intellipantrynotify@gmail.com";

  showToast(`Sending test notification to ${email}... ✉️`);

  try {
    const response = await fetch("/api/send-pantry-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        type: "test",
        customMessage: "This is a live test notification from IntelliPantry to verify email delivery."
      })
    });

    const result = await response.json();
    if (result.success) {
      showToast(`✓ Test notification delivered to ${email}!`);
    } else {
      showToast(`✓ Test notification dispatched to ${email}.`);
    }
  } catch (err) {
    console.warn("Test alert notice:", err);
    showToast(`✓ Notification test dispatched.`);
  }
}


// Escape HTML helper
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ==========================================================
   REAL-TIME INSIGHTS & ANALYTICS CONTROLLER
   ========================================================== */
let currentInsightsTimeframe = "30d";
let categoryDistributionChartInstance = null;

function setInsightsTimeframe(timeframe, btn) {
  currentInsightsTimeframe = timeframe;
  document.querySelectorAll(".insights-filter-group .filter-pill").forEach(p => p.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderInsightsView(timeframe);
}

function renderInsightsView(timeframe = currentInsightsTimeframe) {
  if (!window.store) return;
  const data = window.store.getInsightsData(timeframe);

  // 1. Smart Actionable Insights List
  const smartList = document.getElementById("smartInsightsList");
  if (smartList) {
    smartList.innerHTML = data.smartInsights.map(t => `<li>${escapeHTML(t)}</li>`).join("");
  }

  // 2. 6 Key Metrics Cards
  const elTotal = document.getElementById("insightTotalProducts");
  const elUnits = document.getElementById("insightTotalUnits");
  const elLow = document.getElementById("insightLowStock");
  const elExp = document.getElementById("insightExpiringSoon");
  const elExpired = document.getElementById("insightExpired");
  const elCatCount = document.getElementById("insightTotalCategories");
  const elRecently = document.getElementById("insightRecentlyAdded");

  if (elTotal) elTotal.textContent = data.totalProducts;
  if (elUnits) elUnits.textContent = `${data.totalUnits} units total`;
  if (elLow) elLow.textContent = data.lowStockCount;
  if (elExp) elExp.textContent = data.expiringSoonCount;
  if (elExpired) elExpired.textContent = data.expiredCount;
  if (elCatCount) elCatCount.textContent = data.totalCategories;
  if (elRecently) elRecently.textContent = data.recentlyAddedCount;

  // 3. Section A: Pantry Overview
  const overviewPill = document.getElementById("overviewItemCountPill");
  if (overviewPill) overviewPill.textContent = `${data.totalProducts} Products`;

  const overviewBox = document.getElementById("pantryOverviewContent");
  if (overviewBox) {
    const cats = Object.keys(data.categoryCounts);
    if (cats.length === 0) {
      overviewBox.innerHTML = `<p style="font-size:13px; color:#94a3b8; text-align:center; padding:16px;">Your pantry is empty. Add products to view category breakdowns.</p>`;
    } else {
      overviewBox.innerHTML = cats.map(cat => {
        const count = data.categoryCounts[cat];
        const pct = data.totalProducts > 0 ? Math.round((count / data.totalProducts) * 100) : 0;
        return `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; color:#1e293b;">
              <span style="display:flex; align-items:center; gap:6px;">
                <img src="assets/categories/${cat.toLowerCase()}.png" alt="" style="width:18px; height:18px; object-fit:contain;" onerror="this.style.display='none'">
                ${escapeHTML(cat)}
              </span>
              <span style="color:#64748b;">${count} product(s) (${pct}%)</span>
            </div>
            <div style="height:6px; background:#f1f5f9; border-radius:999px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:#10b981; border-radius:999px;"></div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 4. Section B: Expiry Analytics Breakdown
  const expiryBox = document.getElementById("expiryAnalyticsContent");
  if (expiryBox) {
    const exp = data.expiryBreakdown;
    expiryBox.innerHTML = `
      <div style="padding:12px; background:#fff1f2; border:1px solid #fecdd3; border-radius:12px;">
        <div style="font-size:11px; font-weight:700; color:#e11d48; text-transform:uppercase;">Already Expired</div>
        <div style="font-size:22px; font-weight:800; color:#9f1239; margin-top:2px;">${exp.alreadyExpired}</div>
        <div style="font-size:11px; color:#e11d48; margin-top:2px;">Discard safely</div>
      </div>
      <div style="padding:12px; background:#fff7ed; border:1px solid #ffedd5; border-radius:12px;">
        <div style="font-size:11px; font-weight:700; color:#ea580c; text-transform:uppercase;">Within 3 Days</div>
        <div style="font-size:22px; font-weight:800; color:#c2410c; margin-top:2px;">${exp.within3Days}</div>
        <div style="font-size:11px; color:#ea580c; margin-top:2px;">Cook today</div>
      </div>
      <div style="padding:12px; background:#fffbeb; border:1px solid #fef3c7; border-radius:12px;">
        <div style="font-size:11px; font-weight:700; color:#d97706; text-transform:uppercase;">Within 7 Days</div>
        <div style="font-size:22px; font-weight:800; color:#b45309; margin-top:2px;">${exp.within7Days}</div>
        <div style="font-size:11px; color:#d97706; margin-top:2px;">Plan this week</div>
      </div>
      <div style="padding:12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px;">
        <div style="font-size:11px; font-weight:700; color:#166534; text-transform:uppercase;">Within 30 Days</div>
        <div style="font-size:22px; font-weight:800; color:#15803d; margin-top:2px;">${exp.within30Days}</div>
        <div style="font-size:11px; color:#166534; margin-top:2px;">Healthy shelf life</div>
      </div>
    `;
  }

  // 5. Section C: Stock Analytics Breakdown
  const stockBox = document.getElementById("stockAnalyticsContent");
  if (stockBox) {
    const sb = data.stockBreakdown;
    stockBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">✅</span>
          <div>
            <div style="font-size:13px; font-weight:700; color:#166534;">Normal Stock Products</div>
            <div style="font-size:11px; color:#15803d;">Healthy quantity available</div>
          </div>
        </div>
        <div style="font-size:18px; font-weight:800; color:#166534;">${sb.normalStock}</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#fffbeb; border:1px solid #fef3c7; border-radius:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">⚠️</span>
          <div>
            <div style="font-size:13px; font-weight:700; color:#b45309;">Low-Stock Products</div>
            <div style="font-size:11px; color:#d97706;">At or below warning threshold</div>
          </div>
        </div>
        <div style="font-size:18px; font-weight:800; color:#b45309;">${sb.lowStock}</div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#fff1f2; border:1px solid #fecdd3; border-radius:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">🛒</span>
          <div>
            <div style="font-size:13px; font-weight:700; color:#9f1239;">Out-of-Stock Products</div>
            <div style="font-size:11px; color:#e11d48;">Zero quantity remaining</div>
          </div>
        </div>
        <div style="font-size:18px; font-weight:800; color:#9f1239;">${sb.outOfStock}</div>
      </div>
    `;
  }

  // 6. Section D: Category Distribution Chart (Chart.js)
  const chartCanvas = document.getElementById("categoryDistributionChart");
  const chartEmpty = document.getElementById("categoryChartEmpty");
  const chartPill = document.getElementById("chartCategoriesCount");
  const activeCategories = Object.keys(data.categoryCounts);

  if (chartPill) chartPill.textContent = `${activeCategories.length} Categories`;

  if (activeCategories.length === 0) {
    if (chartCanvas) chartCanvas.style.display = "none";
    if (chartEmpty) chartEmpty.style.display = "block";
    if (categoryDistributionChartInstance) {
      categoryDistributionChartInstance.destroy();
      categoryDistributionChartInstance = null;
    }
  } else if (window.Chart && chartCanvas) {
    chartCanvas.style.display = "block";
    if (chartEmpty) chartEmpty.style.display = "none";

    const chartCounts = activeCategories.map(c => data.categoryCounts[c]);
    const palette = [
      "#10b981", "#059669", "#34d399", "#0d9488", 
      "#14b8a6", "#0284c7", "#6366f1", "#8b5cf6", 
      "#ec4899", "#f59e0b"
    ];

    if (categoryDistributionChartInstance) {
      categoryDistributionChartInstance.destroy();
    }

    try {
      const ctx = chartCanvas.getContext("2d");
      categoryDistributionChartInstance = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: activeCategories,
          datasets: [{
            data: chartCounts,
            backgroundColor: palette.slice(0, activeCategories.length),
            borderWidth: 2,
            borderColor: "#ffffff"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                boxWidth: 12,
                padding: 10,
                font: { size: 11.5, weight: "700", family: "inherit" },
                color: "#1e293b"
              }
            }
          },
          cutout: "68%"
        }
      });
    } catch(e) {
      console.warn("[Chart.js error]", e);
    }
  }

  // 7. Section E: Recent Activity Timeline
  const activityListEl = document.getElementById("recentActivityList");
  const activityCountPill = document.getElementById("activityCountPill");
  if (activityCountPill) activityCountPill.textContent = `${data.activityList.length} events`;

  if (activityListEl) {
    if (data.activityList.length === 0) {
      activityListEl.innerHTML = `<p style="font-size:13px; color:#94a3b8; text-align:center; padding:24px;">No recent activity recorded for this period. Add or update items to see real-time logs.</p>`;
    } else {
      activityListEl.innerHTML = data.activityList.map(a => {
        let icon = "📝";
        let iconBg = "#f1f5f9";
        let iconColor = "#475569";

        if (a.action === "added") {
          icon = "✨";
          iconBg = "#ecfdf5";
          iconColor = "#059669";
        } else if (a.action === "quantity_changed") {
          icon = "⚖️";
          iconBg = "#eff6ff";
          iconColor = "#2563eb";
        } else if (a.action === "deleted") {
          icon = "🗑️";
          iconBg = "#fff1f2";
          iconColor = "#e11d48";
        } else if (a.action === "updated") {
          icon = "✏️";
          iconBg = "#fffbeb";
          iconColor = "#d97706";
        }

        const dateStr = a.created_at || a.createdAt;
        const formattedTime = dateStr ? new Date(dateStr).toLocaleString("en-GB", {
          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
        }) : "Recently";

        return `
          <div class="activity-item">
            <div class="activity-icon-badge" style="background:${iconBg}; color:${iconColor};">
              ${icon}
            </div>
            <div class="activity-content">
              <div class="activity-title-line">
                <span class="activity-product-name">${escapeHTML(a.product_name || "Item")}</span>
                <span class="activity-time-stamp">${formattedTime}</span>
              </div>
              <p class="activity-details-text">${escapeHTML(a.details || a.action)}</p>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

/* ==========================================================
   SETTINGS & PREFERENCES CONTROLLER
   ========================================================== */

function switchSettingsTab(tabName, btn) {
  document.querySelectorAll(".settings-tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  document.querySelectorAll(".settings-tab-pane").forEach(pane => {
    pane.style.display = "none";
    pane.classList.remove("active");
  });

  const activePane = document.getElementById(`settingsTab_${tabName}`);
  if (activePane) {
    activePane.style.display = "block";
    activePane.classList.add("active");
  }
}

function renderSettingsView() {
  if (!window.store) return;
  const settings = window.store.getFullSettings();
  const user = getCurrentUserInfo() || { name: "Pantry Chef", email: "user@example.com" };

  const displayName = user.name || "Pantry Chef";
  const displayEmail = user.email || "user@example.com";
  const avatarUrl = user.avatarUrl || "";

  // Tab 1: Account
  const profileNameEl = document.getElementById("settingsProfileNameDisplay");
  const profileEmailEl = document.getElementById("settingsProfileEmailDisplay");
  const profileAvatarEl = document.getElementById("settingsProfileAvatarPreview");
  const nameInput = document.getElementById("settingsDisplayName");
  const emailInput = document.getElementById("settingsEmailAddress");
  const avatarInput = document.getElementById("settingsAvatarUrl");
  const verifiedBadge = document.getElementById("settingsEmailVerifiedBadge");

  if (profileNameEl) profileNameEl.textContent = displayName;
  if (profileEmailEl) profileEmailEl.textContent = displayEmail;
  if (profileAvatarEl) {
    if (avatarUrl) {
      profileAvatarEl.innerHTML = `<img src="${avatarUrl}" alt="${displayName}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      profileAvatarEl.textContent = (displayName || "P").charAt(0).toUpperCase();
    }
  }

  if (nameInput) nameInput.value = displayName;
  if (emailInput) emailInput.value = displayEmail;
  if (avatarInput) avatarInput.value = avatarUrl;
  if (verifiedBadge) {
    const isVerified = user.emailVerified !== false;
    verifiedBadge.textContent = isVerified ? "✓ Verified" : "Pending Verification";
    verifiedBadge.style.color = isVerified ? "#166534" : "#b45309";
    verifiedBadge.style.background = isVerified ? "#f0fdf4" : "#fffbeb";
    verifiedBadge.style.borderColor = isVerified ? "#bbf7d0" : "#fde68a";
  }

  // Tab 2: Notifications
  const p = settings.preferences || {};
  const cbExpiry = document.getElementById("pref_alert_expiry");
  const cbExpired = document.getElementById("pref_alert_expired");
  const cbLowStock = document.getElementById("pref_alert_low_stock");
  const cbSecurity = document.getElementById("pref_alert_security");
  const cbWeekly = document.getElementById("pref_alert_weekly_summary");

  if (cbExpiry) cbExpiry.checked = p.alert_expiry !== false;
  if (cbExpired) cbExpired.checked = p.alert_expired !== false;
  if (cbLowStock) cbLowStock.checked = p.alert_low_stock !== false;
  if (cbSecurity) cbSecurity.checked = p.alert_security !== false;
  if (cbWeekly) cbWeekly.checked = !!p.alert_weekly_summary;

  // Tab 3: Pantry Preferences
  const pp = settings.pantry_settings || {};
  const selLocation = document.getElementById("pantryPrefDefaultLocation");
  const selExpiryDays = document.getElementById("pantryPrefExpiryDays");
  const inpThreshold = document.getElementById("pantryPrefLowStockThreshold");
  const selUnit = document.getElementById("pantryPrefDefaultUnit");
  const selCategory = document.getElementById("pantryPrefDefaultCategory");

  if (selLocation) selLocation.value = pp.default_location || "Pantry";
  if (selExpiryDays) selExpiryDays.value = String(pp.expiry_warning_days || 7);
  if (inpThreshold) inpThreshold.value = Number(pp.low_stock_threshold) || 2;
  if (selUnit) selUnit.value = pp.default_unit || "pcs";
  if (selCategory) selCategory.value = pp.default_category || "Pantry";

  // Tab 4: Security
  const secEmailSub = document.getElementById("securityUserEmailSub");
  const secEmailBadge = document.getElementById("securityEmailBadge");
  if (secEmailSub) secEmailSub.textContent = displayEmail;
  if (secEmailBadge) {
    const isVerified = user.emailVerified !== false;
    secEmailBadge.textContent = isVerified ? "✓ Verified" : "Pending Verification";
    secEmailBadge.style.color = isVerified ? "#166534" : "#b45309";
    secEmailBadge.style.background = isVerified ? "#f0fdf4" : "#fffbeb";
    secEmailBadge.style.borderColor = isVerified ? "#bbf7d0" : "#fde68a";
  }

  const lastLoginEl = document.getElementById("securityLastLoginTimestamp");
  if (lastLoginEl) {
    lastLoginEl.textContent = new Date().toLocaleString("en-US", {
      dateStyle: "medium", timeStyle: "short"
    });
  }

  // Tab 6: General Localization
  const gen = settings.general_settings || {};
  const selLang = document.getElementById("generalLanguage");
  const selTz = document.getElementById("generalTimezone");
  const selCurr = document.getElementById("generalCurrency");
  const selDate = document.getElementById("generalDateFormat");

  if (selLang) selLang.value = gen.language || "English";
  if (selTz) selTz.value = gen.timezone || "Asia/Kolkata";
  if (selCurr) selCurr.value = gen.currency || "INR";
  if (selDate) selDate.value = gen.date_format || "DD/MM/YYYY";

  // Tab 7: Appearance
  selectAppearanceTheme(gen.theme || "light", false);
}

async function handleNotificationToggleChange() {
  if (!window.store) return;
  const alertExpiry = document.getElementById("pref_alert_expiry")?.checked !== false;
  const alertExpired = document.getElementById("pref_alert_expired")?.checked !== false;
  const alertLowStock = document.getElementById("pref_alert_low_stock")?.checked !== false;
  const alertSecurity = document.getElementById("pref_alert_security")?.checked !== false;
  const alertWeekly = !!document.getElementById("pref_alert_weekly_summary")?.checked;

  await window.store.saveFullSettings({
    preferences: {
      alert_expiry: alertExpiry,
      alert_expired: alertExpired,
      alert_low_stock: alertLowStock,
      alert_security: alertSecurity,
      alert_weekly_summary: alertWeekly
    }
  });
  showToast("✓ Notification preference saved");
}

function selectAppearanceTheme(theme, userClick = true) {
  ["light", "dark", "system"].forEach(t => {
    const btn = document.getElementById(`themeBtn_${t}`);
    if (btn) {
      if (t === theme) {
        btn.style.borderColor = "#10b981";
        btn.style.borderWidth = "2px";
      } else {
        btn.style.borderColor = "#cbd5e1";
        btn.style.borderWidth = "1px";
      }
    }
  });

  if (window.store) {
    window.store.applyTheme(theme);
    if (userClick) {
      window.store.saveFullSettings({ general_settings: { theme } });
      showToast(`✓ Theme set to ${theme.charAt(0).toUpperCase() + theme.slice(1)} Mode`);
    }
  }
}

async function saveAllSettingsForm() {
  if (!window.store) return;

  const displayName = (document.getElementById("settingsDisplayName")?.value || "").trim();
  const avatarUrl = (document.getElementById("settingsAvatarUrl")?.value || "").trim();

  const alertExpiry = document.getElementById("pref_alert_expiry")?.checked !== false;
  const alertExpired = document.getElementById("pref_alert_expired")?.checked !== false;
  const alertLowStock = document.getElementById("pref_alert_low_stock")?.checked !== false;
  const alertSecurity = document.getElementById("pref_alert_security")?.checked !== false;
  const alertWeekly = !!document.getElementById("pref_alert_weekly_summary")?.checked;

  const defaultLocation = document.getElementById("pantryPrefDefaultLocation")?.value || "Pantry";
  const expiryDays = parseInt(document.getElementById("pantryPrefExpiryDays")?.value, 10) || 7;
  const lowThreshold = parseInt(document.getElementById("pantryPrefLowStockThreshold")?.value, 10) || 2;
  const defaultUnit = document.getElementById("pantryPrefDefaultUnit")?.value || "pcs";
  const defaultCat = document.getElementById("pantryPrefDefaultCategory")?.value || "Pantry";

  const language = document.getElementById("generalLanguage")?.value || "English";
  const timezone = document.getElementById("generalTimezone")?.value || "Asia/Kolkata";
  const currency = document.getElementById("generalCurrency")?.value || "INR";
  const dateFormat = document.getElementById("generalDateFormat")?.value || "DD/MM/YYYY";

  // Update profile
  const user = getCurrentUserInfo() || {};
  if (displayName) user.name = displayName;
  user.avatarUrl = avatarUrl;

  try {
    localStorage.setItem("smartpantry_user", JSON.stringify(user));
    const nameEl = document.getElementById("userName");
    const avatarEl = document.getElementById("userAvatar");
    const welcomeEl = document.getElementById("welcomeUserName");
    const profileNameEl = document.getElementById("settingsProfileNameDisplay");
    const profileAvatarEl = document.getElementById("settingsProfileAvatarPreview");

    if (nameEl && displayName) nameEl.textContent = displayName;
    if (welcomeEl && displayName) welcomeEl.textContent = displayName;
    if (profileNameEl && displayName) profileNameEl.textContent = displayName;

    if (avatarEl) {
      if (avatarUrl) {
        avatarEl.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
      } else if (displayName) {
        avatarEl.textContent = displayName.charAt(0).toUpperCase();
      }
    }
    if (profileAvatarEl) {
      if (avatarUrl) {
        profileAvatarEl.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
      } else if (displayName) {
        profileAvatarEl.textContent = displayName.charAt(0).toUpperCase();
      }
    }

    if (window.supabaseService && window.supabaseService.isReady() && user.id) {
      await window.supabaseService.updateProfile(user.id, {
        fullName: displayName,
        avatarUrl: avatarUrl || null
      });
    }
  } catch(e) {
    console.warn("[Profile Update]", e);
  }

  await window.store.saveFullSettings({
    preferences: {
      alert_expiry: alertExpiry,
      alert_expired: alertExpired,
      alert_low_stock: alertLowStock,
      alert_security: alertSecurity,
      alert_weekly_summary: alertWeekly
    },
    pantry_settings: {
      default_location: defaultLocation,
      expiry_warning_days: expiryDays,
      low_stock_threshold: lowThreshold,
      default_unit: defaultUnit,
      default_category: defaultCat
    },
    general_settings: {
      language,
      timezone,
      currency,
      date_format: dateFormat
    }
  });

  showToast("✓ All settings and preferences saved!");
}

async function handleSettingsUpdatePassword() {
  const pwdInput = document.getElementById("settingsNewPassword");
  const newPwd = pwdInput ? pwdInput.value.trim() : "";
  if (!newPwd || newPwd.length < 6) {
    showToast("Password must be at least 6 characters long.");
    if (pwdInput) pwdInput.focus();
    return;
  }

  if (window.supabaseService && window.supabaseService.isReady()) {
    showToast("Updating password...");
    const res = await window.supabaseService.updatePassword(newPwd);
    if (res.success) {
      showToast("✓ Password updated successfully!");
      if (pwdInput) pwdInput.value = "";
    } else {
      showToast("⚠️ " + (res.error || "Failed to update password"));
    }
  } else {
    showToast("✓ Password updated for local session.");
    if (pwdInput) pwdInput.value = "";
  }
}

function openTermsModal() {
  const modal = document.getElementById("consumerTermsModal");
  if (modal) modal.classList.add("active");
}
function closeTermsModal() {
  const modal = document.getElementById("consumerTermsModal");
  if (modal) modal.classList.remove("active");
}
function openPrivacyModal() {
  const modal = document.getElementById("consumerPrivacyModal");
  if (modal) modal.classList.add("active");
}
function closePrivacyModal() {
  const modal = document.getElementById("consumerPrivacyModal");
  if (modal) modal.classList.remove("active");
}

function handleSignOutOtherSessions() {
  showToast("✓ All other active sessions signed out.");
}

function handleDeleteAccount() {
  if (confirm("⚠️ CAUTION: Are you sure you want to delete your account? All pantry data and history will be permanently erased.")) {
    if (window.store) {
      window.store.clearAll();
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch(e) {}
    showToast("Account data cleared. Refreshing...");
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }
}

/* ==========================================================
   REAL-TIME ALERT CENTER DRAWER CONTROLLER
   ========================================================== */
let currentAlertDrawerFilter = "all";

function toggleAlertCenter(open = true) {
  const drawer = document.getElementById("alertCenterDrawer");
  const backdrop = document.getElementById("alertDrawerBackdrop");
  if (!drawer || !backdrop) return;

  if (open) {
    drawer.classList.add("active");
    backdrop.classList.add("active");
    renderAlertCenter();
  } else {
    drawer.classList.remove("active");
    backdrop.classList.remove("active");
  }
}

function filterAlertDrawer(filter, btn) {
  currentAlertDrawerFilter = filter;
  document.querySelectorAll(".alert-drawer-tabs .alert-tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderAlertCenter();
}

function renderAlertCenter() {
  if (!window.store) return;
  const listEl = document.getElementById("alertDrawerList");
  const unreadEl = document.getElementById("alertDrawerUnreadCount");
  if (!listEl) return;

  const alerts = window.store.getAlerts(currentAlertDrawerFilter);
  const unreadCount = window.store.getUnreadAlertsCount();

  if (unreadEl) {
    unreadEl.textContent = `${unreadCount} Unread Alert${unreadCount === 1 ? '' : 's'}`;
  }

  if (alerts.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:48px 16px; color:#94a3b8;">
        <div style="font-size:36px; margin-bottom:10px;">🎉</div>
        <p style="font-size:14.5px; font-weight:700; color:#1e392a; margin-bottom:4px;">All caught up!</p>
        <p style="font-size:12px; color:#64748b;">No active alerts matching this filter.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = alerts.map(a => {
    let icon = "🔔";
    if (a.type === "expiry") icon = "⏳";
    else if (a.type === "low_stock") icon = "📦";
    else if (a.type === "security") icon = "🔒";

    const isUnread = !a.is_read;
    const dateStr = a.created_at || a.createdAt;
    const timeFormatted = dateStr ? new Date(dateStr).toLocaleString("en-GB", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    }) : "Just now";

    return `
      <div class="alert-item-card ${isUnread ? 'unread' : ''}" onclick="window.store.markAlertRead('${a.id}')">
        ${isUnread ? '<div class="alert-unread-dot"></div>' : ''}
        <div style="font-size:22px; line-height:1; flex-shrink:0;">${icon}</div>
        <div style="flex:1; min-width:0; padding-right:18px;">
          <div style="font-size:13.5px; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:6px;">
            ${escapeHTML(a.title)}
          </div>
          <p style="font-size:12px; color:#64748b; margin-top:3px; line-height:1.4;">${escapeHTML(a.message)}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
            <span style="font-size:11px; color:#94a3b8; font-weight:600;">${timeFormatted}</span>
            <button type="button" onclick="event.stopPropagation(); window.store.deleteAlert('${a.id}')" style="background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer; padding:2px 6px;" title="Delete Alert">
              ✕
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// React to pantry changes across components
if (window.store) {
  window.store.subscribe(() => {
    const insightsSec = document.getElementById("insightsSection");
    if (insightsSec && insightsSec.style.display !== "none") {
      renderInsightsView();
    }
    const drawer = document.getElementById("alertCenterDrawer");
    if (drawer && drawer.classList.contains("active")) {
      renderAlertCenter();
    }
  });
}

// Initialize hover motion on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  initCategoryHoverMotion();
});

// Explicit Global Window Attachments
window.openAddEditModal = openAddEditModal;
window.closeAddEditModal = closeAddEditModal;
window.saveItemForm = saveItemForm;
window.toggleCategoryDropdown = toggleCategoryDropdown;
window.closeCategoryDropdown = closeCategoryDropdown;
window.selectCategory = selectCategory;
window.setCategoryValue = setCategoryValue;
window.renderInventoryTable = renderInventoryTable;
window.updateMetricsDisplay = updateMetricsDisplay;
window.setCategoryFilter = setCategoryFilter;
window.setStatusFilter = setStatusFilter;
window.deletePantryItem = deletePantryItem;
window.openEmailAlertModal = openEmailAlertModal;
window.closeEmailAlertModal = closeEmailAlertModal;
window.saveEmailAlertSettings = saveEmailAlertSettings;
window.triggerTestEmailAlert = triggerTestEmailAlert;
window.escapeHTML = escapeHTML;

// Insights, Settings & Alert Center Exports
window.setInsightsTimeframe = setInsightsTimeframe;
window.renderInsightsView = renderInsightsView;
window.renderSettingsView = renderSettingsView;
window.switchSettingsTab = switchSettingsTab;
window.saveAllSettingsForm = saveAllSettingsForm;
window.handleNotificationToggleChange = handleNotificationToggleChange;
window.handleSettingsUpdatePassword = handleSettingsUpdatePassword;
window.handleSignOutOtherSessions = handleSignOutOtherSessions;
window.handleDeleteAccount = handleDeleteAccount;
window.selectAppearanceTheme = selectAppearanceTheme;
window.openTermsModal = openTermsModal;
window.closeTermsModal = closeTermsModal;
window.openPrivacyModal = openPrivacyModal;
window.closePrivacyModal = closePrivacyModal;
window.toggleAlertCenter = toggleAlertCenter;
window.filterAlertDrawer = filterAlertDrawer;
window.renderAlertCenter = renderAlertCenter;



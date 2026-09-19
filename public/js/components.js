/**
 * Smart Pantry - UI Components, Table Rendering, Category Filters & Modals
 */

let currentCategoryFilter = "All";
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

  if (totalEl) totalEl.textContent = metrics.total;
  if (lowStockEl) lowStockEl.textContent = metrics.lowStock;
  if (expiringEl) expiringEl.textContent = metrics.expiringSoon;
  if (shoppingEl) shoppingEl.textContent = metrics.shoppingListCount;
}

// Render Inventory Table based on active filters
function renderInventoryTable() {
  const tbody = document.getElementById("inventoryTableBody");
  if (!tbody) return;

  const allItems = window.store.getItems();
  const filtered = allItems.filter(item => {
    const itemCat = (item.category || "Pantry").toLowerCase();
    const filterCat = currentCategoryFilter.toLowerCase();
    const matchesCategory = currentCategoryFilter === "All" || itemCat === filterCat;
    const matchesSearch = !currentSearchQuery || 
      (item.name || "").toLowerCase().includes(currentSearchQuery.toLowerCase()) ||
      itemCat.includes(currentSearchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding: 36px 16px; color: #94a3b8;">
          <div style="font-size: 32px; margin-bottom: 8px;">🥣</div>
          <p style="font-weight: 600; color: #64748b;">No items found</p>
          <small>Try another filter or click "+ Quick Add Item"</small>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const computedStatus = window.store.calculateStatus(item.expiryDate, item.quantity);
    const rel = window.formatRelativeExpiry ? window.formatRelativeExpiry(item.expiryDate) : { text: item.expiryDate || "—", urgent: false, days: null };

    let statusClass = "status-fresh";
    let statusLabel = "Fresh";

    if (computedStatus === "Expired" || (rel.days !== null && rel.days < 0)) {
      statusClass = "status-expired";
      statusLabel = "Expired";
    } else if (computedStatus === "Expiring Soon" || (rel.days !== null && rel.days <= 7)) {
      statusClass = "status-expiring";
      statusLabel = "Expiring Soon";
    } else if (computedStatus === "Low Stock" || Number(item.quantity) <= 1) {
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
            <div class="item-thumb">${item.emoji || "📦"}</div>
            <span>${escapeHTML(item.name)}</span>
          </div>
        </td>
        <td style="color: #64748b;">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <img src="assets/categories/${catName.toLowerCase()}.png" alt="" style="width:20px; height:18px; object-fit:contain;" onerror="this.style.display='none'">
            <span>${escapeHTML(catName)}</span>
          </span>
        </td>
        <td style="font-weight: 600;">${item.quantity} ${escapeHTML(item.unit || "pcs")}</td>
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
function deletePantryItem(id) {
  const item = window.store.getItemById(id);
  if (!item) return;
  if (confirm(`Remove "${item.name}" from your pantry?`)) {
    window.store.deleteItem(id);
    showToast(`Removed "${item.name}"`);
    renderInventoryTable();
    updateMetricsDisplay();
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

  if (!modal) return;

  // Show modal first so children have layout dimensions
  modal.classList.add("active");
  closeCategoryDropdown();

  if (id) {
    const item = window.store.getItemById(id);
    if (item) {
      if (title) title.textContent = "✏️ Edit Item";
      if (nameInput) nameInput.value = item.name;
      setCategoryValue(item.category || "Fruits");
      if (qtyInput) qtyInput.value = item.quantity;
      if (unitInput) unitInput.value = item.unit || "pcs";
      if (expiryInput) expiryInput.value = item.expiryDate || "";
    }
  } else {
    if (title) title.textContent = "＋ Add Item to Pantry";
    if (nameInput) nameInput.value = "";
    setCategoryValue("Fruits");
    if (qtyInput) qtyInput.value = "1";
    if (unitInput) unitInput.value = "pcs";
    if (expiryInput) expiryInput.value = "";
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

function saveItemForm(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const nameInput = document.getElementById("itemNameInput");
  const catInput = document.getElementById("itemCategoryInput");
  const qtyInput = document.getElementById("itemQuantityInput");
  const unitInput = document.getElementById("itemUnitInput");
  const expiryInput = document.getElementById("itemExpiryInput");

  const name = nameInput ? nameInput.value.trim() : "";
  const category = catInput ? catInput.value : "Fruits";
  const quantity = qtyInput ? (parseFloat(qtyInput.value) || 1) : 1;
  const unit = unitInput ? unitInput.value : "pcs";
  const expiryDate = expiryInput ? expiryInput.value : "";

  if (!name) {
    showToast("Please enter an item name.");
    if (nameInput) nameInput.focus();
    return;
  }

  if (editingItemId) {
    window.store.updateItem(editingItemId, {
      name,
      category,
      quantity,
      unit,
      expiryDate
    });
    showToast(`Updated "${name}"`);
  } else {
    window.store.addItem({
      name,
      category,
      quantity,
      unit,
      expiryDate
    });
    showToast(`Added "${name}" to pantry!`);
  }

  closeAddEditModal();
  renderInventoryTable();
  updateMetricsDisplay();
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
  const emailInput = document.getElementById("alertEmailInput");
  const email = emailInput ? emailInput.value.trim() : "";
  if (!email) {
    showToast("Please provide an email address first.");
    return;
  }

  showToast(`Sending test alert to ${email}... ✉️`);

  try {
    const response = await fetch("/.netlify/functions/send-pantry-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        type: "test",
        customMessage: "This is a live test alert verifying Resend email delivery for Smart Pantry."
      })
    });

    const result = await response.json();
    if (result.success && result.id) {
      showToast(`✓ Test email delivered to ${email}! (ID: ${result.id.slice(0, 8)}...)`);
    } else if (result.status === "pending_config") {
      showToast("Settings saved. Add RESEND_API_KEY in Netlify to deliver live emails.");
    } else {
      showToast(`Test alert processed: ${result.message || result.error || 'Done'}`);
    }
  } catch (err) {
    console.warn("Test alert notice:", err);
    showToast(`Test alert notice: Backend functions active upon Netlify deployment.`);
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
window.deletePantryItem = deletePantryItem;
window.openEmailAlertModal = openEmailAlertModal;
window.closeEmailAlertModal = closeEmailAlertModal;
window.saveEmailAlertSettings = saveEmailAlertSettings;
window.triggerTestEmailAlert = triggerTestEmailAlert;
window.escapeHTML = escapeHTML;


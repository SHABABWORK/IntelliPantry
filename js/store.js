/**
 * Smart Pantry - Central State Management & LocalStorage Store
 * Real-time Dynamic Date, Expiry & User-Isolated State Engine
 */

// Format today's date in local ISO YYYY-MM-DD
function getTodayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Generate relative date string in ISO YYYY-MM-DD from today
function getRelativeDateISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Timezone-safe local calendar date parser
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  const parts = String(dateStr).split(/[-T/]/);
  if (parts.length >= 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// Calculate exact calendar days between today (00:00 local) and target date
function getDaysDifference(targetDateStr) {
  if (!targetDateStr) return null;
  const target = parseLocalDate(targetDateStr);
  if (!target) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Format human-friendly relative expiry label
function formatRelativeExpiry(expiryDateStr) {
  if (!expiryDateStr) {
    return { text: "No expiry set", label: "—", status: "Fresh", urgent: false, days: null };
  }

  const diffDays = getDaysDifference(expiryDateStr);
  if (diffDays === null) {
    return { text: "—", label: "—", status: "Fresh", urgent: false, days: null };
  }

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    const text = abs === 1 ? "Expired yesterday" : `Expired ${abs} days ago`;
    return { text, label: text, status: "Expired", urgent: true, days: diffDays };
  } else if (diffDays === 0) {
    return { text: "Expires today", label: "Expires today", status: "Expiring Soon", urgent: true, days: 0 };
  } else if (diffDays === 1) {
    return { text: "1 day remaining (Tomorrow)", label: "1 day remaining", status: "Expiring Soon", urgent: true, days: 1 };
  } else if (diffDays <= 7) {
    return { text: `${diffDays} days remaining`, label: `${diffDays} days left`, status: "Expiring Soon", urgent: true, days: diffDays };
  } else {
    return { text: `${diffDays} days remaining`, label: `${diffDays} days left`, status: "Fresh", urgent: false, days: diffDays };
  }
}

function getDefaultItems() {
  return [
    {
      id: "1",
      name: "Apple",
      category: "Fruits",
      quantity: 5,
      unit: "pcs",
      expiryDate: getRelativeDateISO(7),
      status: "Fresh",
      emoji: "🍎",
      addedAt: getRelativeDateISO(-2)
    },
    {
      id: "2",
      name: "Milk",
      category: "Dairy",
      quantity: 1,
      unit: "L",
      expiryDate: getRelativeDateISO(1),
      status: "Expiring Soon",
      emoji: "🥛",
      addedAt: getRelativeDateISO(-3)
    },
    {
      id: "3",
      name: "Eggs",
      category: "Dairy",
      quantity: 6,
      unit: "pcs",
      expiryDate: getRelativeDateISO(12),
      status: "Fresh",
      emoji: "🥚",
      addedAt: getRelativeDateISO(-1)
    },
    {
      id: "4",
      name: "Rice",
      category: "Grains",
      quantity: 1,
      unit: "kg",
      expiryDate: "",
      status: "Low Stock",
      emoji: "🌾",
      addedAt: getRelativeDateISO(-7)
    },
    {
      id: "5",
      name: "Chicken",
      category: "Meat",
      quantity: 500,
      unit: "g",
      expiryDate: getRelativeDateISO(2),
      status: "Expiring Soon",
      emoji: "🍗",
      addedAt: getRelativeDateISO(-1)
    },
    {
      id: "6",
      name: "Tomatoes",
      category: "Vegetables",
      quantity: 4,
      unit: "pcs",
      expiryDate: getRelativeDateISO(9),
      status: "Fresh",
      emoji: "🍅",
      addedAt: getRelativeDateISO(-2)
    }
  ];
}

const CATEGORY_EMOJIS = {
  Fruits: "🍎",
  Vegetables: "🥦",
  Dairy: "🥛",
  Grains: "🌾",
  Meat: "🍗",
  Beverages: "🧃",
  Pantry: "🥫",
  Frozen: "🧊",
  Snacks: "🍪",
  Spices: "🧂"
};

function getCurrentUserInfo() {
  try {
    return JSON.parse(localStorage.getItem("smartpantry_user") || "{}");
  } catch (e) {
    return {};
  }
}

class PantryStore {
  constructor() {
    this.listeners = [];
    this.init();
  }

  get storageKey() {
    const user = getCurrentUserInfo();
    const uid = user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'default');
    return `smart_pantry_items_${uid}`;
  }

  get settingsKey() {
    const user = getCurrentUserInfo();
    const uid = user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'default');
    return `smart_pantry_settings_${uid}`;
  }

  get alertHistoryKey() {
    const user = getCurrentUserInfo();
    const uid = user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'default');
    return `smart_pantry_alerts_${uid}`;
  }

  init() {
    const key = this.storageKey;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(getDefaultItems()));
    }
    const setKey = this.settingsKey;
    if (!localStorage.getItem(setKey)) {
      const user = getCurrentUserInfo();
      const defaultSettings = {
        email: user.email || "smartpantry.notify@gmail.com",
        alertOnStockOut: true,
        alertOnExpiry: true
      };
      localStorage.setItem(setKey, JSON.stringify(defaultSettings));
    }

    // Schedule a debounced background check for expiring/low-stock items
    setTimeout(() => {
      this.checkAndDispatchPantryAlerts();
    }, 2500);
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(fn => fn());
  }

  getItems() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : DEFAULT_ITEMS;
    } catch (e) {
      console.error("Failed to parse items:", e);
      return DEFAULT_ITEMS;
    }
  }

  saveItems(items) {
    localStorage.setItem(this.storageKey, JSON.stringify(items));
    this.notify();
    this.checkAndDispatchPantryAlerts();
  }

  addItem(item) {
    const items = this.getItems();
    const resolvedEmoji = item.emoji || this.detectEmoji(item.name, item.category);
    const computedStatus = item.status || this.calculateStatus(item.expiryDate, item.quantity);

    const newItem = {
      id: item.id || Date.now().toString(),
      name: item.name,
      category: item.category || "Pantry",
      quantity: Number(item.quantity) || 1,
      unit: item.unit || "pcs",
      expiryDate: item.expiryDate || "",
      status: computedStatus,
      emoji: resolvedEmoji,
      addedAt: new Date().toISOString()
    };

    items.unshift(newItem);
    this.saveItems(items);
    return newItem;
  }

  updateItem(id, updates) {
    const items = this.getItems().map(item => {
      if (item.id === id) {
        const updated = { ...item, ...updates };
        if (updates.expiryDate !== undefined || updates.quantity !== undefined) {
          updated.status = this.calculateStatus(updated.expiryDate, updated.quantity);
        }
        return updated;
      }
      return item;
    });
    this.saveItems(items);
  }

  deleteItem(id) {
    const items = this.getItems().filter(item => item.id !== id);
    this.saveItems(items);
  }

  getItemById(id) {
    return this.getItems().find(i => i.id === id);
  }

  getSettings() {
    try {
      const data = localStorage.getItem(this.settingsKey);
      const user = getCurrentUserInfo();
      const defaultEmail = user.email || "smartpantry.notify@gmail.com";
      return data ? JSON.parse(data) : { email: defaultEmail, alertOnStockOut: true, alertOnExpiry: true };
    } catch (e) {
      const user = getCurrentUserInfo();
      return { email: user.email || "smartpantry.notify@gmail.com", alertOnStockOut: true, alertOnExpiry: true };
    }
  }

  saveSettings(settings) {
    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    this.notify();
  }

  detectEmoji(name = "", category = "") {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("apple")) return "🍎";
    if (lowerName.includes("banana")) return "🍌";
    if (lowerName.includes("orange") || lowerName.includes("lemon")) return "🍋";
    if (lowerName.includes("milk")) return "🥛";
    if (lowerName.includes("egg")) return "🥚";
    if (lowerName.includes("rice")) return "🌾";
    if (lowerName.includes("chicken")) return "🍗";
    if (lowerName.includes("meat") || lowerName.includes("beef")) return "🥩";
    if (lowerName.includes("tomato")) return "🍅";
    if (lowerName.includes("potato") || lowerName.includes("onion")) return "🥔";
    if (lowerName.includes("bread")) return "🍞";
    if (lowerName.includes("coffee") || lowerName.includes("tea")) return "☕";
    if (lowerName.includes("oil")) return "🫒";
    if (lowerName.includes("cheese")) return "🧀";

    return CATEGORY_EMOJIS[category] || "📦";
  }

  calculateStatus(expiryDate, quantity) {
    if (Number(quantity) <= 0) return "Low Stock";
    if (!expiryDate) return "Fresh";

    const diffDays = getDaysDifference(expiryDate);
    if (diffDays === null) return "Fresh";

    if (diffDays < 0) return "Expired";
    if (diffDays <= 7) return "Expiring Soon";
    return "Fresh";
  }

  getMetrics() {
    const items = this.getItems();
    const total = items.length;
    let lowStock = 0;
    let expiringSoon = 0;
    let expired = 0;

    items.forEach(i => {
      const s = this.calculateStatus(i.expiryDate, i.quantity);
      if (s === "Low Stock" || Number(i.quantity) <= 1) lowStock++;
      if (s === "Expiring Soon") expiringSoon++;
      if (s === "Expired") expired++;
    });

    return {
      total: total,
      lowStock: lowStock,
      expiringSoon: expiringSoon,
      expired: expired,
      shoppingListCount: lowStock + expired
    };
  }

  // Deduplicated alert dispatcher
  async checkAndDispatchPantryAlerts(force = false) {
    try {
      const settings = this.getSettings();
      if (!settings.email) return;

      const items = this.getItems();
      let alertHistory = {};
      try {
        alertHistory = JSON.parse(localStorage.getItem(this.alertHistoryKey) || "{}");
      } catch (e) {
        alertHistory = {};
      }

      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      const expiringItems = [];
      const lowStockItems = [];

      items.forEach(item => {
        const status = this.calculateStatus(item.expiryDate, item.quantity);
        const lastSent = alertHistory[item.id] || 0;
        const needsAlert = force || (now - lastSent > ONE_DAY_MS);

        if (needsAlert) {
          if ((status === "Expiring Soon" || status === "Expired") && settings.alertOnExpiry) {
            expiringItems.push(item);
          } else if ((status === "Low Stock" || Number(item.quantity) <= 1) && settings.alertOnStockOut) {
            lowStockItems.push(item);
          }
        }
      });

      // Dispatch expiry alerts if any
      if (expiringItems.length > 0) {
        fetch("/api/send-pantry-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: settings.email,
            type: "expiry",
            items: expiringItems.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit, status: i.status }))
          })
        }).then(() => {
          expiringItems.forEach(i => { alertHistory[i.id] = now; });
          localStorage.setItem(this.alertHistoryKey, JSON.stringify(alertHistory));
        }).catch(err => console.warn("[Pantry Alert] Expiry alert dispatch error:", err));
      }

      // Dispatch low stock alerts if any
      if (lowStockItems.length > 0) {
        fetch("/api/send-pantry-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: settings.email,
            type: "low_stock",
            items: lowStockItems.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit, status: i.status }))
          })
        }).then(() => {
          lowStockItems.forEach(i => { alertHistory[i.id] = now; });
          localStorage.setItem(this.alertHistoryKey, JSON.stringify(alertHistory));
        }).catch(err => console.warn("[Pantry Alert] Low stock dispatch error:", err));
      }

    } catch (e) {
      console.warn("[Pantry Alert Check Error]", e);
    }
  }
}

// Global helpers and store instance
window.getTodayISO = getTodayISO;
window.getRelativeDateISO = getRelativeDateISO;
window.parseLocalDate = parseLocalDate;
window.getDaysDifference = getDaysDifference;
window.formatRelativeExpiry = formatRelativeExpiry;
window.store = new PantryStore();

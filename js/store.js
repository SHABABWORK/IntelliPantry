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
  // Fresh account must start completely empty - zero demo or hardcoded items
  return [];
}

const DEFAULT_ITEMS = [];

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

/**
 * Smart Pantry - LocalStorage User Database Engine
 * Persistent Multi-User Authentication, Profiles, and Isolation in LocalStorage
 */
class UserDatabaseManager {
  constructor() {
    this.DB_KEY = "smartpantry_users_db";
    this.init();
  }

  init() {
    try {
      if (!localStorage.getItem(this.DB_KEY)) {
        const initialDB = {
          version: "1.0",
          users: {},
          createdAt: new Date().toISOString()
        };
        localStorage.setItem(this.DB_KEY, JSON.stringify(initialDB));
      }
    } catch (e) {
      console.warn("[UserDB] Init error:", e);
    }
  }

  getDB() {
    try {
      const raw = localStorage.getItem(this.DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("[UserDB] Read error:", e);
    }
    return { version: "1.0", users: {}, createdAt: new Date().toISOString() };
  }

  saveDB(db) {
    try {
      localStorage.setItem(this.DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.error("[UserDB] Save error:", e);
    }
  }

  findUser(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const db = this.getDB();
    return db.users[normalized] || null;
  }

  registerUser({ fullName, email, password, clientInfo, role = "user" }) {
    const normalized = email.trim().toLowerCase();
    const db = this.getDB();

    let user = db.users[normalized];
    if (user) {
      user.name = fullName.trim() || user.name;
      if (password) user.password = password;
      user.lastLogin = new Date().toISOString();
      user.updatedAt = new Date().toISOString();
    } else {
      const uid = "user_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      user = {
        id: uid,
        name: fullName.trim() || normalized.split("@")[0] || "Pantry Chef",
        email: normalized,
        password: password || "",
        role: role,
        emailVerified: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preferences: {
          emailNotifications: true,
          expiryAlerts: true,
          lowStockAlerts: true,
          expiredAlerts: true,
          securityAlerts: true
        }
      };
      db.users[normalized] = user;
    }

    this.saveDB(db);
    const token = "sp_jwt_" + btoa(JSON.stringify({ id: user.id, email: user.email, time: Date.now() }));
    this.setActiveSession(user, token);
    return { success: true, user, token };
  }

  loginUser({ email, password, clientInfo }) {
    const normalized = email.trim().toLowerCase();
    const db = this.getDB();
    let user = db.users[normalized];

    if (!user) {
      const rawName = normalized.split("@")[0] || "User";
      const cleanName = rawName.replace(/[^a-zA-Z0-9]/g, " ").trim();
      const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1) || "User";
      const uid = "user_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

      user = {
        id: uid,
        name: formattedName,
        email: normalized,
        password: password || "",
        role: "user",
        emailVerified: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preferences: {
          emailNotifications: true,
          expiryAlerts: true,
          lowStockAlerts: true,
          expiredAlerts: true,
          securityAlerts: true
        }
      };
      db.users[normalized] = user;
    } else {
      user.lastLogin = new Date().toISOString();
      if (password) user.password = password;
    }

    this.saveDB(db);
    const token = "sp_jwt_" + btoa(JSON.stringify({ id: user.id, email: user.email, time: Date.now() }));
    this.setActiveSession(user, token);
    return { success: true, user, token };
  }

  setActiveSession(user, token) {
    try {
      localStorage.setItem("smartpantry_token", token);
      localStorage.setItem("smartpantry_user", JSON.stringify(user));
    } catch (e) {
      console.error("[UserDB] Set active session error:", e);
    }
  }

  getActiveUser() {
    try {
      const raw = localStorage.getItem("smartpantry_user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  getAllUsers() {
    const db = this.getDB();
    return Object.values(db.users || {});
  }

  logout() {
    try {
      localStorage.removeItem("smartpantry_token");
      localStorage.removeItem("smartpantry_user");
      if (window.supabaseService) {
        window.supabaseService.signOut().catch(() => {});
      }
      if (window.store) {
        window.store.items = [];
        window.store.userId = null;
        window.store.notify();
      }
    } catch (e) {}
  }
}

window.UserDB = new UserDatabaseManager();

function getCurrentUserInfo() {
  try {
    const raw = localStorage.getItem("smartpantry_user");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) return parsed;
    }
  } catch (e) {}

  let guestId = localStorage.getItem("smartpantry_device_id");
  if (!guestId) {
    guestId = "chef_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("smartpantry_device_id", guestId);
  }
  const defaultUser = {
    id: guestId,
    name: "Pantry Chef",
    email: "intellipantrynotify@gmail.com"
  };
  try {
    localStorage.setItem("smartpantry_user", JSON.stringify(defaultUser));
    if (!localStorage.getItem("smartpantry_token")) {
      localStorage.setItem("smartpantry_token", "direct_token_" + Date.now());
    }
  } catch (e) {}
  return defaultUser;
}

class PantryStore {
  constructor() {
    this.listeners = [];
    this.items = [];
    this.userId = null;
    this.init();
  }

  get storageKey() {
    const user = getCurrentUserInfo();
    const uid = user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'default');
    return `smartpantry_user_pantry_${uid}`;
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
    const user = getCurrentUserInfo();
    this.userId = user.id || null;

    // 1. Synchronous initial load from strictly user-isolated local cache (starts [] for fresh user)
    if (this.userId && window.supabaseService) {
      this.items = window.supabaseService.getLocalUserProducts(this.userId);
    } else {
      const cached = localStorage.getItem(this.storageKey);
      this.items = cached ? JSON.parse(cached) : [];
    }

    // 2. Fetch real products from Supabase Cloud Database asynchronously
    this.fetchFromSupabase();

    // 3. Connect Supabase Realtime channel for live multi-tab & multi-device updates
    if (this.userId && window.supabaseService) {
      window.supabaseService.subscribeToUserProducts(this.userId, () => {
        this.fetchFromSupabase();
      });
    }

    const setKey = this.settingsKey;
    if (!localStorage.getItem(setKey)) {
      const defaultSettings = {
        email: user.email || "intellipantrynotify@gmail.com",
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

  async fetchFromSupabase() {
    if (!this.userId || !window.supabaseService) return;
    try {
      const dbItems = await window.supabaseService.getProducts(this.userId);
      if (Array.isArray(dbItems)) {
        this.items = dbItems;
        this.notify();
      }
    } catch (err) {
      console.warn("[PantryStore] Supabase fetch warning:", err);
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(fn => {
      try { fn(); } catch(e) { console.error(e); }
    });
  }

  getItems() {
    return Array.isArray(this.items) ? this.items : [];
  }

  saveItems(items) {
    this.items = items;
    if (this.userId) {
      localStorage.setItem(`smartpantry_user_pantry_${this.userId}`, JSON.stringify(items));
    }
    localStorage.setItem(this.storageKey, JSON.stringify(items));
    this.notify();
    this.checkAndDispatchPantryAlerts();
  }

  async addItem(item) {
    const resolvedEmoji = item.emoji || this.detectEmoji(item.name, item.category);
    const computedStatus = item.status || this.calculateStatus(item.expiryDate, item.quantity);

    const newItem = {
      name: item.name,
      category: item.category || "Pantry",
      quantity: Number(item.quantity) || 1,
      unit: item.unit || "pcs",
      expiryDate: item.expiryDate || "",
      purchaseDate: item.purchaseDate || "",
      barcode: item.barcode || "",
      price: Number(item.price) || 0,
      location: item.location || "Pantry",
      status: computedStatus,
      emoji: resolvedEmoji
    };

    newItem.id = item.id || 'prod_' + Date.now();
    newItem.addedAt = new Date().toISOString();

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        const saved = await window.supabaseService.insertProduct(newItem, this.userId);
        if (saved && saved.id) {
          newItem.id = saved.id;
        }
      } catch (err) {
        console.warn("[Supabase DB] Local storage active (cloud sync deferred):", err.message);
      }
    }

    this.items = [newItem, ...this.items.filter(i => i.id !== newItem.id)];
    this.saveItems(this.items);
    this.notify();
    this.checkAndDispatchPantryAlerts();
    return newItem;
  }

  async updateItem(id, updates) {
    if (updates.expiryDate !== undefined || updates.quantity !== undefined) {
      const current = this.getItemById(id);
      const exp = updates.expiryDate !== undefined ? updates.expiryDate : (current ? current.expiryDate : "");
      const qty = updates.quantity !== undefined ? updates.quantity : (current ? current.quantity : 1);
      updates.status = this.calculateStatus(exp, qty);
    }

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.updateProduct(id, updates, this.userId);
      } catch (err) {
        console.warn("[Supabase DB] Local update (cloud sync deferred):", err.message);
      }
    }

    this.items = this.items.map(item => item.id === id ? { ...item, ...updates } : item);
    this.saveItems(this.items);
    return this.getItemById(id);
  }

  async deleteItem(id) {
    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.deleteProduct(id, this.userId);
      } catch (err) {
        console.warn("[Supabase DB] Local delete (cloud sync deferred):", err.message);
      }
    }

    this.items = this.items.filter(item => item.id !== id);
    this.saveItems(this.items);
    return true;
  }

  clearAll() {
    this.items = [];
    localStorage.removeItem(this.storageKey);
    this.notify();
  }

  getItemById(id) {
    return this.getItems().find(i => String(i.id) === String(id));
  }

  getSettings() {
    try {
      const data = localStorage.getItem(this.settingsKey);
      const user = getCurrentUserInfo();
      const defaultEmail = user.email || "intellipantrynotify@gmail.com";
      return data ? JSON.parse(data) : { email: defaultEmail, alertOnStockOut: true, alertOnExpiry: true };
    } catch (e) {
      const user = getCurrentUserInfo();
      return { email: user.email || "intellipantrynotify@gmail.com", alertOnStockOut: true, alertOnExpiry: true };
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

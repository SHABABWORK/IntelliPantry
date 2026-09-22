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
  return null;
}

class PantryStore {
  constructor() {
    this.listeners = [];
    this.items = [];
    this.activity = [];
    this.alerts = [];
    this.fullSettings = null;
    this.userId = null;
    this.init();
  }

  get storageKey() {
    const user = getCurrentUserInfo();
    const uid = user ? (user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'guest')) : 'guest';
    return `smartpantry_user_pantry_${uid}`;
  }

  get settingsKey() {
    const user = getCurrentUserInfo();
    const uid = user ? (user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'guest')) : 'guest';
    return `smart_pantry_settings_${uid}`;
  }

  get fullSettingsKey() {
    const user = getCurrentUserInfo();
    const uid = user ? (user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'guest')) : 'guest';
    return `smart_pantry_full_settings_${uid}`;
  }

  get activityKey() {
    const user = getCurrentUserInfo();
    const uid = user ? (user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'guest')) : 'guest';
    return `smart_pantry_activity_${uid}`;
  }

  get alertsKey() {
    const user = getCurrentUserInfo();
    const uid = user ? (user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'guest')) : 'guest';
    return `smart_pantry_live_alerts_${uid}`;
  }

  get alertHistoryKey() {
    const user = getCurrentUserInfo();
    const uid = user ? (user.id || (user.email ? user.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'guest')) : 'guest';
    return `smart_pantry_alerts_${uid}`;
  }

  init() {
    const user = getCurrentUserInfo();
    this.userId = user ? (user.id || null) : null;

    if (!this.userId) {
      this.items = [];
      this.activity = [];
      this.alerts = [];
      return;
    }

    // 1. Initial synchronous cache loads (isolated per user)
    if (this.userId && window.supabaseService) {
      this.items = window.supabaseService.getLocalUserProducts(this.userId);
    } else {
      const cached = localStorage.getItem(this.storageKey);
      this.items = cached ? JSON.parse(cached) : [];
    }

    try {
      const cachedAct = localStorage.getItem(this.activityKey);
      this.activity = cachedAct ? JSON.parse(cachedAct) : [];
    } catch(e) { this.activity = []; }

    try {
      const cachedAlerts = localStorage.getItem(this.alertsKey);
      this.alerts = cachedAlerts ? JSON.parse(cachedAlerts) : [];
    } catch(e) { this.alerts = []; }

    // 2. Initialize default full settings
    this.loadLocalFullSettings();

    // 3. Fetch from Supabase Cloud Database asynchronously
    this.fetchFromSupabase();
    this.fetchSettingsFromSupabase();
    this.fetchActivityFromSupabase();
    this.fetchAlertsFromSupabase();

    // 4. Realtime Channels
    if (this.userId && window.supabaseService) {
      window.supabaseService.subscribeToUserProducts(this.userId, () => {
        this.fetchFromSupabase();
      });
      window.supabaseService.subscribeToUserActivity(this.userId, () => {
        this.fetchActivityFromSupabase();
      });
      window.supabaseService.subscribeToUserAlerts(this.userId, () => {
        this.fetchAlertsFromSupabase();
      });
    }

    // 5. Compute dynamic pantry alerts on startup
    setTimeout(() => {
      this.syncAlertsFromPantry();
      this.checkAndDispatchPantryAlerts();
      this.updateAlertBadge();
    }, 1200);
  }

  loadLocalFullSettings() {
    const user = getCurrentUserInfo();
    const defaultSettings = {
      preferences: {
        alert_expiry: true,
        alert_expired: true,
        alert_low_stock: true,
        alert_security: true,
        alert_weekly_summary: false
      },
      pantry_settings: {
        expiry_warning_days: 7,
        low_stock_threshold: 2,
        default_unit: "pcs",
        default_category: "Pantry"
      },
      general_settings: {
        language: "English",
        timezone: "Asia/Kolkata",
        currency: "INR",
        date_format: "DD/MM/YYYY",
        theme: "light"
      }
    };

    try {
      const raw = localStorage.getItem(this.fullSettingsKey);
      if (raw) {
        this.fullSettings = { ...defaultSettings, ...JSON.parse(raw) };
      } else {
        this.fullSettings = defaultSettings;
        localStorage.setItem(this.fullSettingsKey, JSON.stringify(defaultSettings));
      }
    } catch(e) {
      this.fullSettings = defaultSettings;
    }

    // Compatibility for legacy getSettings()
    const setKey = this.settingsKey;
    if (!localStorage.getItem(setKey)) {
      localStorage.setItem(setKey, JSON.stringify({
        email: user ? (user.email || "intellipantrynotify@gmail.com") : "intellipantrynotify@gmail.com",
        alertOnStockOut: true,
        alertOnExpiry: true
      }));
    }
  }

  async fetchFromSupabase() {
    if (!this.userId || !window.supabaseService) return;
    try {
      const dbItems = await window.supabaseService.getProducts(this.userId);
      if (Array.isArray(dbItems)) {
        this.items = dbItems;
        this.syncAlertsFromPantry();
        this.notify();
      }
    } catch (err) {
      console.warn("[PantryStore] Supabase fetch warning:", err);
    }
  }

  async fetchSettingsFromSupabase() {
    if (!this.userId || !window.supabaseService) return;
    try {
      const dbSettings = await window.supabaseService.getUserSettings(this.userId);
      if (dbSettings) {
        if (dbSettings.preferences) this.fullSettings.preferences = { ...this.fullSettings.preferences, ...dbSettings.preferences };
        if (dbSettings.pantry_settings) this.fullSettings.pantry_settings = { ...this.fullSettings.pantry_settings, ...dbSettings.pantry_settings };
        if (dbSettings.general_settings) this.fullSettings.general_settings = { ...this.fullSettings.general_settings, ...dbSettings.general_settings };
        localStorage.setItem(this.fullSettingsKey, JSON.stringify(this.fullSettings));
        this.applyTheme(this.fullSettings.general_settings?.theme || 'light');
        this.notify();
      }
    } catch (err) {
      console.warn("[PantryStore] Supabase settings fetch warning:", err);
    }
  }

  async fetchActivityFromSupabase() {
    if (!this.userId || !window.supabaseService) return;
    try {
      const dbActivity = await window.supabaseService.getActivity(this.userId, 50);
      if (Array.isArray(dbActivity) && dbActivity.length > 0) {
        this.activity = dbActivity;
        localStorage.setItem(this.activityKey, JSON.stringify(this.activity));
        this.notify();
      }
    } catch (err) {
      console.warn("[PantryStore] Supabase activity fetch warning:", err);
    }
  }

  async fetchAlertsFromSupabase() {
    if (!this.userId || !window.supabaseService) return;
    try {
      const dbAlerts = await window.supabaseService.getAlerts(this.userId);
      if (Array.isArray(dbAlerts)) {
        this.alerts = dbAlerts;
        localStorage.setItem(this.alertsKey, JSON.stringify(this.alerts));
        this.updateAlertBadge();
        this.notify();
      }
    } catch (err) {
      console.warn("[PantryStore] Supabase alerts fetch warning:", err);
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
    this.updateAlertBadge();
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
    this.syncAlertsFromPantry();
    this.notify();
    this.checkAndDispatchPantryAlerts();
  }

  // ==========================================
  // PANTRY CRUD WITH AUTOMATED ACTIVITY LOGGING
  // ==========================================

  async addItem(item) {
    const resolvedEmoji = item.emoji || this.detectEmoji(item.name, item.category);
    const computedStatus = item.status || this.calculateStatus(item.expiryDate, item.quantity);

    const newItem = {
      name: item.name,
      category: item.category || "Pantry",
      quantity: Number(item.quantity) || 1,
      unit: item.unit || "pcs",
      expiryDate: item.expiryDate || "",
      purchaseDate: item.purchaseDate || getTodayISO(),
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

    // Log Activity
    await this.logActivity(
      'added',
      newItem.id,
      newItem.name,
      `Added ${newItem.quantity} ${newItem.unit} to ${newItem.category}`
    );

    return newItem;
  }

  async updateItem(id, updates) {
    const current = this.getItemById(id);
    const oldQty = current ? Number(current.quantity) : 1;
    const newQty = updates.quantity !== undefined ? Number(updates.quantity) : oldQty;

    if (updates.expiryDate !== undefined || updates.quantity !== undefined) {
      const exp = updates.expiryDate !== undefined ? updates.expiryDate : (current ? current.expiryDate : "");
      updates.status = this.calculateStatus(exp, newQty);
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

    // Log Activity (Distinguish quantity changes from info edits)
    const isQtyChange = updates.quantity !== undefined && oldQty !== newQty;
    const action = isQtyChange ? 'quantity_changed' : 'updated';
    const details = isQtyChange 
      ? `Quantity adjusted from ${oldQty} to ${newQty} ${updates.unit || (current ? current.unit : 'pcs')}`
      : `Updated product information`;

    await this.logActivity(
      action,
      id,
      current ? current.name : 'Item',
      details
    );

    return this.getItemById(id);
  }

  async deleteItem(id) {
    const item = this.getItemById(id);
    const itemName = item ? item.name : 'Product';

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.deleteProduct(id, this.userId);
      } catch (err) {
        console.warn("[Supabase DB] Local delete (cloud sync deferred):", err.message);
      }
    }

    this.items = this.items.filter(item => item.id !== id);
    this.saveItems(this.items);

    // Log Activity
    await this.logActivity('deleted', id, itemName, `Removed from pantry`);
    return true;
  }

  clearAll() {
    this.items = [];
    localStorage.removeItem(this.storageKey);
    this.logActivity('deleted', 'all', 'All Products', 'Pantry inventory reset');
    this.notify();
  }

  getItemById(id) {
    return this.getItems().find(i => String(i.id) === String(id));
  }

  // ==========================================
  // ACTIVITY ENGINE
  // ==========================================

  async logActivity(action, productId, productName, details) {
    const entry = {
      id: 'act_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      action: action || 'updated',
      product_id: productId ? String(productId) : null,
      product_name: productName || 'Product',
      details: details || '',
      created_at: new Date().toISOString()
    };

    this.activity = [entry, ...this.activity.slice(0, 99)];
    try {
      localStorage.setItem(this.activityKey, JSON.stringify(this.activity));
    } catch(e) {}

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.logActivity(this.userId, {
          action: entry.action,
          productId: entry.product_id,
          productName: entry.product_name,
          details: entry.details
        });
      } catch(err) {
        console.warn("[Pantry Activity] Sync error:", err.message);
      }
    }

    this.notify();
  }

  getActivity(timeframe = 'all') {
    const all = Array.isArray(this.activity) ? this.activity : [];
    if (timeframe === 'all') return all;

    const cutoffMs = this.getCutoffTimestamp(timeframe);
    return all.filter(a => new Date(a.created_at || a.createdAt || Date.now()).getTime() >= cutoffMs);
  }

  // ==========================================
  // REAL-TIME ALERT CENTER ENGINE
  // ==========================================

  getAlerts(filter = 'all') {
    const all = Array.isArray(this.alerts) ? this.alerts : [];
    if (filter === 'unread') return all.filter(a => !a.is_read);
    if (filter === 'expiry') return all.filter(a => a.type === 'expiry');
    if (filter === 'low_stock') return all.filter(a => a.type === 'low_stock');
    if (filter === 'security') return all.filter(a => a.type === 'security');
    return all;
  }

  getUnreadAlertsCount() {
    return this.getAlerts('unread').length;
  }

  updateAlertBadge() {
    const unreadCount = this.getUnreadAlertsCount();
    const badges = document.querySelectorAll('.noti-badge, #topbarAlertBadge');
    badges.forEach(b => {
      b.textContent = unreadCount;
      b.style.display = unreadCount > 0 ? 'flex' : 'none';
    });
  }

  syncAlertsFromPantry() {
    const items = this.getItems();
    const settings = this.getFullSettings();
    const warningDays = settings.pantry_settings?.expiry_warning_days || 7;
    const threshold = settings.pantry_settings?.low_stock_threshold || 2;
    const alertsPref = settings.preferences || {};

    const existingAlertsMap = {};
    (this.alerts || []).forEach(a => {
      if (a.product_id) existingAlertsMap[a.product_id + '_' + a.type] = a;
    });

    const newAlerts = [];

    items.forEach(item => {
      const diffDays = getDaysDifference(item.expiryDate);
      const qty = Number(item.quantity) || 0;

      // 1. Expired alert
      if (diffDays !== null && diffDays < 0 && alertsPref.alert_expired !== false) {
        const key = item.id + '_expiry_expired';
        const existing = existingAlertsMap[key];
        newAlerts.push({
          id: existing ? existing.id : 'al_' + key,
          product_id: item.id,
          type: 'expiry',
          title: 'Product Expired',
          message: `"${item.name}" expired ${Math.abs(diffDays)} day(s) ago (${item.expiryDate}).`,
          is_read: existing ? existing.is_read : false,
          created_at: existing ? existing.created_at : new Date().toISOString()
        });
      }
      // 2. Expiring soon alert
      else if (diffDays !== null && diffDays >= 0 && diffDays <= warningDays && alertsPref.alert_expiry !== false) {
        const key = item.id + '_expiry_soon';
        const existing = existingAlertsMap[key];
        const dayLabel = diffDays === 0 ? 'today' : (diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`);
        newAlerts.push({
          id: existing ? existing.id : 'al_' + key,
          product_id: item.id,
          type: 'expiry',
          title: 'Expiring Soon',
          message: `"${item.name}" expires ${dayLabel} (${item.expiryDate}).`,
          is_read: existing ? existing.is_read : false,
          created_at: existing ? existing.created_at : new Date().toISOString()
        });
      }

      // 3. Out of stock alert
      if (qty <= 0 && alertsPref.alert_low_stock !== false) {
        const key = item.id + '_out_of_stock';
        const existing = existingAlertsMap[key];
        newAlerts.push({
          id: existing ? existing.id : 'al_' + key,
          product_id: item.id,
          type: 'low_stock',
          title: 'Out of Stock',
          message: `"${item.name}" is completely out of stock. Add to your shopping list!`,
          is_read: existing ? existing.is_read : false,
          created_at: existing ? existing.created_at : new Date().toISOString()
        });
      }
      // 4. Low stock alert
      else if (qty > 0 && qty <= threshold && alertsPref.alert_low_stock !== false) {
        const key = item.id + '_low_stock';
        const existing = existingAlertsMap[key];
        newAlerts.push({
          id: existing ? existing.id : 'al_' + key,
          product_id: item.id,
          type: 'low_stock',
          title: 'Low Stock Alert',
          message: `"${item.name}" is low (${qty} ${item.unit} left). Threshold is ${threshold}.`,
          is_read: existing ? existing.is_read : false,
          created_at: existing ? existing.created_at : new Date().toISOString()
        });
      }
    });

    // Retain manual system/security alerts
    const systemAlerts = (this.alerts || []).filter(a => a.type === 'security' || a.type === 'system');
    this.alerts = [...newAlerts, ...systemAlerts];

    try {
      localStorage.setItem(this.alertsKey, JSON.stringify(this.alerts));
    } catch(e) {}

    this.updateAlertBadge();
  }

  async markAlertRead(alertId) {
    this.alerts = this.alerts.map(a => a.id === alertId ? { ...a, is_read: true } : a);
    try {
      localStorage.setItem(this.alertsKey, JSON.stringify(this.alerts));
    } catch(e) {}

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.markAlertAsRead(alertId, this.userId);
      } catch(e) {}
    }

    this.updateAlertBadge();
    this.notify();
  }

  async markAllAlertsRead() {
    this.alerts = this.alerts.map(a => ({ ...a, is_read: true }));
    try {
      localStorage.setItem(this.alertsKey, JSON.stringify(this.alerts));
    } catch(e) {}

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.markAllAlertsAsRead(this.userId);
      } catch(e) {}
    }

    this.updateAlertBadge();
    this.notify();
  }

  async deleteAlert(alertId) {
    this.alerts = this.alerts.filter(a => a.id !== alertId);
    try {
      localStorage.setItem(this.alertsKey, JSON.stringify(this.alerts));
    } catch(e) {}

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.deleteAlert(alertId, this.userId);
      } catch(e) {}
    }

    this.updateAlertBadge();
    this.notify();
  }

  // ==========================================
  // SETTINGS & APPEARANCE
  // ==========================================

  getFullSettings() {
    if (!this.fullSettings) {
      this.loadLocalFullSettings();
    }
    return this.fullSettings;
  }

  async saveFullSettings(newSettings) {
    this.fullSettings = {
      preferences: { ...this.fullSettings.preferences, ...(newSettings.preferences || {}) },
      pantry_settings: { ...this.fullSettings.pantry_settings, ...(newSettings.pantry_settings || {}) },
      general_settings: { ...this.fullSettings.general_settings, ...(newSettings.general_settings || {}) }
    };

    try {
      localStorage.setItem(this.fullSettingsKey, JSON.stringify(this.fullSettings));
    } catch(e) {}

    // Legacy sync
    const user = getCurrentUserInfo();
    this.saveSettings({
      email: user.email || "intellipantrynotify@gmail.com",
      alertOnStockOut: this.fullSettings.preferences.alert_low_stock !== false,
      alertOnExpiry: this.fullSettings.preferences.alert_expiry !== false
    });

    if (this.userId && window.supabaseService && window.supabaseService.isReady()) {
      try {
        await window.supabaseService.saveUserSettings(this.userId, this.fullSettings);
      } catch(e) {
        console.warn("[PantryStore] Settings cloud save warning:", e);
      }
    }

    // Apply Theme
    this.applyTheme(this.fullSettings.general_settings?.theme || 'light');
    this.syncAlertsFromPantry();
    this.notify();
  }

  applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark-theme');
    } else if (theme === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark-theme');
      } else {
        root.classList.remove('dark-theme');
      }
    } else {
      root.classList.remove('dark-theme');
    }
  }

  // ==========================================
  // DATA EXPORT (JSON DOWNLOAD)
  // ==========================================

  exportUserData() {
    const user = getCurrentUserInfo();
    const exportBundle = {
      app: "IntelliPantry",
      version: "1.0",
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      settings: this.getFullSettings(),
      pantryProductsCount: this.items.length,
      pantryProducts: this.items,
      recentActivity: this.activity,
      alerts: this.alerts
    };

    const jsonStr = JSON.stringify(exportBundle, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intellipantry_backup_${getTodayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // DYNAMIC TIMEFRAME INSIGHTS ENGINE
  // ==========================================

  getCutoffTimestamp(timeframe) {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    if (timeframe === '7d') return now - (7 * DAY_MS);
    if (timeframe === '30d') return now - (30 * DAY_MS);
    if (timeframe === '3m') return now - (90 * DAY_MS);
    if (timeframe === '1y') return now - (365 * DAY_MS);
    return 0; // 'all'
  }

  getInsightsData(timeframe = '30d') {
    const items = this.getItems();
    const settings = this.getFullSettings();
    const warningDays = settings.pantry_settings?.expiry_warning_days || 7;
    const threshold = settings.pantry_settings?.low_stock_threshold || 2;
    const cutoffMs = this.getCutoffTimestamp(timeframe);

    // Filter items based on timeframe (by purchaseDate, addedAt or createdAt)
    const filteredItems = items.filter(item => {
      if (timeframe === 'all') return true;
      const dateStr = item.addedAt || item.purchaseDate || item.createdAt;
      if (!dateStr) return true;
      const itemTime = new Date(dateStr).getTime();
      return isNaN(itemTime) || itemTime >= cutoffMs;
    });

    const totalProducts = filteredItems.length;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let normalStockCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;

    let within3Days = 0;
    let within7Days = 0;
    let within30Days = 0;
    let alreadyExpired = 0;

    let totalUnits = 0;
    const categoryCounts = {};
    const lowStockNames = [];
    const expiringSoonNames = [];

    filteredItems.forEach(item => {
      const qty = Number(item.quantity) || 0;
      totalUnits += qty;

      // Category count (only for present categories)
      const cat = item.category || "Pantry";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      // Expiry calculations
      const diffDays = getDaysDifference(item.expiryDate);

      if (diffDays !== null) {
        if (diffDays < 0) {
          alreadyExpired++;
          expiredCount++;
        } else if (diffDays <= 3) {
          within3Days++;
          expiringSoonCount++;
          expiringSoonNames.push(item.name);
        } else if (diffDays <= 7) {
          within7Days++;
          if (warningDays >= 7) expiringSoonCount++;
          expiringSoonNames.push(item.name);
        } else if (diffDays <= 30) {
          within30Days++;
          if (warningDays >= 30) expiringSoonCount++;
        }
      }

      // Stock calculations
      if (qty <= 0) {
        outOfStockCount++;
        lowStockCount++;
        lowStockNames.push(item.name);
      } else if (qty <= threshold) {
        lowStockCount++;
        lowStockNames.push(item.name);
      } else {
        normalStockCount++;
      }
    });

    // Filtered activity feed
    const filteredActivity = this.getActivity(timeframe);

    // Smart contextual insights
    const smartInsights = [];
    if (totalProducts === 0) {
      smartInsights.push("🥣 Your pantry is currently empty. Add your first product to generate real-time analytics.");
    } else {
      if (alreadyExpired > 0) {
        smartInsights.push(`⚠️ You have ${alreadyExpired} expired product(s) that should be reviewed or safely removed.`);
      }
      if (within3Days > 0) {
        smartInsights.push(`🚨 ${within3Days} product(s) expire within the next 3 days. Prioritize cooking them today.`);
      } else if (expiringSoonCount > 0) {
        smartInsights.push(`⏳ You have ${expiringSoonCount} product(s) expiring within your ${warningDays}-day alert window.`);
      }
      if (outOfStockCount > 0) {
        smartInsights.push(`🛒 ${outOfStockCount} product(s) are completely out of stock. Check your shopping list.`);
      } else if (lowStockCount > 0) {
        const topLow = lowStockNames.slice(0, 2).join(', ');
        smartInsights.push(`📦 ${topLow}${lowStockNames.length > 2 ? ` and ${lowStockNames.length - 2} other(s)` : ''} are low in stock (≤ ${threshold} threshold).`);
      }
      if (smartInsights.length === 0) {
        smartInsights.push(`✅ All ${totalProducts} tracked item(s) are fresh and well-stocked across ${Object.keys(categoryCounts).length} category/categories.`);
      }
    }

    return {
      timeframe,
      totalProducts,
      totalUnits,
      lowStockCount,
      outOfStockCount,
      normalStockCount,
      expiringSoonCount,
      expiredCount,
      totalCategories: Object.keys(categoryCounts).length,
      recentlyAddedCount: filteredItems.filter(i => {
        const d = new Date(i.addedAt || i.purchaseDate || Date.now()).getTime();
        return Date.now() - d <= (7 * 24 * 60 * 60 * 1000);
      }).length,
      categoryCounts,
      expiryBreakdown: {
        within3Days,
        within7Days,
        within30Days,
        alreadyExpired
      },
      stockBreakdown: {
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
        normalStock: normalStockCount
      },
      activityList: filteredActivity,
      smartInsights
    };
  }

  // ==========================================
  // LEGACY COMPATIBILITY METHODS
  // ==========================================

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


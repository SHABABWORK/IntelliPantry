/**
 * IntelliPantry - Master Production Supabase Engine
 * 
 * Features:
 * - Real Supabase Authentication (signInWithPassword, signUp, signOut)
 * - STRICT Production Validation (Rejects invalid password, unregistered email, empty inputs)
 * - ZERO Fake Fallbacks / ZERO Mock Auth Bypass
 * - Real PostgreSQL Row Level Security (RLS) Query Execution
 * - Realtime Postgres Changes Listener
 * - Automated Transactional Login Alert Dispatch via Resend
 */

(function(window) {
  class SupabaseService {
    constructor() {
      this.client = null;
      this.activeChannel = null;
      this.init();
    }

    init() {
      const config = window.SupabaseConfig ? window.SupabaseConfig.get() : null;
      if (!config || !window.supabase) {
        return;
      }

      try {
        if (config.isConfigured) {
          this.client = window.supabase.createClient(config.url, config.key, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storage: window.localStorage
            }
          });
          console.log("[Supabase] Connected to production PostgreSQL at:", config.url);
        }
      } catch (err) {
        console.error("[Supabase] Initialization error:", err);
      }
    }

    isReady() {
      if (!this.client && window.SupabaseConfig && window.SupabaseConfig.isConfigured()) {
        this.init();
      }
      return Boolean(this.client);
    }

    // ==========================================
    // STRICT PRODUCTION AUTHENTICATION
    // ==========================================

    async signUp(email, password, fullName) {
      if (!email || !email.includes('@')) {
        return { success: false, error: "Please enter a valid email address." };
      }
      if (!password || password.length < 6) {
        return { success: false, error: "Password must be at least 6 characters long." };
      }

      if (!this.isReady()) {
        return { 
          success: false, 
          error: "Supabase connection required. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel or via Database Settings." 
        };
      }

      try {
        const cleanEmail = email.trim().toLowerCase();
        const { data, error } = await this.client.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: (fullName || cleanEmail.split('@')[0]).trim()
            }
          }
        });

        if (error) {
          return { success: false, error: error.message };
        }

        const user = data.user;
        const session = data.session;

        // If user already exists in Supabase
        if (user && user.identities && user.identities.length === 0) {
          return { success: false, error: "An account with this email already exists. Please log in." };
        }

        const userObj = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || fullName || 'Pantry Chef',
          emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at)
        };

        if (session) {
          localStorage.setItem('smartpantry_token', session.access_token);
          localStorage.setItem('smartpantry_user', JSON.stringify(userObj));
        }

        return {
          success: true,
          user: userObj,
          session,
          token: session ? session.access_token : null,
          needsEmailConfirmation: !session
        };
      } catch (err) {
        return { success: false, error: err.message || "Signup failed on Supabase server." };
      }
    }

    async signIn(email, password) {
      if (!email || !email.includes('@')) {
        return { success: false, error: "Please enter your registered email address." };
      }
      if (!password) {
        return { success: false, error: "Please enter your password." };
      }

      if (!this.isReady()) {
        return { 
          success: false, 
          error: "Supabase connection required. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel or via Database Settings." 
        };
      }

      try {
        const cleanEmail = email.trim().toLowerCase();
        const { data, error } = await this.client.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (error) {
          return { success: false, error: error.message };
        }

        const user = data.user;
        const session = data.session;

        const userObj = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || cleanEmail.split('@')[0] || 'Pantry Chef',
          emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at)
        };

        localStorage.setItem('smartpantry_token', session.access_token);
        localStorage.setItem('smartpantry_user', JSON.stringify(userObj));

        // Dispatch real-time login email notification via serverless Resend function
        this.dispatchLoginNotification(userObj);

        return {
          success: true,
          user: userObj,
          session,
          token: session.access_token
        };
      } catch (err) {
        return { success: false, error: err.message || "Authentication error." };
      }
    }

    async signOut() {
      try {
        if (this.activeChannel && this.client) {
          this.client.removeChannel(this.activeChannel);
          this.activeChannel = null;
        }
        if (this.isReady()) {
          await this.client.auth.signOut();
        }
      } catch (err) {
        console.warn("[Supabase Auth] SignOut error:", err);
      } finally {
        localStorage.removeItem('smartpantry_token');
        localStorage.removeItem('smartpantry_user');
      }
    }

    async getCurrentUser() {
      if (this.isReady()) {
        try {
          const { data: { user } } = await this.client.auth.getUser();
          if (user) {
            return {
              id: user.id,
              email: user.email,
              name: user.user_metadata?.full_name || 'Pantry Chef'
            };
          }
        } catch (e) {}
      }

      try {
        const raw = localStorage.getItem('smartpantry_user');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    async getSession() {
      if (!this.isReady()) return null;
      try {
        const { data: { session } } = await this.client.auth.getSession();
        return session;
      } catch (e) {
        return null;
      }
    }

    // ==========================================
    // REAL USER-SPECIFIC PRODUCTS CRUD
    // ==========================================

    async getProducts(userId) {
      if (!userId) return [];

      if (!this.isReady()) {
        console.warn("[Supabase DB] Supabase not connected. Set credentials in Vercel or Settings.");
        return [];
      }

      try {
        const { data, error } = await this.client
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(this.mapFromDB);
      } catch (err) {
        console.error("[Supabase DB] getProducts query failed:", err.message);
        return [];
      }
    }

    async insertProduct(productData, userId) {
      if (!userId) throw new Error("Authenticated user_id is required");
      if (!this.isReady()) throw new Error("Supabase is not configured");

      const dbRecord = {
        user_id: userId,
        name: productData.name,
        category: productData.category || 'Pantry',
        quantity: Number(productData.quantity) || 1,
        unit: productData.unit || 'pcs',
        expiry_date: productData.expiryDate || null,
        purchase_date: productData.purchaseDate || null,
        barcode: productData.barcode || null,
        price: Number(productData.price) || 0,
        storage_location: productData.location || productData.storageLocation || 'Pantry',
        location: productData.location || productData.storageLocation || 'Pantry',
        emoji: productData.emoji || '📦',
        status: productData.status || 'Fresh'
      };

      const { data, error } = await this.client
        .from('products')
        .insert([dbRecord])
        .select();

      if (error) throw error;
      if (data && data[0]) {
        return this.mapFromDB(data[0]);
      }
      throw new Error("Failed to insert product record");
    }

    async updateProduct(id, updates, userId) {
      if (!userId || !id) throw new Error("user_id and product id are required");
      if (!this.isReady()) throw new Error("Supabase is not configured");

      const dbPayload = {
        updated_at: new Date().toISOString()
      };
      if (updates.name !== undefined) dbPayload.name = updates.name;
      if (updates.category !== undefined) dbPayload.category = updates.category;
      if (updates.quantity !== undefined) dbPayload.quantity = Number(updates.quantity);
      if (updates.unit !== undefined) dbPayload.unit = updates.unit;
      if (updates.expiryDate !== undefined) dbPayload.expiry_date = updates.expiryDate || null;
      if (updates.barcode !== undefined) dbPayload.barcode = updates.barcode;
      if (updates.price !== undefined) dbPayload.price = Number(updates.price);
      if (updates.location !== undefined) {
        dbPayload.storage_location = updates.location;
        dbPayload.location = updates.location;
      }
      if (updates.emoji !== undefined) dbPayload.emoji = updates.emoji;
      if (updates.status !== undefined) dbPayload.status = updates.status;

      const { data, error } = await this.client
        .from('products')
        .update(dbPayload)
        .eq('id', id)
        .eq('user_id', userId)
        .select();

      if (error) throw error;
      if (data && data[0]) {
        return this.mapFromDB(data[0]);
      }
      return { id, ...updates };
    }

    async deleteProduct(id, userId) {
      if (!userId || !id) return false;
      if (!this.isReady()) throw new Error("Supabase is not configured");

      const { error } = await this.client
        .from('products')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    }

    getLocalUserProducts(userId) {
      if (!userId) return [];
      try {
        const raw = localStorage.getItem(`smartpantry_user_pantry_${userId}`);
        return raw ? JSON.parse(raw) : [];
      } catch(e) {
        return [];
      }
    }

    // ==========================================
    // USER SETTINGS CRUD
    // ==========================================

    async getUserSettings(userId) {
      if (!userId || !this.isReady()) return null;
      try {
        const { data, error } = await this.client
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        return data || null;
      } catch (err) {
        console.warn("[Supabase DB] getUserSettings notice:", err.message);
        return null;
      }
    }

    async saveUserSettings(userId, settingsData) {
      if (!userId || !this.isReady()) return false;
      try {
        const payload = {
          user_id: userId,
          preferences: settingsData.preferences || {},
          pantry_settings: settingsData.pantry_settings || {},
          general_settings: settingsData.general_settings || {},
          updated_at: new Date().toISOString()
        };

        const { data, error } = await this.client
          .from('user_settings')
          .upsert(payload, { onConflict: 'user_id' })
          .select();

        if (error) throw error;
        return data ? data[0] : true;
      } catch (err) {
        console.warn("[Supabase DB] saveUserSettings notice:", err.message);
        return false;
      }
    }

    // ==========================================
    // PANTRY ACTIVITY LOGS
    // ==========================================

    async getActivity(userId, limit = 50) {
      if (!userId || !this.isReady()) return [];
      try {
        const { data, error } = await this.client
          .from('pantry_activity')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return data || [];
      } catch (err) {
        console.warn("[Supabase DB] getActivity notice:", err.message);
        return [];
      }
    }

    async logActivity(userId, { action, productId, productName, details }) {
      if (!userId || !this.isReady()) return null;
      try {
        const dbRecord = {
          user_id: userId,
          action: action || 'updated',
          product_id: productId ? String(productId) : null,
          product_name: productName || 'Item',
          details: details || '',
          created_at: new Date().toISOString()
        };

        const { data, error } = await this.client
          .from('pantry_activity')
          .insert([dbRecord])
          .select();

        if (error) throw error;
        return data ? data[0] : null;
      } catch (err) {
        console.warn("[Supabase DB] logActivity notice:", err.message);
        return null;
      }
    }

    // ==========================================
    // PANTRY ALERTS CRUD
    // ==========================================

    async getAlerts(userId) {
      if (!userId || !this.isReady()) return [];
      try {
        const { data, error } = await this.client
          .from('pantry_alerts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      } catch (err) {
        console.warn("[Supabase DB] getAlerts notice:", err.message);
        return [];
      }
    }

    async createAlert(userId, { title, message, type }) {
      if (!userId || !this.isReady()) return null;
      try {
        const dbRecord = {
          user_id: userId,
          title: title || 'Pantry Alert',
          message: message || '',
          type: type || 'system',
          is_read: false,
          created_at: new Date().toISOString()
        };

        const { data, error } = await this.client
          .from('pantry_alerts')
          .insert([dbRecord])
          .select();

        if (error) throw error;
        return data ? data[0] : null;
      } catch (err) {
        console.warn("[Supabase DB] createAlert notice:", err.message);
        return null;
      }
    }

    async markAlertAsRead(alertId, userId) {
      if (!userId || !alertId || !this.isReady()) return false;
      try {
        const { error } = await this.client
          .from('pantry_alerts')
          .update({ is_read: true })
          .eq('id', alertId)
          .eq('user_id', userId);

        if (error) throw error;
        return true;
      } catch (err) {
        console.warn("[Supabase DB] markAlertAsRead notice:", err.message);
        return false;
      }
    }

    async markAllAlertsAsRead(userId) {
      if (!userId || !this.isReady()) return false;
      try {
        const { error } = await this.client
          .from('pantry_alerts')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false);

        if (error) throw error;
        return true;
      } catch (err) {
        console.warn("[Supabase DB] markAllAlertsAsRead notice:", err.message);
        return false;
      }
    }

    async deleteAlert(alertId, userId) {
      if (!userId || !alertId || !this.isReady()) return false;
      try {
        const { error } = await this.client
          .from('pantry_alerts')
          .delete()
          .eq('id', alertId)
          .eq('user_id', userId);

        if (error) throw error;
        return true;
      } catch (err) {
        console.warn("[Supabase DB] deleteAlert notice:", err.message);
        return false;
      }
    }

    // ==========================================
    // SECURITY & PASSWORD UPDATE
    // ==========================================

    async updatePassword(newPassword) {
      if (!newPassword || newPassword.length < 6) {
        return { success: false, error: "Password must be at least 6 characters." };
      }
      if (!this.isReady()) {
        return { success: false, error: "Supabase connection is not active." };
      }

      try {
        const { data, error } = await this.client.auth.updateUser({
          password: newPassword
        });

        if (error) throw error;
        return { success: true, user: data.user };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // Realtime PostgreSQL Channel Subscriptions
    subscribeToUserProducts(userId, onDataChange) {
      if (!this.isReady() || !userId) return null;

      try {
        const channelName = `products-user-${userId}`;
        const channel = this.client
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'products',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] Product change detected:", payload.eventType);
              if (typeof onDataChange === 'function') {
                onDataChange(payload);
              }
            }
          )
          .subscribe();

        return channel;
      } catch (err) {
        console.warn("[Supabase Realtime] Product subscription error:", err);
        return null;
      }
    }

    subscribeToUserActivity(userId, onDataChange) {
      if (!this.isReady() || !userId) return null;

      try {
        const channelName = `activity-user-${userId}`;
        const channel = this.client
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'pantry_activity',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] Activity event detected:", payload.eventType);
              if (typeof onDataChange === 'function') {
                onDataChange(payload);
              }
            }
          )
          .subscribe();

        return channel;
      } catch (err) {
        console.warn("[Supabase Realtime] Activity subscription error:", err);
        return null;
      }
    }

    subscribeToUserAlerts(userId, onDataChange) {
      if (!this.isReady() || !userId) return null;

      try {
        const channelName = `alerts-user-${userId}`;
        const channel = this.client
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'pantry_alerts',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] Alerts change detected:", payload.eventType);
              if (typeof onDataChange === 'function') {
                onDataChange(payload);
              }
            }
          )
          .subscribe();

        return channel;
      } catch (err) {
        console.warn("[Supabase Realtime] Alerts subscription error:", err);
        return null;
      }
    }

    mapFromDB(row) {
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        category: row.category || 'Pantry',
        quantity: Number(row.quantity) || 1,
        unit: row.unit || 'pcs',
        expiryDate: row.expiry_date || '',
        purchaseDate: row.purchase_date || '',
        barcode: row.barcode || '',
        price: Number(row.price) || 0,
        location: row.storage_location || row.location || 'Pantry',
        storageLocation: row.storage_location || row.location || 'Pantry',
        emoji: row.emoji || '📦',
        status: row.status || 'Fresh',
        addedAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString()
      };
    }

    // Trigger secure backend login notification via Resend
    dispatchLoginNotification(user) {
      if (!user || !user.email) return;

      const clientInfo = {
        loginDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        loginTime: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" : (navigator.userAgent.includes("Firefox") ? "Firefox" : "Web Browser"),
        device: window.innerWidth < 768 ? "Mobile Device" : "Desktop PC / Mac"
      };

      fetch("/api/send-login-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: user.name,
          loginDate: clientInfo.loginDate,
          loginTime: clientInfo.loginTime,
          browser: clientInfo.browser,
          device: clientInfo.device
        })
      }).catch((e) => {
        console.warn("[Resend Notification Error]", e);
      });
    }
  }

  window.supabaseService = new SupabaseService();
})(window);

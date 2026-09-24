/**
 * IntelliPantry - Master Production Supabase Engine
 * 
 * Features:
 * - Real Supabase Authentication (signInWithPassword, signUp, signOut, getSession, onAuthStateChange)
 * - Strict User Isolation & Permanent Source of Truth in Supabase
 * - Auto Profile Association (profiles table)
 * - Pantry Products CRUD (pantry_products table) with RLS
 * - Alerts CRUD (alerts table) with RLS
 * - Notification Preferences (notification_preferences table) with RLS
 * - Activity Logs (activity_logs table) with RLS
 * - Supabase Realtime WebSocket Subscriptions for live updates
 * - Clean unsubscribe on logout/user switch
 * - Serverless Resend Login Notifications
 */

(function(window) {
  class SupabaseService {
    constructor() {
      this.client = null;
      this.activeChannels = {};
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
          window.supabaseClient = this.client;
          console.log("[Supabase] Connected to live PostgreSQL database at:", config.url);
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

    // Secure helper: Always extract authenticated user's real Supabase Auth UUID
    async getAuthenticatedUserId(fallbackId = null) {
      if (this.isReady()) {
        try {
          const { data: { session } } = await this.client.auth.getSession();
          if (session && session.user && session.user.id) {
            return session.user.id;
          }
        } catch (e) {}

        try {
          const { data: { user } } = await this.client.auth.getUser();
          if (user && user.id) return user.id;
        } catch (e) {}
      }

      try {
        const raw = localStorage.getItem('smartpantry_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u && u.id) return u.id;
        }
      } catch (e) {}

      if (fallbackId && typeof fallbackId === 'string' && fallbackId.length > 5) {
        return fallbackId;
      }

      return null;
    }

    // ==========================================
    // 1. REAL SUPABASE AUTHENTICATION
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
          error: "Supabase connection required. Configure your Supabase project URL and anon key." 
        };
      }

      try {
        const cleanEmail = email.trim().toLowerCase();
        const cleanName = (fullName || cleanEmail.split('@')[0]).trim();

        const redirectUrl = `${window.location.origin}/login.html`;
        const { data, error } = await this.client.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              full_name: cleanName
            }
          }
        });

        if (error) {
          let friendlyError = error.message;
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('user already registered') || msg.includes('already exists')) {
            friendlyError = "An account with this email already exists. Please log in.";
          } else if (msg.includes('sending confirmation email') || msg.includes('confirmation email')) {
            friendlyError = "Supabase email delivery error: Supabase cannot send confirmation emails right now. To enable instant signup, turn OFF 'Confirm email' in Supabase Dashboard (Authentication > Providers > Email), or configure Custom SMTP.";
          } else if (msg.includes('password') && (msg.includes('short') || msg.includes('least') || msg.includes('weak'))) {
            friendlyError = "Password must be at least 6 characters long.";
          } else if (msg.includes('rate limit')) {
            friendlyError = "Too many requests. Please wait a few moments before trying again.";
          }
          return { success: false, error: friendlyError, rawError: error.message };
        }

        const user = data.user;
        const session = data.session;

        // If user already exists in Supabase GoTrue
        if (user && user.identities && user.identities.length === 0) {
          return { success: false, error: "An account with this email already exists. Please log in." };
        }

        const isConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at || (session && session.access_token));
        const userObj = {
          id: user.id,
          email: user.email,
          name: cleanName,
          emailVerified: isConfirmed
        };

        // Create or update profile in profiles table
        await this.ensureProfile(userObj);

        // DO NOT auto-login user upon signup.
        // User logs in via the Sign In form
        return {
          success: true,
          user: userObj,
          session: session,
          token: session ? session.access_token : null,
          needsEmailConfirmation: !isConfirmed
        };
      } catch (err) {
        let msg = err.message || "Signup failed on Supabase server.";
        if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
          msg = "Unable to connect to the server. Please check your internet connection.";
        }
        return { success: false, error: msg };
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
          error: "Supabase connection required. Configure your Supabase project URL and anon key." 
        };
      }

      try {
        const cleanEmail = email.trim().toLowerCase();
        const { data, error } = await this.client.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (error) {
          let friendlyError = error.message;
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
            friendlyError = "Incorrect email or password. Please try again.";
          } else if (msg.includes('email not confirmed')) {
            friendlyError = "Email not confirmed. Please check your inbox or resend the verification email.";
          } else if (msg.includes('user not found')) {
            friendlyError = "No account found with this email address. Please sign up.";
          } else if (msg.includes('rate limit')) {
            friendlyError = "Too many login attempts. Please wait a few moments before trying again.";
          }
          return { success: false, error: friendlyError, rawError: error.message };
        }

        const user = data.user;
        const session = data.session;

        const userObj = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || cleanEmail.split('@')[0] || 'Pantry Chef',
          emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at)
        };

        // Ensure profile row exists in public.profiles
        await this.ensureProfile(userObj);

        localStorage.setItem('smartpantry_token', session.access_token);
        localStorage.setItem('smartpantry_user', JSON.stringify(userObj));

        // Dispatch background login alert
        this.dispatchLoginNotification(userObj);

        return {
          success: true,
          user: userObj,
          session,
          token: session.access_token
        };
      } catch (err) {
        let msg = err.message || "Authentication error.";
        if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
          msg = "Unable to connect to the server. Please check your internet connection.";
        }
        return { success: false, error: msg };
      }
    }

    async signOut() {
      try {
        this.unsubscribeAll();
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
              name: user.user_metadata?.full_name || user.email.split('@')[0] || 'Pantry Chef',
              emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at)
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

    onAuthStateChange(callback) {
      if (!this.isReady()) return null;
      try {
        return this.client.auth.onAuthStateChange(callback);
      } catch (e) {
        console.warn("[Supabase Auth] onAuthStateChange error:", e);
        return null;
      }
    }

    async updatePassword(newPassword) {
      if (!this.isReady()) return { success: false, error: "Supabase connection required." };
      try {
        const { data, error } = await this.client.auth.updateUser({ password: newPassword });
        if (error) return { success: false, error: error.message };
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message || "Failed to update password." };
      }
    }

    async updateEmail(newEmail) {
      if (!newEmail || !this.isReady()) return { success: false, error: "New email address required." };
      try {
        const redirectUrl = `${window.location.origin}/dashboard.html`;
        const { data, error } = await this.client.auth.updateUser({
          email: newEmail.trim().toLowerCase()
        }, {
          emailRedirectTo: redirectUrl
        });
        if (error) return { success: false, error: error.message };
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message || "Failed to update email address." };
      }
    }

    async resendConfirmation(email) {
      if (!email || !this.isReady()) return { success: false, error: "Email address required." };
      try {
        const redirectUrl = `${window.location.origin}/login.html`;
        const { error } = await this.client.auth.resend({
          type: 'signup',
          email: email.trim().toLowerCase(),
          options: {
            emailRedirectTo: redirectUrl
          }
        });
        if (error) throw error;
        return { success: true };
      } catch (err) {
        let msg = err.message || "Failed to resend confirmation email.";
        if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('security purposes')) {
          msg = "Please wait a moment before requesting another confirmation email.";
        }
        console.warn("[Supabase Auth] resendConfirmation error:", msg);
        return { success: false, error: msg };
      }
    }

    async resetPasswordForEmail(email) {
      if (!email || !this.isReady()) return { success: false, error: "Email address required." };
      try {
        const redirectUrl = `${window.location.origin}/login.html?type=recovery`;
        const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: redirectUrl
        });
        if (error) {
          let msg = error.message;
          if (msg.toLowerCase().includes('sending recovery email') || msg.toLowerCase().includes('recovery email')) {
            msg = "Supabase could not send recovery email. To resolve this, configure Custom SMTP in your Supabase Dashboard (Project Settings > Authentication > SMTP Settings).";
          }
          return { success: false, error: msg };
        }
        return { success: true };
      } catch (err) {
        let msg = err.message || "Failed to send reset email.";
        if (msg.toLowerCase().includes('sending recovery email') || msg.toLowerCase().includes('recovery email')) {
          msg = "Supabase could not send recovery email. To resolve this, configure Custom SMTP in your Supabase Dashboard (Project Settings > Authentication > SMTP Settings).";
        }
        console.warn("[Supabase Auth] resetPassword error:", msg);
        return { success: false, error: msg };
      }
    }

    async signInWithOtp(email, isSignUp = true) {
      if (!email || !email.includes('@')) {
        return { success: false, error: "Please enter a valid email address." };
      }
      if (!this.isReady()) return { success: false, error: "Supabase connection required." };
      try {
        const redirectUrl = `${window.location.origin}/login.html`;
        const { data, error } = await this.client.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: {
            emailRedirectTo: redirectUrl,
            shouldCreateUser: isSignUp
          }
        });
        if (error) {
          let msg = error.message;
          if (msg.toLowerCase().includes('magic link email') || msg.toLowerCase().includes('sending magic link')) {
            msg = "Supabase could not send magic link email. Configure Custom SMTP in your Supabase Dashboard (Project Settings > Authentication > SMTP Settings).";
          }
          return { success: false, error: msg };
        }
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message || "Failed to send magic link or OTP." };
      }
    }

    async verifyOtp({ email, token, type = 'signup' }) {
      if (!email || !token) {
        return { success: false, error: "Email and verification code are required." };
      }
      if (!this.isReady()) return { success: false, error: "Supabase connection required." };
      try {
        const cleanEmail = email.trim().toLowerCase();
        const cleanToken = token.trim();

        // 1. Primary verification attempt
        let res = await this.client.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: type
        });

        // 2. Comprehensive type fallback across signup, email, and magiclink
        if (res.error && (type === 'signup' || type === 'email' || type === 'magiclink')) {
          const fallbackTypes = ['signup', 'email', 'magiclink'].filter(t => t !== type);
          for (const fbType of fallbackTypes) {
            const retryRes = await this.client.auth.verifyOtp({
              email: cleanEmail,
              token: cleanToken,
              type: fbType
            });
            if (!retryRes.error && retryRes.data && retryRes.data.user) {
              res = retryRes;
              break;
            }
          }
        }

        if (res.error) {
          let friendlyError = res.error.message;
          const msg = (res.error.message || '').toLowerCase();
          if (msg.includes('expired') || msg.includes('has expired')) {
            friendlyError = "The verification code has expired. Please request a new code.";
          } else if (msg.includes('invalid') || msg.includes('token is invalid')) {
            friendlyError = "The 6-digit code you entered is invalid. Please double-check and try again.";
          } else if (msg.includes('rate limit')) {
            friendlyError = "Too many verification attempts. Please wait a moment.";
          }
          return { success: false, error: friendlyError };
        }

        const user = res.data.user;
        const session = res.data.session;
        if (!user) {
          return { success: false, error: "Verification succeeded but user session could not be established." };
        }

        const userObj = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || cleanEmail.split('@')[0] || 'Pantry Chef',
          emailVerified: true
        };

        await this.ensureProfile(userObj);

        if (session && session.access_token) {
          localStorage.setItem('smartpantry_token', session.access_token);
          localStorage.setItem('smartpantry_user', JSON.stringify(userObj));
        }

        this.dispatchLoginNotification(userObj);

        return {
          success: true,
          user: userObj,
          session,
          token: session ? session.access_token : null
        };
      } catch (err) {
        return { success: false, error: err.message || "OTP verification failed." };
      }
    }

    async exchangeCodeForSession(code) {
      if (!code || !this.isReady()) return null;
      try {
        const { data, error } = await this.client.auth.exchangeCodeForSession(code);
        if (error) {
          console.warn("[Supabase Auth] exchangeCodeForSession error:", error.message);
          return null;
        }
        if (data && data.session && data.user) {
          const userObj = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email.split('@')[0] || 'Pantry Chef',
            emailVerified: true
          };
          await this.ensureProfile(userObj);
          if (data.session.access_token) {
            localStorage.setItem('smartpantry_token', data.session.access_token);
            localStorage.setItem('smartpantry_user', JSON.stringify(userObj));
          }
          this.dispatchLoginNotification(userObj);
          return { user: userObj, session: data.session, token: data.session.access_token };
        }
        return null;
      } catch (err) {
        console.warn("[Supabase Auth] exchangeCodeForSession exception:", err);
        return null;
      }
    }

    async reauthenticate() {
      if (!this.isReady()) return { success: false, error: "Supabase connection required." };
      try {
        const { data, error } = await this.client.auth.reauthenticate();
        if (error) return { success: false, error: error.message };
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message || "Failed to trigger reauthentication." };
      }
    }

    // ==========================================
    // 2. PROFILES TABLE MANAGEMENT
    // ==========================================

    async getProfile(userId) {
      if (!userId || !this.isReady()) return null;
      try {
        const { data, error } = await this.client
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) throw error;
        return data;
      } catch (err) {
        console.warn("[Supabase Profile] Query error:", err.message);
        return null;
      }
    }

    async ensureProfile(user) {
      if (!user || !user.id || !this.isReady()) return;
      try {
        await this.client
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: user.name || user.email.split('@')[0],
            email: user.email,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });
      } catch (err) {
        // Silently continue if table trigger already handled profile creation
      }
    }

    async updateProfile(userId, { fullName, avatarUrl }) {
      if (!userId || !this.isReady()) return false;
      try {
        const updates = { updated_at: new Date().toISOString() };
        if (fullName !== undefined) updates.full_name = fullName;
        if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

        const { data, error } = await this.client
          .from('profiles')
          .update(updates)
          .eq('id', userId)
          .select();

        if (error) throw error;
        return data && data[0] ? data[0] : true;
      } catch (err) {
        console.warn("[Supabase Profile] Update error:", err.message);
        return false;
      }
    }

    // ==========================================
    // 3. PANTRY ITEMS CRUD (pantry_items as Primary)
    // ==========================================

    async getProducts(userId) {
      if (!userId) return null;
      if (!this.isReady()) {
        console.warn("[Supabase DB] Supabase not connected.");
        return null;
      }

      try {
        // 1. Query pantry_items table first (Permanent Source of Truth)
        const itemsRes = await this.client
          .from('pantry_items')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!itemsRes.error && Array.isArray(itemsRes.data)) {
          return itemsRes.data.map(r => this.mapFromDB(r));
        }

        // 2. Graceful fallback to pantry_products if pantry_items errored
        const prodRes = await this.client
          .from('pantry_products')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!prodRes.error && Array.isArray(prodRes.data)) {
          return prodRes.data.map(r => this.mapFromDB(r));
        }

        // 3. Fallback to legacy products table
        const fallbackRes = await this.client
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!fallbackRes.error && Array.isArray(fallbackRes.data)) {
          return fallbackRes.data.map(r => this.mapFromDB(r));
        }

        // Tables don't exist yet in Supabase: return null so store keeps local items
        return null;
      } catch (err) {
        console.warn("[Supabase DB] getProducts warning:", err.message);
        return null;
      }
    }

    async insertProduct(productData, userId) {
      if (!this.isReady()) return null;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      if (!effectiveUserId) {
        console.warn("[Supabase DB] insertProduct: No authenticated user session found.");
        return null;
      }

      const qty = Number(productData.quantity) || 1;
      const unitVal = productData.unit || productData.quantity_unit || 'pcs';
      const minStockVal = productData.minStock !== undefined ? Number(productData.minStock) : (productData.lowStockThreshold !== undefined ? Number(productData.lowStockThreshold) : 2);
      const notesVal = productData.notes || productData.description || null;

      let itemId = productData.id;
      if (!itemId || !itemId.includes('-') || itemId.length < 30) {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          itemId = crypto.randomUUID();
        }
      }

      // 1. Primary standard payload for pantry_items (only standard columns, NO nonexistent aliases)
      const pantryItemRecord = {
        user_id: effectiveUserId,
        product_name: productData.name,
        brand: productData.brand || null,
        category: productData.category || 'Pantry',
        barcode: productData.barcode || null,
        product_image: productData.imageUrl || productData.image || null,
        quantity: qty,
        quantity_unit: unitVal,
        purchase_date: productData.purchaseDate || null,
        expiry_date: productData.expiryDate || null,
        low_stock_threshold: minStockVal,
        notes: notesVal,
        storage_location: productData.storageLocation || productData.location || 'Pantry'
      };
      if (itemId) pantryItemRecord.id = itemId;

      try {
        // Attempt 1: Standard pantry_items insert
        let res = await this.client
          .from('pantry_items')
          .insert([pantryItemRecord])
          .select();

        if (!res.error && res.data && res.data[0]) {
          return this.mapFromDB(res.data[0]);
        }

        // Attempt 1b: If column mismatch occurred, adapt fields dynamically
        if (res.error && res.error.message) {
          const errMsg = (res.error.message || '').toLowerCase();
          let retryRecord = { ...pantryItemRecord };

          if (errMsg.includes('quantity_unit')) {
            delete retryRecord.quantity_unit;
            retryRecord.unit = unitVal;
          }
          if (errMsg.includes('low_stock_threshold')) {
            delete retryRecord.low_stock_threshold;
            retryRecord.minimum_stock = minStockVal;
          }
          if (errMsg.includes('product_name')) {
            delete retryRecord.product_name;
            retryRecord.name = productData.name;
          }
          if (errMsg.includes('notes')) {
            delete retryRecord.notes;
            retryRecord.description = notesVal;
          }
          if (errMsg.includes('storage_location')) {
            delete retryRecord.storage_location;
            retryRecord.location = productData.storageLocation || 'Pantry';
          }

          // Strip specific column if mentioned as not existing
          const colMatch = res.error.message.match(/column "([^"]+)" of relation/);
          if (colMatch && colMatch[1]) {
            delete retryRecord[colMatch[1]];
          }

          const retryRes = await this.client
            .from('pantry_items')
            .insert([retryRecord])
            .select();

          if (!retryRes.error && retryRes.data && retryRes.data[0]) {
            return this.mapFromDB(retryRes.data[0]);
          }
        }

        // 2. Fallback to pantry_products table
        const prodRecord = {
          user_id: effectiveUserId,
          product_name: productData.name,
          brand: productData.brand || null,
          category: productData.category || 'Pantry',
          barcode: productData.barcode || null,
          product_image: productData.imageUrl || productData.image || null,
          description: notesVal,
          quantity: qty,
          unit: unitVal,
          purchase_date: productData.purchaseDate || null,
          expiry_date: productData.expiryDate || null,
          minimum_stock: minStockVal,
          storage_location: productData.storageLocation || productData.location || 'Pantry'
        };
        if (itemId) prodRecord.id = itemId;

        const prodRes = await this.client
          .from('pantry_products')
          .insert([prodRecord])
          .select();

        if (!prodRes.error && prodRes.data && prodRes.data[0]) {
          return this.mapFromDB(prodRes.data[0]);
        }

        // 3. Fallback to legacy products table
        const legacyRecord = {
          user_id: effectiveUserId,
          name: productData.name,
          brand: productData.brand || null,
          image_url: productData.imageUrl || productData.image || null,
          min_stock: minStockVal,
          category: productData.category || 'Pantry',
          quantity: qty,
          unit: unitVal,
          expiry_date: productData.expiryDate || null,
          purchase_date: productData.purchaseDate || null,
          barcode: productData.barcode || null,
          storage_location: productData.storageLocation || 'Pantry',
          location: productData.storageLocation || 'Pantry',
          status: productData.status || 'Fresh'
        };
        if (itemId) legacyRecord.id = itemId;

        const legRes = await this.client
          .from('products')
          .insert([legacyRecord])
          .select();

        if (!legRes.error && legRes.data && legRes.data[0]) {
          return this.mapFromDB(legRes.data[0]);
        }

        const finalErr = res.error || prodRes.error || legRes.error;
        console.warn("[Supabase DB] insertProduct note:", finalErr ? finalErr.message : "Database table pending setup");
        return null;
      } catch (err) {
        console.warn("[Supabase DB] insertProduct error:", err.message);
        return null;
      }
    }

    async updateProduct(id, updates, userId) {
      if (!id) return null;
      if (!this.isReady()) return null;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      if (!effectiveUserId) return null;

      const unitVal = updates.unit || updates.quantityUnit;
      const minStockVal = updates.minStock !== undefined ? Number(updates.minStock) : (updates.lowStockThreshold !== undefined ? Number(updates.lowStockThreshold) : undefined);
      const notesVal = updates.notes !== undefined ? updates.notes : updates.description;

      const dbPayload = {
        updated_at: new Date().toISOString()
      };
      if (updates.name !== undefined) dbPayload.product_name = updates.name;
      if (updates.brand !== undefined) dbPayload.brand = updates.brand;
      if (updates.imageUrl !== undefined || updates.image !== undefined) dbPayload.product_image = updates.imageUrl || updates.image;
      if (minStockVal !== undefined) dbPayload.low_stock_threshold = minStockVal;
      if (updates.category !== undefined) dbPayload.category = updates.category;
      if (updates.quantity !== undefined) dbPayload.quantity = Number(updates.quantity);
      if (unitVal !== undefined) dbPayload.quantity_unit = unitVal;
      if (updates.expiryDate !== undefined) dbPayload.expiry_date = updates.expiryDate || null;
      if (updates.purchaseDate !== undefined) dbPayload.purchase_date = updates.purchaseDate || null;
      if (updates.barcode !== undefined) dbPayload.barcode = updates.barcode;
      if (updates.storageLocation !== undefined || updates.location !== undefined) {
        dbPayload.storage_location = updates.storageLocation || updates.location;
      }
      if (notesVal !== undefined) dbPayload.notes = notesVal;

      try {
        // 1. Try pantry_items first
        let res = await this.client
          .from('pantry_items')
          .update(dbPayload)
          .eq('id', id)
          .eq('user_id', effectiveUserId)
          .select();

        if (!res.error && res.data && res.data[0]) {
          return this.mapFromDB(res.data[0]);
        }

        // 1b. If column mismatch occurred, adapt fields dynamically
        if (res.error && res.error.message) {
          const errMsg = (res.error.message || '').toLowerCase();
          let retryPayload = { ...dbPayload };

          if (errMsg.includes('quantity_unit')) {
            delete retryPayload.quantity_unit;
            if (unitVal !== undefined) retryPayload.unit = unitVal;
          }
          if (errMsg.includes('low_stock_threshold')) {
            delete retryPayload.low_stock_threshold;
            if (minStockVal !== undefined) retryPayload.minimum_stock = minStockVal;
          }
          if (errMsg.includes('product_name')) {
            delete retryPayload.product_name;
            if (updates.name !== undefined) retryPayload.name = updates.name;
          }
          if (errMsg.includes('notes')) {
            delete retryPayload.notes;
            if (notesVal !== undefined) retryPayload.description = notesVal;
          }
          if (errMsg.includes('storage_location')) {
            delete retryPayload.storage_location;
            if (updates.storageLocation || updates.location) retryPayload.location = updates.storageLocation || updates.location;
          }

          const colMatch = res.error.message.match(/column "([^"]+)" of relation/);
          if (colMatch && colMatch[1]) {
            delete retryPayload[colMatch[1]];
          }

          const retryRes = await this.client
            .from('pantry_items')
            .update(retryPayload)
            .eq('id', id)
            .eq('user_id', effectiveUserId)
            .select();

          if (!retryRes.error && retryRes.data && retryRes.data[0]) {
            return this.mapFromDB(retryRes.data[0]);
          }
        }

        // 2. Try pantry_products
        const prodPayload = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) prodPayload.product_name = updates.name;
        if (updates.brand !== undefined) prodPayload.brand = updates.brand;
        if (updates.imageUrl !== undefined || updates.image !== undefined) prodPayload.product_image = updates.imageUrl || updates.image;
        if (minStockVal !== undefined) prodPayload.minimum_stock = minStockVal;
        if (updates.category !== undefined) prodPayload.category = updates.category;
        if (updates.quantity !== undefined) prodPayload.quantity = Number(updates.quantity);
        if (unitVal !== undefined) prodPayload.unit = unitVal;
        if (updates.expiryDate !== undefined) prodPayload.expiry_date = updates.expiryDate || null;
        if (updates.purchaseDate !== undefined) prodPayload.purchase_date = updates.purchaseDate || null;
        if (updates.barcode !== undefined) prodPayload.barcode = updates.barcode;
        if (updates.storageLocation || updates.location) prodPayload.storage_location = updates.storageLocation || updates.location;
        if (notesVal !== undefined) prodPayload.description = notesVal;

        const prodRes = await this.client
          .from('pantry_products')
          .update(prodPayload)
          .eq('id', id)
          .eq('user_id', effectiveUserId)
          .select();

        if (!prodRes.error && prodRes.data && prodRes.data[0]) {
          return this.mapFromDB(prodRes.data[0]);
        }

        // 3. Fallback to legacy products table
        const legacyPayload = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) legacyPayload.name = updates.name;
        if (updates.brand !== undefined) legacyPayload.brand = updates.brand;
        if (updates.imageUrl !== undefined || updates.image !== undefined) legacyPayload.image_url = updates.imageUrl || updates.image;
        if (minStockVal !== undefined) legacyPayload.min_stock = minStockVal;
        if (updates.category !== undefined) legacyPayload.category = updates.category;
        if (updates.quantity !== undefined) legacyPayload.quantity = Number(updates.quantity);
        if (unitVal !== undefined) legacyPayload.unit = unitVal;
        if (updates.expiryDate !== undefined) legacyPayload.expiry_date = updates.expiryDate || null;
        if (updates.purchaseDate !== undefined) legacyPayload.purchase_date = updates.purchaseDate || null;
        if (updates.barcode !== undefined) legacyPayload.barcode = updates.barcode;
        if (updates.storageLocation || updates.location) {
          legacyPayload.storage_location = updates.storageLocation || updates.location;
          legacyPayload.location = updates.storageLocation || updates.location;
        }

        const legRes = await this.client
          .from('products')
          .update(legacyPayload)
          .eq('id', id)
          .eq('user_id', effectiveUserId)
          .select();

        if (legRes.data && legRes.data[0]) {
          return this.mapFromDB(legRes.data[0]);
        }

        console.warn("[Supabase DB] updateProduct note: Database update skipped (table pending or offline)");
        return { id, ...updates };
      } catch (err) {
        console.warn("[Supabase DB] updateProduct error:", err.message);
        return { id, ...updates };
      }
    }

    async deleteProduct(id, userId) {
      if (!id) return false;
      if (!this.isReady()) return true;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      if (!effectiveUserId) return true;

      try {
        let deleted = false;

        // Delete from pantry_items
        const resItems = await this.client
          .from('pantry_items')
          .delete()
          .eq('id', id)
          .eq('user_id', effectiveUserId);

        if (!resItems.error) deleted = true;

        // Delete from pantry_products
        const resProd = await this.client
          .from('pantry_products')
          .delete()
          .eq('id', id)
          .eq('user_id', effectiveUserId);

        if (!resProd.error) deleted = true;

        // Delete from legacy products
        const resLeg = await this.client
          .from('products')
          .delete()
          .eq('id', id)
          .eq('user_id', effectiveUserId);

        if (!resLeg.error) deleted = true;

        return true;
      } catch (err) {
        console.warn("[Supabase DB] deleteProduct warning:", err.message);
        return true;
      }
    }

    // ==========================================
    // 4. NOTIFICATION PREFERENCES
    // ==========================================

    async getUserSettings(userId) {
      if (!userId || !this.isReady()) return null;
      try {
        const { data, error } = await this.client
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (!error && data) return data;

        // Fallback to user_settings
        const leg = await this.client
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        return leg.data || null;
      } catch (err) {
        return null;
      }
    }

    async saveUserSettings(userId, settingsData) {
      if (!userId || !this.isReady()) return false;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      if (!effectiveUserId) return false;

      const payload = {
        user_id: effectiveUserId,
        preferences: settingsData.preferences || {},
        pantry_settings: settingsData.pantry_settings || {},
        general_settings: settingsData.general_settings || {},
        updated_at: new Date().toISOString()
      };

      try {
        const { data, error } = await this.client
          .from('notification_preferences')
          .upsert(payload, { onConflict: 'user_id' })
          .select();

        // Also upsert user_settings for compatibility
        await this.client
          .from('user_settings')
          .upsert(payload, { onConflict: 'user_id' });

        return !error;
      } catch (err) {
        console.warn("[Supabase Settings] Save error:", err.message);
        return false;
      }
    }

    // ==========================================
    // 5. ACTIVITY LOGS
    // ==========================================

    async getActivity(userId, limit = 50) {
      if (!userId || !this.isReady()) return [];
      try {
        const { data, error } = await this.client
          .from('activity_logs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && Array.isArray(data)) return data;

        // Fallback to pantry_activity
        const leg = await this.client
          .from('pantry_activity')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        return leg.data || [];
      } catch (err) {
        return [];
      }
    }

    async logActivity(userId, { action, productId, productName, details }) {
      if (!userId || !this.isReady()) return null;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      if (!effectiveUserId) return null;

      const dbRecord = {
        user_id: effectiveUserId,
        action: action || 'updated',
        product_id: productId ? String(productId) : null,
        product_name: productName || 'Item',
        details: details || '',
        created_at: new Date().toISOString()
      };

      try {
        const { data, error } = await this.client
          .from('activity_logs')
          .insert([dbRecord])
          .select();

        // Also insert into pantry_activity for compatibility
        await this.client
          .from('pantry_activity')
          .insert([dbRecord]);

        return data ? data[0] : null;
      } catch (err) {
        return null;
      }
    }

    // ==========================================
    // 6. ALERTS CRUD
    // ==========================================

    async getAlerts(userId) {
      if (!userId || !this.isReady()) return [];
      try {
        const { data, error } = await this.client
          .from('alerts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) return data;

        // Fallback to pantry_alerts
        const leg = await this.client
          .from('pantry_alerts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        return leg.data || [];
      } catch (err) {
        return [];
      }
    }

    async createAlert(userId, { title, message, type }) {
      if (!userId || !this.isReady()) return null;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      if (!effectiveUserId) return null;

      const dbRecord = {
        user_id: effectiveUserId,
        title: title || 'Pantry Alert',
        message: message || '',
        type: type || 'system',
        is_read: false,
        created_at: new Date().toISOString()
      };

      try {
        const { data, error } = await this.client
          .from('alerts')
          .insert([dbRecord])
          .select();

        await this.client
          .from('pantry_alerts')
          .insert([dbRecord]);

        return data ? data[0] : null;
      } catch (err) {
        return null;
      }
    }

    async markAlertAsRead(alertId, userId) {
      if (!userId || !alertId || !this.isReady()) return false;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      try {
        await this.client.from('alerts').update({ is_read: true }).eq('id', alertId).eq('user_id', effectiveUserId);
        await this.client.from('pantry_alerts').update({ is_read: true }).eq('id', alertId).eq('user_id', effectiveUserId);
        return true;
      } catch (err) {
        return false;
      }
    }

    async markAllAlertsAsRead(userId) {
      if (!userId || !this.isReady()) return false;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      try {
        await this.client.from('alerts').update({ is_read: true }).eq('user_id', effectiveUserId).eq('is_read', false);
        await this.client.from('pantry_alerts').update({ is_read: true }).eq('user_id', effectiveUserId).eq('is_read', false);
        return true;
      } catch (err) {
        return false;
      }
    }

    async deleteAlert(alertId, userId) {
      if (!userId || !alertId || !this.isReady()) return false;
      const effectiveUserId = await this.getAuthenticatedUserId(userId);
      try {
        await this.client.from('alerts').delete().eq('id', alertId).eq('user_id', effectiveUserId);
        await this.client.from('pantry_alerts').delete().eq('id', alertId).eq('user_id', effectiveUserId);
        return true;
      } catch (err) {
        return false;
      }
    }

    // ==========================================
    // 7. REALTIME WEBSOCKET SUBSCRIPTIONS
    // ==========================================

    subscribeToUserProducts(userId, onDataChange) {
      if (!this.isReady() || !userId) return null;

      try {
        const channelName = `pantry-products-${userId}`;
        if (this.activeChannels[channelName]) {
          this.client.removeChannel(this.activeChannels[channelName]);
        }

        const channel = this.client
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'pantry_items',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] pantry_items event:", payload.eventType);
              if (typeof onDataChange === 'function') onDataChange(payload);
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'pantry_products',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] pantry_products event:", payload.eventType);
              if (typeof onDataChange === 'function') onDataChange(payload);
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'products',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] products event:", payload.eventType);
              if (typeof onDataChange === 'function') onDataChange(payload);
            }
          )
          .subscribe();

        this.activeChannels[channelName] = channel;
        return channel;
      } catch (err) {
        console.warn("[Supabase Realtime] Products subscription error:", err);
        return null;
      }
    }

    subscribeToUserAlerts(userId, onDataChange) {
      if (!this.isReady() || !userId) return null;

      try {
        const channelName = `alerts-${userId}`;
        if (this.activeChannels[channelName]) {
          this.client.removeChannel(this.activeChannels[channelName]);
        }

        const channel = this.client
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'alerts',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] alerts event:", payload.eventType);
              if (typeof onDataChange === 'function') onDataChange(payload);
            }
          )
          .subscribe();

        this.activeChannels[channelName] = channel;
        return channel;
      } catch (err) {
        console.warn("[Supabase Realtime] Alerts subscription error:", err);
        return null;
      }
    }

    subscribeToUserSettings(userId, onDataChange) {
      if (!this.isReady() || !userId) return null;

      try {
        const channelName = `settings-${userId}`;
        if (this.activeChannels[channelName]) {
          this.client.removeChannel(this.activeChannels[channelName]);
        }

        const channel = this.client
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'notification_preferences',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log("[Supabase Realtime] settings event:", payload.eventType);
              if (typeof onDataChange === 'function') onDataChange(payload);
            }
          )
          .subscribe();

        this.activeChannels[channelName] = channel;
        return channel;
      } catch (err) {
        console.warn("[Supabase Realtime] Settings subscription error:", err);
        return null;
      }
    }

    unsubscribeAll() {
      if (!this.client) return;
      Object.keys(this.activeChannels).forEach(key => {
        try {
          if (this.activeChannels[key]) {
            this.client.removeChannel(this.activeChannels[key]);
          }
        } catch (e) {}
      });
      this.activeChannels = {};
      console.log("[Supabase Realtime] Cleaned up all private channels.");
    }

    // ==========================================
    // 8. HELPER MAPPING & RESEND DISPATCH
    // ==========================================

    mapFromDB(row) {
      if (!row) return null;
      const minStockVal = row.low_stock_threshold !== undefined && row.low_stock_threshold !== null
        ? Number(row.low_stock_threshold)
        : (row.minimum_stock !== undefined && row.minimum_stock !== null
          ? Number(row.minimum_stock)
          : (row.min_stock !== undefined && row.min_stock !== null ? Number(row.min_stock) : 2));
      const qtyVal = Number(row.quantity) || 1;
      const expDate = row.expiry_date || '';
      const unitVal = row.quantity_unit || row.unit || 'pcs';
      const notesVal = row.notes || row.description || '';

      return {
        id: row.id,
        name: row.product_name || row.name || 'Unnamed Product',
        brand: row.brand || '',
        imageUrl: row.product_image || row.image_url || '',
        minStock: minStockVal,
        lowStockThreshold: minStockVal,
        category: row.category || 'Pantry',
        quantity: qtyVal,
        unit: unitVal,
        quantityUnit: unitVal,
        expiryDate: expDate,
        purchaseDate: row.purchase_date || '',
        barcode: row.barcode || '',
        price: Number(row.price) || 0,
        storageLocation: row.storage_location || row.location || 'Pantry',
        description: notesVal,
        notes: notesVal,
        ingredients: row.ingredients || '',
        nutrition: row.nutrition || null,
        emoji: row.emoji || (window.store ? window.store.detectEmoji(row.product_name || row.name, row.category) : '📦'),
        status: (window.store && expDate) 
          ? window.store.calculateStatus(expDate, qtyVal, minStockVal) 
          : (row.status || 'Fresh'),
        addedAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString()
      };
    }

    dispatchLoginNotification(user) {
      if (!user || !user.email) return;

      const clientInfo = {
        loginDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        loginTime: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
        browser: navigator.userAgent.includes("Chrome") ? "Chrome" : (navigator.userAgent.includes("Firefox") ? "Firefox" : "Web Browser"),
        device: window.innerWidth < 768 ? "Mobile Device" : "Desktop Computer"
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
        console.warn("[Resend Alert Notice]", e);
      });
    }
  }

  window.supabaseService = new SupabaseService();
  window.supabaseClient = window.supabaseService.client;
})(window);

/**
 * Smart Pantry - Supabase Production Configuration & Credentials
 * 
 * Instructions:
 * Enter your Supabase Project URL and Anon Key below, or configure them
 * dynamically via the in-app Database Settings modal.
 */

(function(window) {
  // Default Project Credentials (replace with your production keys)
  const DEFAULT_SUPABASE_URL = "https://your-project.supabase.co";
  const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-anon-key";

  function getSupabaseConfig() {
    let url = "";
    let key = "";

    try {
      url = localStorage.getItem("smartpantry_supabase_url");
      key = localStorage.getItem("smartpantry_supabase_key");
    } catch (e) {}

    if (!url || url.includes("your-project")) {
      url = (typeof window.ENV !== "undefined" && window.ENV.SUPABASE_URL) 
        ? window.ENV.SUPABASE_URL 
        : DEFAULT_SUPABASE_URL;
    }

    if (!key || key.includes("your-anon-key")) {
      key = (typeof window.ENV !== "undefined" && window.ENV.SUPABASE_ANON_KEY) 
        ? window.ENV.SUPABASE_ANON_KEY 
        : DEFAULT_SUPABASE_ANON_KEY;
    }

    return {
      url: url.trim(),
      key: key.trim(),
      isConfigured: Boolean(
        url && 
        key && 
        !url.includes("your-project") && 
        !key.includes("your-anon-key") &&
        url.startsWith("https://")
      )
    };
  }

  function saveSupabaseConfig(url, key) {
    try {
      if (url) localStorage.setItem("smartpantry_supabase_url", url.trim());
      if (key) localStorage.setItem("smartpantry_supabase_key", key.trim());
      return true;
    } catch (e) {
      console.error("[Supabase Config] Save error:", e);
      return false;
    }
  }

  function clearSupabaseConfig() {
    try {
      localStorage.removeItem("smartpantry_supabase_url");
      localStorage.removeItem("smartpantry_supabase_key");
    } catch (e) {}
  }

  window.SupabaseConfig = {
    get: getSupabaseConfig,
    save: saveSupabaseConfig,
    clear: clearSupabaseConfig,
    isConfigured: () => getSupabaseConfig().isConfigured
  };
})(window);

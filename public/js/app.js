/**
 * Smart Pantry - App Lifecycle, Router, Real-Time Clock, Geolocation & Event Listeners
 */

class AppRouter {
  constructor() {
    this.currentRoute = "dashboard";
    this.routes = {
      dashboard: () => this.showDashboard(),
      inventory: () => this.showInventory(),
      "add-item": () => openAddEditModal(),
      "scan-barcode": () => openBillScannerModal(),
      expiry: () => this.showExpiry(),
      "shopping-list": () => this.showShoppingList(),
      recipes: () => this.showRecipes(),
      insights: () => this.showInsights(),
      notifications: () => { if (typeof toggleAlertCenter === 'function') toggleAlertCenter(true); },
      settings: () => this.showSettings()
    };
  }

  navigate(route) {
    this.currentRoute = route;

    // Update active nav state in sidebar
    document.querySelectorAll(".nav-link").forEach(link => {
      if (link.getAttribute("data-route") === route) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Close mobile drawer if open
    const sidebar = document.getElementById('leftSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar && sidebar.classList.contains('drawer-open')) {
      sidebar.classList.remove('drawer-open');
      if (backdrop) backdrop.classList.remove('active');
    }

    if (this.routes[route]) {
      this.routes[route]();
    }
  }

  showDashboard() {
    const home = document.getElementById("dashboardHomeViews");
    const insights = document.getElementById("insightsSection");
    const settings = document.getElementById("settingsSection");
    if (home) home.style.display = "block";
    if (insights) insights.style.display = "none";
    if (settings) settings.style.display = "none";
    setCategoryFilter("All");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showInventory() {
    const home = document.getElementById("dashboardHomeViews");
    const insights = document.getElementById("insightsSection");
    const settings = document.getElementById("settingsSection");
    if (home) home.style.display = "block";
    if (insights) insights.style.display = "none";
    if (settings) settings.style.display = "none";
    const tableSection = document.getElementById("inventorySection");
    if (tableSection) {
      tableSection.scrollIntoView({ behavior: "smooth" });
    }
  }

  showInsights() {
    const home = document.getElementById("dashboardHomeViews");
    const insights = document.getElementById("insightsSection");
    const settings = document.getElementById("settingsSection");
    if (home) home.style.display = "none";
    if (insights) insights.style.display = "flex";
    if (settings) settings.style.display = "none";
    if (typeof window.renderInsightsView === "function") {
      window.renderInsightsView();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showSettings() {
    const home = document.getElementById("dashboardHomeViews");
    const insights = document.getElementById("insightsSection");
    const settings = document.getElementById("settingsSection");
    if (home) home.style.display = "none";
    if (insights) insights.style.display = "none";
    if (settings) settings.style.display = "flex";
    if (typeof window.renderSettingsView === "function") {
      window.renderSettingsView();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showExpiry() {
    this.showDashboard();
    setCategoryFilter("All");
    if (typeof setStatusFilter === "function") {
      setStatusFilter("Expiring Soon");
    }
    const expiringItems = window.store.getItems().filter(i => {
      const status = window.store.calculateStatus(i.expiryDate, i.quantity);
      return status === "Expiring Soon" || status === "Expired";
    });
    showToast(`Showing ${expiringItems.length} expiring / urgent item(s)`);
    const tableSection = document.getElementById("inventorySection");
    if (tableSection) tableSection.scrollIntoView({ behavior: "smooth" });
  }

  showShoppingList() {
    if (window.RecipeEngine && typeof window.RecipeEngine.openShoppingListModal === "function") {
      window.RecipeEngine.openShoppingListModal();
    } else {
      const metrics = window.store.getMetrics();
      showToast(`Shopping List: ${metrics.shoppingListCount} item(s) recommended to restock.`);
    }
  }

  showRecipes() {
    const home = document.getElementById("dashboardHomeViews");
    const insights = document.getElementById("insightsSection");
    const settings = document.getElementById("settingsSection");
    if (home) home.style.display = "block";
    if (insights) insights.style.display = "none";
    if (settings) settings.style.display = "none";
    if (window.RecipeEngine && typeof window.RecipeEngine.scrollToRecipeKitchen === "function") {
      window.RecipeEngine.scrollToRecipeKitchen();
    }
  }
}

// Global Router instance
window.router = new AppRouter();

// Toast notification function
function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.style.cssText = `
    background: #0f172a;
    color: #ffffff;
    padding: 12px 18px;
    border-radius: 14px;
    font-size: 13.5px;
    font-weight: 600;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: fadeIn 0.2s ease-out;
    border: 1px solid #334155;
    pointer-events: auto;
  `;
  toast.innerHTML = `<span>🌿</span> <span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/* ==========================================================
   REAL-TIME DATE, LIVE CLOCK & MIDNIGHT ROLLOVER ENGINE
   ========================================================== */
let lastActiveCalendarDay = new Date().getDate();

function updateRealTimeClockAndDate() {
  const now = new Date();

  // 1. Midnight Rollover Check
  if (now.getDate() !== lastActiveCalendarDay) {
    lastActiveCalendarDay = now.getDate();
    console.log("[Smart Pantry] Midnight calendar rollover detected. Refreshing relative expiry calculations...");
    if (window.renderInventoryTable) window.renderInventoryTable();
    if (window.updateMetricsDisplay) window.updateMetricsDisplay();
    if (window.store && window.store.checkAndDispatchPantryAlerts) {
      window.store.checkAndDispatchPantryAlerts();
    }
  }

  // 2. Real-Time Day & Date
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const fullDate = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const shortDate = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const dayBadgeEl = document.getElementById("currentDayBadge");
  const fullDateEl = document.getElementById("currentFullDate");
  const dayNameEl = document.getElementById("currentDayName");
  const dateValEl = document.getElementById("currentDateVal");

  if (dayBadgeEl) dayBadgeEl.textContent = `Today • ${dayName}`;
  if (fullDateEl) fullDateEl.textContent = fullDate;
  if (dayNameEl) dayNameEl.textContent = dayName;
  if (dateValEl) dateValEl.textContent = shortDate;

  // 3. Live 12-Hour Local Clock with AM/PM
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  const liveClockEl = document.getElementById("liveClockDisplay");
  if (liveClockEl) liveClockEl.textContent = timeStr;

  const topbarClockEl = document.getElementById("topbarLiveClock");
  if (topbarClockEl) topbarClockEl.textContent = timeStr;

  // 4. Dynamic Time of Day Quote / Greeting
  const hour = now.getHours();
  const quoteEl = document.getElementById("dynamicTimeQuote");
  if (quoteEl) {
    if (hour < 12) {
      quoteEl.textContent = "Good morning! Fresh food tracked in real time.";
    } else if (hour < 17) {
      quoteEl.textContent = "Good afternoon! Fresh meals keep your kitchen vibrant.";
    } else {
      quoteEl.textContent = "Good evening! Plan ahead for a healthier tomorrow.";
    }
  }
}

/* ==========================================================
   REAL-TIME GEOLOCATION (CITY / COUNTRY) ENGINE
   ========================================================== */
async function fetchUserLocation(force = false) {
  const badgeEl = document.getElementById("userLocationText");
  if (!badgeEl) return;

  const cachedLoc = sessionStorage.getItem("smartpantry_detected_location");
  if (cachedLoc && !force) {
    badgeEl.textContent = cachedLoc;
    return;
  }

  badgeEl.textContent = "Detecting live location...";

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          let city = "", country = "";
          try {
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
            const data = await res.json();
            city = data.city || data.locality || data.principalSubdivision || "";
            country = data.countryCode || data.countryName || "";
          } catch (e) {
            const res2 = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data2 = await res2.json();
            city = data2.address?.city || data2.address?.town || data2.address?.village || data2.address?.state || "";
            country = data2.address?.country_code?.toUpperCase() || "";
          }

          let locText = "Live Location Active";
          if (city && country) {
            locText = `${city}, ${country}`;
          } else if (city) {
            locText = city;
          }

          badgeEl.textContent = locText;
          sessionStorage.setItem("smartpantry_detected_location", locText);
        } catch (err) {
          fallbackIpLocation(badgeEl);
        }
      },
      () => {
        fallbackIpLocation(badgeEl);
      },
      { timeout: 6000, maximumAge: 60000, enableHighAccuracy: true }
    );
  } else {
    fallbackIpLocation(badgeEl);
  }
}

async function fallbackIpLocation(badgeEl) {
  try {
    const res = await fetch("https://ipapi.co/json/");
    const data = await res.json();
    const city = data.city || data.region || "";
    const country = data.country_code || data.country_name || "";
    if (city) {
      const locText = `${city}, ${country}`;
      badgeEl.textContent = locText;
      sessionStorage.setItem("smartpantry_detected_location", locText);
      return;
    }
  } catch (e) {}
  badgeEl.textContent = "Location Active";
}

function refreshUserLocation() {
  fetchUserLocation(true);
}

// Global functions
window.showToast = showToast;
window.updateRealTimeClockAndDate = updateRealTimeClockAndDate;
window.fetchUserLocation = fetchUserLocation;
window.refreshUserLocation = refreshUserLocation;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  // Initial render
  renderInventoryTable();
  updateMetricsDisplay();

  // Search input binding
  const searchInput = document.getElementById("globalSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", handleSearchInput);
  }

  // Subscribe to store updates
  window.store.subscribe(() => {
    renderInventoryTable();
    updateMetricsDisplay();
  });

  // Start Real-Time Live Clock & Date Interval (every 1000ms)
  updateRealTimeClockAndDate();
  setInterval(updateRealTimeClockAndDate, 1000);

  // Request browser geolocation gracefully
  setTimeout(() => {
    fetchUserLocation();
  }, 1000);
});

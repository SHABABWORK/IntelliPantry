/**
 * Smart Pantry - Real-Time Recipe Recommendation & Matching Engine
 * 100% Free • Real-Time Pantry Synchronization • Zero Paywalls
 */

class RecipeEngineManager {
  constructor() {
    this.recipes = window.MASTER_RECIPES || [];
    this.activeCategory = "all";
    this.searchQuery = "";
    this.pantryMatchesOnly = false;
    this.expiringOnly = false;
    this.favoritesOnly = false;
    this.currentDetailRecipe = null;
    this.init();
  }

  init() {
    // Listen for pantry inventory changes to update recipes automatically
    if (window.store && typeof window.store.subscribe === "function") {
      window.store.subscribe(() => {
        console.log("[Recipe Engine] Pantry updated. Recalculating real-time recipe matches...");
        this.renderRecipeKitchen();
        this.updateExpiringBanner();
      });
    }
  }

  getUserKey() {
    const userRaw = localStorage.getItem("smartpantry_user");
    if (!userRaw) return "default";
    try {
      const u = JSON.parse(userRaw);
      return u.id || (u.email ? u.email.replace(/[^a-zA-Z0-9]/g, "_") : "default");
    } catch (e) {
      return "default";
    }
  }

  getFavoritesKey() {
    return `smart_pantry_favs_${this.getUserKey()}`;
  }

  getShoppingListKey() {
    return `smart_pantry_shopping_${this.getUserKey()}`;
  }

  getFavorites() {
    try {
      const raw = localStorage.getItem(this.getFavoritesKey());
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  isFavorite(recipeId) {
    const favs = this.getFavorites();
    return favs.includes(recipeId);
  }

  toggleFavorite(recipeId) {
    let favs = this.getFavorites();
    if (favs.includes(recipeId)) {
      favs = favs.filter(id => id !== recipeId);
      if (window.showToast) window.showToast("Removed recipe from favorites ❤️");
    } else {
      favs.push(recipeId);
      if (window.showToast) window.showToast("Saved to My Favorites! ❤️");
    }
    localStorage.setItem(this.getFavoritesKey(), JSON.stringify(favs));
    this.renderRecipeKitchen();
    if (this.currentDetailRecipe && this.currentDetailRecipe.id === recipeId) {
      this.updateDetailFavoriteBtn();
    }
  }

  getShoppingList() {
    try {
      const raw = localStorage.getItem(this.getShoppingListKey());
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  addToShoppingList(itemNames) {
    const list = this.getShoppingList();
    const toAdd = Array.isArray(itemNames) ? itemNames : [itemNames];
    let addedCount = 0;

    toAdd.forEach(name => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const exists = list.some(i => (typeof i === "string" ? i : i.name).toLowerCase() === trimmed.toLowerCase());
      if (!exists) {
        list.push({
          id: "shop_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          name: trimmed,
          addedAt: new Date().toISOString(),
          checked: false
        });
        addedCount++;
      }
    });

    localStorage.setItem(this.getShoppingListKey(), JSON.stringify(list));
    if (window.updateMetricsDisplay) window.updateMetricsDisplay();
    return addedCount;
  }

  removeShoppingListItem(itemId) {
    let list = this.getShoppingList();
    list = list.filter(i => (typeof i === "string" ? i !== itemId : i.id !== itemId));
    localStorage.setItem(this.getShoppingListKey(), JSON.stringify(list));
    this.renderShoppingListModal();
    if (window.updateMetricsDisplay) window.updateMetricsDisplay();
  }

  clearShoppingList() {
    localStorage.setItem(this.getShoppingListKey(), JSON.stringify([]));
    this.renderShoppingListModal();
    if (window.updateMetricsDisplay) window.updateMetricsDisplay();
    if (window.showToast) window.showToast("Shopping list cleared.");
  }

  // Smart Ingredient Matching
  normalizeString(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  calculateRecipeMatch(recipe) {
    const pantryItems = (window.store && typeof window.store.getItems === "function") 
      ? window.store.getItems() 
      : [];

    const normalizedPantry = pantryItems.map(item => ({
      raw: item,
      nameNorm: this.normalizeString(item.name),
      isExpiring: (item.status === "Expiring Soon" || item.status === "Expired")
    }));

    const available = [];
    const missing = [];
    const expiring = [];

    const recipeIngredients = recipe.ingredients || [];

    recipeIngredients.forEach(ing => {
      const ingNorm = this.normalizeString(ing);
      const match = normalizedPantry.find(p => 
        p.nameNorm.includes(ingNorm) || ingNorm.includes(p.nameNorm)
      );

      if (match) {
        available.push(ing);
        if (match.isExpiring) {
          expiring.push(ing);
        }
      } else {
        missing.push(ing);
      }
    });

    const totalCount = recipeIngredients.length || 1;
    const matchPercent = Math.round((available.length / totalCount) * 100);

    return {
      matchPercent,
      available,
      missing,
      expiring,
      hasExpiringIngredient: expiring.length > 0,
      isFullyCookable: matchPercent >= 80
    };
  }

  getMatchedRecipes() {
    const all = this.recipes.map(recipe => {
      const matchData = this.calculateRecipeMatch(recipe);
      return {
        ...recipe,
        ...matchData
      };
    });

    // Filter by category
    let filtered = all;

    if (this.activeCategory && this.activeCategory !== "all") {
      if (this.activeCategory === "pantry") {
        filtered = filtered.filter(r => r.matchPercent >= 40);
      } else if (this.activeCategory === "expiring") {
        filtered = filtered.filter(r => r.hasExpiringIngredient);
      } else if (this.activeCategory === "favorites") {
        const favs = this.getFavorites();
        filtered = filtered.filter(r => favs.includes(r.id));
      } else {
        filtered = filtered.filter(r => {
          const cat = this.activeCategory.toLowerCase().replace("-", " ");
          const mainCatMatch = (r.category || "").toLowerCase() === cat;
          const multiCatMatch = (r.categories || []).some(c => c.toLowerCase() === cat);
          const cuisineMatch = (r.cuisine || "").toLowerCase() === cat;
          return mainCatMatch || multiCatMatch || cuisineMatch;
        });
      }
    }

    // Filter by search query
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(r => {
        const nameMatch = r.name.toLowerCase().includes(q);
        const cuisineMatch = (r.cuisine || "").toLowerCase().includes(q);
        const catMatch = (r.category || "").toLowerCase().includes(q);
        const ingMatch = (r.ingredients || []).some(i => i.toLowerCase().includes(q));
        return nameMatch || cuisineMatch || catMatch || ingMatch;
      });
    }

    // Smart Priority Sort:
    // 1. Recipes using expiring ingredients first
    // 2. Highest Match %
    // 3. Quickest cooking time
    filtered.sort((a, b) => {
      if (a.hasExpiringIngredient && !b.hasExpiringIngredient) return -1;
      if (!a.hasExpiringIngredient && b.hasExpiringIngredient) return 1;
      if (b.matchPercent !== a.matchPercent) return b.matchPercent - a.matchPercent;
      return (a.totalMinutes || 30) - (b.totalMinutes || 30);
    });

    return filtered;
  }

  setCategory(catId) {
    this.activeCategory = catId;
    this.renderCategoryChips();
    this.renderRecipeKitchen();
  }

  setSearchQuery(query) {
    this.searchQuery = query;
    this.renderRecipeKitchen();
  }

  showPantryMatches() {
    this.activeCategory = "pantry";
    this.renderCategoryChips();
    this.renderRecipeKitchen();
    this.scrollToRecipeKitchen();
  }

  showExpiringRecipes() {
    this.activeCategory = "expiring";
    this.renderCategoryChips();
    this.renderRecipeKitchen();
    this.scrollToRecipeKitchen();
  }

  showFavorites() {
    this.activeCategory = "favorites";
    this.renderCategoryChips();
    this.renderRecipeKitchen();
    this.scrollToRecipeKitchen();
  }

  scrollToRecipeKitchen() {
    const section = document.getElementById("recipesSection");
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }
  }

  renderCategoryChips() {
    const container = document.getElementById("recipeCategoryChips");
    if (!container) return;

    const categories = window.RECIPE_CATEGORIES || [];
    container.innerHTML = categories.map(cat => {
      const isActive = this.activeCategory === cat.id;
      return `
        <button type="button" class="recipe-chip-btn ${isActive ? 'active' : ''}" onclick="window.RecipeEngine.setCategory('${cat.id}')">
          <span class="chip-emoji">${cat.emoji}</span>
          <span>${cat.name}</span>
        </button>
      `;
    }).join("");
  }

  updateExpiringBanner() {
    const banner = document.getElementById("recipeExpiringBanner");
    if (!banner) return;

    const pantryItems = (window.store && typeof window.store.getItems === "function") 
      ? window.store.getItems() 
      : [];

    const expiringItems = pantryItems.filter(i => 
      i.status === "Expiring Soon" || i.status === "Expired" || (window.getDaysDifference && window.getDaysDifference(i.expiryDate) <= 3)
    );

    if (expiringItems.length === 0) {
      banner.style.display = "none";
      return;
    }

    const itemNames = expiringItems.map(i => i.name).slice(0, 3).join(", ");
    banner.style.display = "flex";
    banner.innerHTML = `
      <div class="expiring-banner-content">
        <div class="expiring-flame">🔥</div>
        <div class="expiring-text-wrap">
          <h4>Use Before It Expires</h4>
          <p>You have <strong>${escapeHTML(itemNames)}</strong> expiring soon. Discover tasty recipes to use them today!</p>
        </div>
      </div>
      <button class="expiring-banner-btn" onclick="window.RecipeEngine.showExpiringRecipes()">
        View Expiring Recipes ➔
      </button>
    `;
  }

  renderRecipeKitchen() {
    const grid = document.getElementById("recipesGrid");
    const countEl = document.getElementById("recipesMatchCount");
    if (!grid) return;

    const recipes = this.getMatchedRecipes();
    const readyToCookCount = recipes.filter(r => r.matchPercent >= 80).length;

    if (countEl) {
      countEl.innerHTML = `Showing <strong>${recipes.length}</strong> recipes • <strong>${readyToCookCount}</strong> ready to cook with your pantry`;
    }

    if (recipes.length === 0) {
      grid.innerHTML = `
        <div class="no-recipes-card" style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: #ffffff; border-radius: 20px; border: 1.5px dashed #e2e8f0;">
          <div style="font-size: 42px; margin-bottom: 12px;">🍳</div>
          <h3 style="font-size: 18px; font-weight: 800; color: #1e392a; margin-bottom: 6px;">No matching recipes found</h3>
          <p style="font-size: 13.5px; color: #64748b; margin-bottom: 18px;">Try searching for a different ingredient or select "All Recipes".</p>
          <button class="recipe-action-btn primary" onclick="window.RecipeEngine.setCategory('all')" style="padding: 10px 20px; font-size: 13px;">View All 185+ Free Recipes</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = recipes.map(recipe => {
      const isFav = this.isFavorite(recipe.id);
      let matchBadgeClass = "match-low";
      if (recipe.matchPercent >= 80) matchBadgeClass = "match-high";
      else if (recipe.matchPercent >= 50) matchBadgeClass = "match-med";

      const vegBadge = recipe.isVegetarian 
        ? `<span class="diet-pill veg">🥦 Veg</span>` 
        : `<span class="diet-pill non-veg">🍗 Non-Veg</span>`;

      return `
        <div class="recipe-card" onclick="window.RecipeEngine.openRecipeDetail('${recipe.id}')">
          <div class="recipe-img-container">
            <img src="${recipe.image}" alt="${escapeHTML(recipe.name)}" class="recipe-card-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'">
            
            <div class="recipe-card-badges">
              <span class="match-badge ${matchBadgeClass}">${recipe.matchPercent}% Match</span>
              ${recipe.hasExpiringIngredient ? '<span class="expiring-badge">🔥 Use Soon</span>' : ''}
            </div>

            <button type="button" class="recipe-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.RecipeEngine.toggleFavorite('${recipe.id}')" aria-label="Favorite recipe">
              ${isFav ? '❤️' : '🤍'}
            </button>
          </div>

          <div class="recipe-card-body">
            <div class="recipe-card-top-meta">
              <span class="recipe-cuisine-tag">${escapeHTML(recipe.cuisine || recipe.category)}</span>
              ${vegBadge}
            </div>

            <h3 class="recipe-card-title">${escapeHTML(recipe.name)}</h3>
            <p class="recipe-card-desc">${escapeHTML(recipe.description)}</p>

            <div class="recipe-ingredient-summary">
              <div class="have-summary">
                <span class="check-icon">✓</span>
                <span>${recipe.available.length} of ${recipe.ingredients.length} in pantry</span>
              </div>
              ${recipe.missing.length > 0 ? `
                <div class="missing-summary">
                  <span>○ ${recipe.missing.length} missing</span>
                </div>
              ` : `
                <div class="ready-summary">
                  <span>✨ Ready to Cook!</span>
                </div>
              `}
            </div>

            <div class="recipe-card-footer">
              <div class="recipe-time-info">
                <span>⏱ ${recipe.totalMinutes || 25} min</span>
                <span>•</span>
                <span>${recipe.difficulty || 'Easy'}</span>
              </div>
              <button type="button" class="recipe-view-btn" onclick="event.stopPropagation(); window.RecipeEngine.openRecipeDetail('${recipe.id}')">
                View Recipe ➔
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // Recipe Detail Modal
  openRecipeDetail(recipeId) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    const matchData = this.calculateRecipeMatch(recipe);
    this.currentDetailRecipe = { ...recipe, ...matchData };

    const modal = document.getElementById("recipeDetailModal");
    if (!modal) return;

    document.getElementById("detailRecipeImg").src = recipe.image;
    document.getElementById("detailRecipeTitle").textContent = recipe.name;
    document.getElementById("detailRecipeDesc").textContent = recipe.description;
    document.getElementById("detailCuisineTag").textContent = `${recipe.cuisine || recipe.category} • ${recipe.isVegetarian ? '🥦 Vegetarian' : '🍗 Non-Vegetarian'}`;
    document.getElementById("detailPrepTime").textContent = recipe.prepTime || "10 mins";
    document.getElementById("detailCookTime").textContent = recipe.cookTime || "15 mins";
    document.getElementById("detailServings").textContent = `${recipe.servings || 4} Servings`;
    document.getElementById("detailDifficulty").textContent = recipe.difficulty || "Easy";

    // Nutrition
    const nut = recipe.nutrition || { calories: 350, protein: "18g", carbs: "45g", fat: "12g" };
    document.getElementById("detailCalories").textContent = `${nut.calories} kcal`;
    document.getElementById("detailProtein").textContent = nut.protein;
    document.getElementById("detailCarbs").textContent = nut.carbs;
    document.getElementById("detailFat").textContent = nut.fat;

    // Match %
    const matchBar = document.getElementById("detailMatchBar");
    const matchText = document.getElementById("detailMatchText");
    if (matchBar) matchBar.style.width = `${matchData.matchPercent}%`;
    if (matchText) matchText.textContent = `${matchData.matchPercent}% Match (${matchData.available.length} of ${recipe.ingredients.length} available)`;

    // Ingredients List
    const ingContainer = document.getElementById("detailIngredientsList");
    if (ingContainer) {
      ingContainer.innerHTML = recipe.ingredients.map(ing => {
        const isHave = matchData.available.includes(ing);
        const isExp = matchData.expiring.includes(ing);

        let statusHtml = `<span class="ing-status have">✓ In Pantry</span>`;
        if (isExp) {
          statusHtml = `<span class="ing-status expiring">🔥 Expiring Soon</span>`;
        } else if (!isHave) {
          statusHtml = `<span class="ing-status missing">○ Missing</span>`;
        }

        return `
          <div class="detail-ing-item ${isHave ? 'available' : 'missing'}">
            <div class="detail-ing-name">
              <span class="ing-bullet">${isHave ? '✓' : '○'}</span>
              <span>${escapeHTML(ing)}</span>
            </div>
            ${statusHtml}
          </div>
        `;
      }).join("");
    }

    // Step-by-Step Instructions
    const instContainer = document.getElementById("detailInstructionsList");
    if (instContainer) {
      instContainer.innerHTML = (recipe.instructions || []).map((step, idx) => `
        <div class="detail-step-item">
          <div class="step-num">${idx + 1}</div>
          <div class="step-text">${escapeHTML(step)}</div>
        </div>
      `).join("");
    }

    this.updateDetailFavoriteBtn();
    modal.classList.add("active");
  }

  closeRecipeDetail() {
    const modal = document.getElementById("recipeDetailModal");
    if (modal) modal.classList.remove("active");
  }

  updateDetailFavoriteBtn() {
    const btn = document.getElementById("detailFavBtn");
    if (!btn || !this.currentDetailRecipe) return;
    const isFav = this.isFavorite(this.currentDetailRecipe.id);
    btn.innerHTML = isFav ? "❤️ Saved in Favorites" : "🤍 Save Recipe";
  }

  toggleCurrentDetailFavorite() {
    if (!this.currentDetailRecipe) return;
    this.toggleFavorite(this.currentDetailRecipe.id);
    this.updateDetailFavoriteBtn();
  }

  addCurrentMissingToShopping() {
    if (!this.currentDetailRecipe) return;
    const missing = this.currentDetailRecipe.missing || [];
    if (missing.length === 0) {
      if (window.showToast) window.showToast("You already have all ingredients in your pantry! 🎉");
      return;
    }
    const count = this.addToShoppingList(missing);
    if (window.showToast) window.showToast(`Added ${count} missing item(s) to your Shopping List! 🛒`);
  }

  cookCurrentRecipe() {
    if (!this.currentDetailRecipe) return;
    const recipe = this.currentDetailRecipe;
    
    // Reduce matching items in pantry by 1
    if (window.store && typeof window.store.getItems === "function") {
      const items = window.store.getItems();
      recipe.ingredients.forEach(ing => {
        const ingNorm = this.normalizeString(ing);
        const match = items.find(i => this.normalizeString(i.name).includes(ingNorm) || ingNorm.includes(this.normalizeString(i.name)));
        if (match && Number(match.quantity) > 0) {
          match.quantity = Math.max(0, Number(match.quantity) - 1);
        }
      });
      window.store.saveItems(items);
    }

    this.closeRecipeDetail();
    if (window.showToast) {
      window.showToast(`🍳 Enjoy cooking ${recipe.name}! Pantry ingredients updated.`);
    }
  }

  shareCurrentRecipe() {
    if (!this.currentDetailRecipe) return;
    const recipe = this.currentDetailRecipe;
    const text = `Check out this delicious recipe: ${recipe.name} (${recipe.cuisine} • ${recipe.totalMinutes} min) on Smart Pantry!`;
    if (navigator.share) {
      navigator.share({
        title: recipe.name,
        text: text,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${text} ${window.location.href}`).then(() => {
        if (window.showToast) window.showToast("Recipe link copied to clipboard! 📋");
      }).catch(() => {});
    }
  }

  // Shopping List Modal
  openShoppingListModal() {
    const modal = document.getElementById("shoppingListModal");
    if (!modal) return;
    this.renderShoppingListModal();
    modal.classList.add("active");
  }

  closeShoppingListModal() {
    const modal = document.getElementById("shoppingListModal");
    if (modal) modal.classList.remove("active");
  }

  renderShoppingListModal() {
    const container = document.getElementById("shoppingListItemsContainer");
    if (!container) return;

    const list = this.getShoppingList();
    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: #94a3b8;">
          <div style="font-size: 36px; margin-bottom: 8px;">🛒</div>
          <p style="font-weight: 700; color: #475569;">Your shopping list is empty</p>
          <small>Add missing recipe ingredients with 1-click!</small>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(item => {
      const id = typeof item === "string" ? item : item.id;
      const name = typeof item === "string" ? item : item.name;
      const checked = (typeof item === "object" && item.checked) ? "checked" : "";

      return `
        <div class="shopping-item-row" id="shop_row_${id}">
          <label class="shopping-item-label">
            <input type="checkbox" ${checked} onchange="window.RecipeEngine.toggleShoppingItemCheck('${id}', this.checked)">
            <span class="shopping-item-text ${checked ? 'completed' : ''}">${escapeHTML(name)}</span>
          </label>
          <div class="shopping-item-actions">
            <button class="shop-add-pantry-btn" onclick="window.RecipeEngine.moveShoppingItemToPantry('${id}', '${escapeHTML(name)}')" title="Add directly to Pantry">
              + Pantry
            </button>
            <button class="shop-delete-btn" onclick="window.RecipeEngine.removeShoppingListItem('${id}')" title="Remove">
              ✕
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  toggleShoppingItemCheck(itemId, isChecked) {
    const list = this.getShoppingList();
    const item = list.find(i => (typeof i === "string" ? i === itemId : i.id === itemId));
    if (item && typeof item === "object") {
      item.checked = isChecked;
      localStorage.setItem(this.getShoppingListKey(), JSON.stringify(list));
      this.renderShoppingListModal();
    }
  }

  moveShoppingItemToPantry(itemId, itemName) {
    if (window.store && typeof window.store.addItem === "function") {
      window.store.addItem({
        name: itemName,
        category: "Pantry",
        quantity: 1,
        unit: "pcs",
        expiryDate: window.getRelativeDateISO ? window.getRelativeDateISO(7) : null
      });
      this.removeShoppingListItem(itemId);
      if (window.showToast) window.showToast(`Added ${itemName} to your pantry! 🌿`);
    }
  }
}

// Global Recipe Engine instance
window.RecipeEngine = new RecipeEngineManager();

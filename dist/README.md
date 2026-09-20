# 🍃 Smart Pantry (IntelliPantry)

> **Fresh Food, Brighter Days — Real-Time Inventory, Expiration Tracking & 100% Free Recipe Recommendation Kitchen.**

---

## 🌟 Key Features

### 1. 🍳 Free Real-Time Recipe Kitchen (Zero Paywalls)
- **185+ Master Recipes**: Covers 24 categories including Breakfast, Kerala, South Indian, North Indian, Rice, Chicken, Meat, Fish, Vegetarian, Vegan, Pasta, Quick Meals, Desserts, Healthy, and Drinks.
- **Real-Time Pantry Matching**: Automatically calculates the exact ingredient match % against your live pantry (e.g. `85% Match • 5 of 7 available in pantry`).
- **🔥 Use Before It Expires**: Recipes using ingredients expiring within 1–3 days automatically rise to the top to prevent food waste.
- **Smart Shopping List**: 1-click addition of missing recipe ingredients into your personal shopping list with `+ Pantry` direct restock.
- **Interactive Recipe Detail**: Step-by-step instructions, nutrition breakdown (calories, protein, carbs, fat), servings, cooking times, and `Cook This` pantry integration.

### 2. 📦 Real-Time Inventory & Expiration Management
- **Automatic Status Calculation**: Dynamically computes `Fresh`, `Expiring Soon` (<= 7 days), `Expired`, and `Low Stock`.
- **Midnight Rollover Engine**: Automatically refreshes relative shelf life and expiry dates at midnight without manual reloading.
- **AI Bill & Receipt OCR Scanner**: Built-in client-side Tesseract.js scanner converts grocery bills into organized pantry items.
- **Barcode Camera Scanner**: Fast barcode lookup and instant pantry entry.

### 3. 👤 Local Storage User Database (`smartpantry_users_db`)
- Multi-user isolation in `localStorage`: each registered user possesses their own isolated inventory, settings, and shopping list.
- Frictionless authentication with instant session generation.
- 1-Click Guest / Demo login mode.

### 4. ⏰ Dual Real-Time Clocks & Live Geolocation
- Dual live 12-hour clocks ticking every 1000ms with AM/PM, dynamic day of the week, and localized date.
- Triple-fallback geolocation engine (Browser GPS ➔ OpenStreetMap Reverse Geocoding ➔ IP Geolocation).

---

## 🚀 Getting Started

### Local Setup
1. Clone or download this repository.
2. Open `login.html` or `index.html` in any modern web browser.
3. Sign in, create an account, or click **⚡ Quick Guest Login** for instant access.

### Deployment on Vercel
The repository is pre-configured with `vercel.json` for zero-configuration deployment:
```bash
git push origin main
```

---

## 🛠️ Tech Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Custom CSS & Tailwind
- **AI / OCR**: Tesseract.js
- **State Management**: Central Reactive Store with LocalStorage user database
- **Deployment**: Vercel Serverless Functions (`/api/auth.js`)

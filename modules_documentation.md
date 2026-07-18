# Little to Large - Project Directory & Module Documentation

This document provides a comprehensive structural guide to the codebase of the **Little to Large (L2L) Premium Family Wardrobe E-Store**.

---

## 📂 1. Directory Tree & File Mapping

```text
├── config/                  # Configuration details (optional)
├── database/                # Local SQLite binary databases
├── middleware/              # Express Request validation layers
│   ├── auth.js              # Shopper JWT validation middleware
│   └── ipFilter.js          # Admin whitelist IP address security
├── public/                  # Frontend Storefront Assets (static files)
│   ├── css/
│   │   └── style.css        # Master stylesheet with Outfit/Jakarta typography
│   ├── images/
│   │   ├── products/        # Default vector svgs/png placeholder graphics
│   │   └── uploads/         # Admin uploaded product / AI generated assets
│   ├── js/
│   │   ├── admin.js         # Admin dashboard table rendering and management
│   │   ├── app.js           # Shared catalog loading and user token utilities
│   │   ├── chatbot.js       # Noupe client message handling & order tracker
│   │   └── payments.js      # Cart summary, coupons, and captcha gateway
│   ├── index.html           # Main storefront home page with carousel & new arrivals
│   ├── products.html        # Product catalog browser with filters & categories
│   ├── product-detail.html  # Dedicated item detail page with size/color pickers
│   ├── cart.html            # Shopping cart overview & secure checkout details
│   ├── login.html           # Shopper verification (Firebase Phone Auth & credentials)
│   ├── account.html         # Shopper dashboard, live Shiprocket visual tracker, bill generator
│   ├── about.html           # Brand backstory and family value statement
│   └── admin.html           # Protected backend control console layout
├── scratch/                 # Developer script vault and tests
│   ├── clear-products.js    # purging catalog data for fresh starts
│   ├── test-full-suite.js   # Automated integration / regression test suite
│   └── ...                  # Diagnostic sandbox scripts
├── db.js                    # Database interface layer (handles SQL schemas, triggers, seed engines)
├── server.js                # Core REST API application server (Express.js)
├── package.json             # Node.js project manifests and dependencies
├── .env                     # Local environment configuration file
└── README.md                # General introduction & setup guide
```

---

## ⚙️ 2. Core Modules & Functionality

### 🗄️ Database Management (`db.js`)
*   **Abstract DB Layer**: Dynamically resolves connections for either **SQLite3** (local development) or production **PostgreSQL/MySQL** servers.
*   **Seeding Engine**: Installs default system settings, admin accounts, and initializes tables automatically.

### 🛡️ REST API Routing & Logic (`server.js`)
*   **Auth Module**: Multi-channel login mapping Firebase phone payloads to email constraints.
*   **Logistics Module**: Connects to the **Shiprocket External Courier API** for tracking generation.
*   **Noupe Chatbot API**: Links Gemini 1.5 Flash to localized database catalog context, preventing hallucinations.

### 💳 Checkout & Gateway (`public/js/payments.js`)
*   **Secure Captcha Gateway**: Prevents automated spam orders with a client-generated 4-character visual Captcha verification.
*   **Razorpay Integration**: Handles signature verification and online checkouts.

### 💡 User Experience (`public/js/ux-premium.js`)
*   **Shopper Onboarding Tour**: Adds an interactive popup guide helper showing customer onboarding steps.
*   **Dynamic Visuals**: Features 3D Tilt perspective, Fly-to-Cart product animations, and lazy-loading.

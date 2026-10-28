# Bill Generator — POS & Thermal Receipt Suite

A modern, responsive billing suite and thermal printer application featuring **dedicated Login & Sign-Up screens**, an **SQLite Database** for persistent multi-user storage, **company profile memory**, and **one-click Vercel deployment**.

---

## 🚀 Deploying to Vercel

This repository is pre-configured for **Vercel** with zero setup required:

### Method 1: Import via Vercel Dashboard (Easiest)
1. Go to [vercel.com/new](https://vercel.com/new).
2. Connect your GitHub account and select this repository (**`ShaheerAnis/BillGen`**).
3. Leave all build settings as default (Framework Preset: **Other**; Root Directory: **`./`**).
4. Click **Deploy**. Vercel will build and launch your live site in seconds!

### Method 2: Deploy using Vercel CLI
```bash
npm i -g vercel
vercel
```

### ⚙️ How Vercel Setup Works:
- **`vercel.json`**: Automatically routes `/api/*` requests to the Python serverless function at `api/index.py`, while serving `index.html`, `style.css`, and `app.js` directly via Vercel's global CDN.
- **Serverless SQLite (`/tmp/pos_database.db`)**: Automatically initializes and seeds the database in Vercel's serverless environment, coupled with client-side session caching so user credentials and bills remain seamless.
- **`requirements.txt`**: Standard library only — builds in ~2 seconds with no heavy dependencies.

---

## 💾 Architecture & Storage

### SQLite Database
All data is stored in normalized relational tables:
1. **`users`**: User credentials and salted SHA-256 password hashes.
2. **`sessions`**: Active authentication tokens.
3. **`store_profiles`**: 1:1 user store information (Company Name, Address, Cell #, DSL #, Cashier Name, Counter #, Return Policy). Updates overwrite with the latest version.
4. **`bills`**: Stored receipts and line items per user.

---

## 💻 Running Locally

```bash
python3 server.py 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Default Pre-Seeded Accounts
| Username | Password | Store Name | Cashier |
| :--- | :--- | :--- | :--- |
| `saim` | `123` | SAIM MEDICAL STORE | Shaheer |
| `alshifa` | `123` | AL-SHIFA PHARMACY & GENERAL STORE | Dr. Tariq |
| *(Sign Up)* | *(Any)* | *(Your Store Name)* | *(Your Name)* |

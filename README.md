# SAIM Medical Store — POS Bill Generator & Thermal Receipt Suite

A modern, responsive billing suite and thermal printer application featuring **dedicated Login & Sign-Up screens**, a local **SQLite Database (`pos_database.db`)** for persistent multi-user storage, and **company profile memory**.

---

## Architecture & Storage

### 💾 SQLite Database (`pos_database.db`)
All data is stored locally in SQLite with normalized relational tables:
1. **`users`**:
   - `id` (INTEGER PRIMARY KEY)
   - `username` (TEXT UNIQUE)
   - `password_hash` (Salted SHA-256 hash)
   - `created_at` (TIMESTAMP)
2. **`sessions`**:
   - `token` (TEXT PRIMARY KEY)
   - `user_id` (INTEGER REFERENCES users)
   - `created_at` (TIMESTAMP)
3. **`store_profiles`**:
   - `id` (INTEGER PRIMARY KEY)
   - `user_id` (INTEGER UNIQUE REFERENCES users)
   - `store_name`, `address`, `dsl_no`, `ntn_no`, `cell_no`, `cashier_name`, `counter_no`, `software_credit`, `return_policy`
   - `updated_at` (TIMESTAMP)
   *(Enforces a 1:1 relation per user — updating any company field immediately overwrites with the latest version).*
4. **`bills`**:
   - `id` (INTEGER PRIMARY KEY)
   - `user_id` (INTEGER REFERENCES users)
   - `bill_no`, `payment_id`, `bill_date`, `items_count`, `gross_total`, `bill_state_json`
   - `created_at` (TIMESTAMP)

---

## Features

- **Dedicated Login & Sign-Up Screen**:
  - Full-page authentication gateway before entering the POS billing dashboard.
  - **Sign In Tab**: Fast login with username and password, with pre-configured 1-click demo logins.
  - **Create Account (Sign Up) Tab**: Form to register a store with Company Name, Address, Contact Cell #, DSL #, NTN #, and Cashier Name.
  - Clean **Sign Out** button in dashboard header to terminate session.
- **Persistent Company Information ("Only Latest Saved")**:
  - Edits to store name, address, contact, or license are auto-saved to SQLite with debouncing.
  - Next time that user logs in, their latest company details appear on the screen and on the thermal receipt.
- **Independent Bill Generation**:
  - **"➕ New Bill"**: Prepares a fresh bill while preserving the user's saved store info.
  - Scoped bill history saved directly into SQLite.
- **80mm Thermal Receipt Preview & Printing**:
  - Exact layout match for 80mm roll POS printers.
  - Print media stylesheets (`@media print`) hide controls and isolate the receipt.

---

## Running the Project

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

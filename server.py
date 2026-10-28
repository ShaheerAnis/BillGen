#!/usr/bin/env python3
"""
POS Bill Generator & Thermal Receipt Suite
Backend HTTP Server with SQLite Database Storage for Users, Store Profiles & Bills.
"""
import http.server
import socketserver
import os
import sys
import json
import sqlite3
import hashlib
import secrets
import urllib.parse
from datetime import datetime

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DIRECTORY, "pos_database.db")

# =========================================================================
# SQLite Database Layer
# =========================================================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def hash_password(password, salt=None):
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(stored_hash, password):
    if not stored_hash:
        return False
    if ":" not in stored_hash:
        return stored_hash == password
    salt, hashed = stored_hash.split(":", 1)
    test_hash = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return test_hash == hashed

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()

        # Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Active login sessions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        """)

        # Store / Company Information (One latest record per user)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS store_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                store_name TEXT NOT NULL,
                address TEXT,
                dsl_no TEXT,
                ntn_no TEXT,
                cell_no TEXT,
                cashier_name TEXT,
                counter_no TEXT DEFAULT '01',
                software_credit TEXT DEFAULT 'Software By Heath-Tech Cell # 0311-5505115',
                return_policy TEXT DEFAULT 'No Return or Exchange After 3 Days. Fridge Items Cannot Be Returned or Exchanged.',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        """)

        # Saved Bills per user
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                bill_no TEXT NOT NULL,
                payment_id TEXT,
                bill_date TEXT,
                items_count INTEGER DEFAULT 0,
                gross_total REAL DEFAULT 0.0,
                bill_state_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        """)

        # Seed initial demo accounts if table is empty
        cursor.execute("SELECT COUNT(*) as cnt FROM users")
        if cursor.fetchone()["cnt"] == 0:
            print("🌱 Seeding SQLite database with default users...")
            # Saim Medical Store
            cursor.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                ("saim", hash_password("123"))
            )
            saim_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO store_profiles (
                    user_id, store_name, address, dsl_no, ntn_no, cell_no, cashier_name, counter_no, software_credit, return_policy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                saim_id,
                "SAIM MEDICAL STORE",
                "Bilal Town, Kakul Road, Abbottabad.",
                "AD/RS/296",
                "3930432",
                "0336-5677108",
                "Shaheer",
                "01",
                "Software By Heath-Tech Cell # 0311-5505115",
                "No Return or Exchange After 3 Days. Fridge Items Cannot Be Returned or Exchanged."
            ))

            # Initial sample bill for saim
            sample_state = {
                "store": {
                    "name": "SAIM MEDICAL STORE",
                    "address": "Bilal Town, Kakul Road, Abbottabad.",
                    "dslNo": "AD/RS/296",
                    "ntnNo": "3930432",
                    "cellNo": "0336-5677108",
                    "softwareCredit": "Software By Heath-Tech Cell # 0311-5505115"
                },
                "bill": {
                    "paymentId": "AD-142677",
                    "billNo": "86431",
                    "date": "16/03/2025 2:33:42 PM",
                    "user": "Shaheer",
                    "counter": "01"
                },
                "items": [
                    {"name": "GETRYL 2MG", "quantity": 30, "price": 6.86},
                    {"name": "CONCOR 5MG", "quantity": 28, "price": 22.92},
                    {"name": "XENGLU-MET 12.5/500MG", "quantity": 28, "price": 32.14},
                    {"name": "XULTOPHY (100/3.6) INJ 3ML", "quantity": 1, "price": 10148.00}
                ],
                "discount": 0.00,
                "cashReceived": 12000.00,
                "policy": "No Return or Exchange After 3 Days. Fridge Items Cannot Be Returned or Exchanged."
            }
            cursor.execute("""
                INSERT INTO bills (user_id, bill_no, payment_id, bill_date, items_count, gross_total, bill_state_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (saim_id, "86431", "AD-142677", "16/03/2025 2:33:42 PM", 4, 11895.72, json.dumps(sample_state)))

            # Al-Shifa Pharmacy demo account
            cursor.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                ("alshifa", hash_password("123"))
            )
            alshifa_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO store_profiles (
                    user_id, store_name, address, dsl_no, ntn_no, cell_no, cashier_name, counter_no, software_credit, return_policy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                alshifa_id,
                "AL-SHIFA PHARMACY & GENERAL STORE",
                "Main Supply Bazaar, Mansehra Road, Abbottabad.",
                "AD/RS/412",
                "4819203",
                "0312-9876543",
                "Dr. Tariq",
                "02",
                "Software By Heath-Tech Cell # 0311-5505115",
                "Goods once sold cannot be returned without receipt."
            ))

        conn.commit()

def get_store_info_dict(conn, user_id):
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM store_profiles WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        return {}
    return {
        "name": row["store_name"] or "",
        "address": row["address"] or "",
        "dslNo": row["dsl_no"] or "",
        "ntnNo": row["ntn_no"] or "",
        "cellNo": row["cell_no"] or "",
        "cashierName": row["cashier_name"] or "",
        "user": row["cashier_name"] or "",
        "counter": row["counter_no"] or "01",
        "softwareCredit": row["software_credit"] or "Software By Heath-Tech Cell # 0311-5505115",
        "policy": row["return_policy"] or "No Return or Exchange After 3 Days. Fridge Items Cannot Be Returned or Exchanged."
    }

def get_authenticated_user(headers):
    auth_header = headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = headers.get("X-Auth-Token", "").strip()

    if not token:
        return None, None

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.username 
            FROM sessions s 
            JOIN users u ON s.user_id = u.id 
            WHERE s.token = ?
        """, (token,))
        row = cursor.fetchone()
        if row:
            return {"id": row["id"], "username": row["username"]}, token
    return None, None

# =========================================================================
# HTTP Request Handler
# =========================================================================
class POSSQLiteHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Auth-Token")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Auth-Token")
        self.end_headers()

    def read_json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 0:
                raw_body = self.rfile.read(content_length).decode("utf-8")
                return json.loads(raw_body)
        except Exception as e:
            print(f"Error reading JSON body: {e}")
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Status check
        if path == "/api/status":
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) as count FROM users")
                u_cnt = cursor.fetchone()["count"]
                cursor.execute("SELECT COUNT(*) as count FROM bills")
                b_cnt = cursor.fetchone()["count"]
            return self.send_json(200, {
                "status": "online",
                "database": "SQLite",
                "usersCount": u_cnt,
                "billsCount": b_cnt
            })

        # Get Current Authenticated User & Latest Profile
        if path == "/api/auth/me":
            user, token = get_authenticated_user(self.headers)
            if not user:
                return self.send_json(401, {"error": "Not authenticated. Please log in."})

            with get_db() as conn:
                store_info = get_store_info_dict(conn, user["id"])

            return self.send_json(200, {
                "success": True,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "storeInfo": store_info
                }
            })

        # Get Bills for Authenticated User
        if path == "/api/bills":
            user, token = get_authenticated_user(self.headers)
            if not user:
                return self.send_json(401, {"error": "Not authenticated."})

            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id, bill_no, payment_id, bill_date, items_count, gross_total, bill_state_json, created_at 
                    FROM bills 
                    WHERE user_id = ? 
                    ORDER BY id DESC 
                    LIMIT 50
                """, (user["id"],))
                rows = cursor.fetchall()
                bills = []
                for r in rows:
                    try:
                        state_obj = json.loads(r["bill_state_json"])
                    except Exception:
                        state_obj = {}
                    bills.append({
                        "id": r["id"],
                        "billNo": r["bill_no"],
                        "paymentId": r["payment_id"],
                        "date": r["bill_date"],
                        "itemsCount": r["items_count"],
                        "grossTotal": r["gross_total"],
                        "state": state_obj,
                        "createdAt": r["created_at"]
                    })
            return self.send_json(200, {"success": True, "bills": bills})

        # Static file serving
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        data = self.read_json_body()

        # Sign Up / Registration Form API
        if path == "/api/auth/register":
            username = str(data.get("username", "")).strip().lower()
            password = str(data.get("password", "")).strip()
            store_name = str(data.get("storeName", "")).strip()
            address = str(data.get("address", "")).strip()
            cell_no = str(data.get("cellNo", "")).strip()
            dsl_no = str(data.get("dslNo", "")).strip()
            ntn_no = str(data.get("ntnNo", "")).strip()
            cashier_name = str(data.get("cashierName", "")).strip()
            counter_no = str(data.get("counterNo", "01")).strip() or "01"

            if not username or len(username) < 2:
                return self.send_json(400, {"error": "Username must be at least 2 characters."})
            if not password or len(password) < 3:
                return self.send_json(400, {"error": "Password must be at least 3 characters."})
            if not store_name:
                return self.send_json(400, {"error": "Store / Company Name is required."})
            if not address:
                return self.send_json(400, {"error": "Store address / location is required."})

            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
                if cursor.fetchone():
                    return self.send_json(400, {"error": f"Username '{username}' already exists. Please choose another."})

                # Insert user into SQLite
                cursor.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, hash_password(password))
                )
                user_id = cursor.lastrowid

                # Insert store profile into SQLite
                cursor.execute("""
                    INSERT INTO store_profiles (
                        user_id, store_name, address, dsl_no, ntn_no, cell_no, cashier_name, counter_no, software_credit, return_policy
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id,
                    store_name,
                    address,
                    dsl_no,
                    ntn_no,
                    cell_no,
                    cashier_name or username.capitalize(),
                    counter_no,
                    "Software By Heath-Tech Cell # 0311-5505115",
                    "No Return or Exchange After 3 Days. Fridge Items Cannot Be Returned or Exchanged."
                ))

                # Create session token
                token = secrets.token_hex(24)
                cursor.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
                conn.commit()

                store_info = get_store_info_dict(conn, user_id)

            return self.send_json(200, {
                "success": True,
                "message": "Account created successfully in SQLite",
                "token": token,
                "user": {
                    "id": user_id,
                    "username": username,
                    "storeInfo": store_info
                }
            })

        # Login Form API
        if path == "/api/auth/login":
            username = str(data.get("username", "")).strip().lower()
            password = str(data.get("password", "")).strip()

            if not username or not password:
                return self.send_json(400, {"error": "Please provide both username and password."})

            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,))
                user_row = cursor.fetchone()

                if not user_row or not verify_password(user_row["password_hash"], password):
                    return self.send_json(401, {"error": "Invalid username or password. Please try again."})

                user_id = user_row["id"]

                # Generate new session token
                token = secrets.token_hex(24)
                cursor.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
                conn.commit()

                store_info = get_store_info_dict(conn, user_id)

            return self.send_json(200, {
                "success": True,
                "message": "Login successful",
                "token": token,
                "user": {
                    "id": user_id,
                    "username": user_row["username"],
                    "storeInfo": store_info
                }
            })

        # Logout API
        if path == "/api/auth/logout":
            user, token = get_authenticated_user(self.headers)
            if token:
                with get_db() as conn:
                    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                    conn.commit()
            return self.send_json(200, {"success": True, "message": "Logged out successfully"})

        # Save Latest Store Information ("Only latest is saved")
        if path == "/api/store/profile":
            user, token = get_authenticated_user(self.headers)
            if not user:
                return self.send_json(401, {"error": "Not authenticated."})

            store_info = data.get("storeInfo", {})
            store_name = str(store_info.get("name", "")).strip()
            if not store_name:
                return self.send_json(400, {"error": "Store name cannot be empty."})

            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO store_profiles (
                        user_id, store_name, address, dsl_no, ntn_no, cell_no, cashier_name, counter_no, software_credit, return_policy, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id) DO UPDATE SET
                        store_name = excluded.store_name,
                        address = excluded.address,
                        dsl_no = excluded.dsl_no,
                        ntn_no = excluded.ntn_no,
                        cell_no = excluded.cell_no,
                        cashier_name = excluded.cashier_name,
                        counter_no = excluded.counter_no,
                        software_credit = excluded.software_credit,
                        return_policy = excluded.return_policy,
                        updated_at = CURRENT_TIMESTAMP;
                """, (
                    user["id"],
                    store_name,
                    str(store_info.get("address", "")).strip(),
                    str(store_info.get("dslNo", "")).strip(),
                    str(store_info.get("ntnNo", "")).strip(),
                    str(store_info.get("cellNo", "")).strip(),
                    str(store_info.get("user", "") or store_info.get("cashierName", "")).strip(),
                    str(store_info.get("counter", "01")).strip() or "01",
                    str(store_info.get("softwareCredit", "Software By Heath-Tech Cell # 0311-5505115")).strip(),
                    str(store_info.get("policy", "")).strip()
                ))
                conn.commit()
                latest = get_store_info_dict(conn, user["id"])

            return self.send_json(200, {
                "success": True,
                "message": "Latest store info saved to SQLite",
                "storeInfo": latest
            })

        # Save Bill in SQLite
        if path == "/api/bills":
            user, token = get_authenticated_user(self.headers)
            if not user:
                return self.send_json(401, {"error": "Not authenticated."})

            bill = data.get("bill")
            if not bill:
                return self.send_json(400, {"error": "Bill data is required."})

            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO bills (
                        user_id, bill_no, payment_id, bill_date, items_count, gross_total, bill_state_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    user["id"],
                    str(bill.get("billNo", "")),
                    str(bill.get("paymentId", "")),
                    str(bill.get("date", "")),
                    int(bill.get("itemsCount", 0)),
                    float(bill.get("grossTotal", 0.0)),
                    json.dumps(bill.get("state", {}))
                ))
                conn.commit()
                new_id = cursor.lastrowid

            return self.send_json(200, {
                "success": True,
                "message": f"Bill #{bill.get('billNo')} saved in SQLite",
                "id": new_id
            })

        self.send_json(404, {"error": "API route not found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        data = self.read_json_body()

        # Delete Bill from SQLite
        if path == "/api/bills":
            user, token = get_authenticated_user(self.headers)
            if not user:
                return self.send_json(401, {"error": "Not authenticated."})

            bill_id = data.get("billId")
            clear_all = data.get("clearAll", False)

            with get_db() as conn:
                cursor = conn.cursor()
                if clear_all:
                    cursor.execute("DELETE FROM bills WHERE user_id = ?", (user["id"],))
                elif bill_id:
                    cursor.execute("DELETE FROM bills WHERE user_id = ? AND id = ?", (user["id"], bill_id))
                conn.commit()

            return self.send_json(200, {"success": True, "message": "Bill(s) deleted from SQLite"})

        self.send_json(404, {"error": "API route not found"})

def run_server():
    init_db()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), POSSQLiteHandler) as httpd:
        print(f"======================================================")
        print(f" 🧾 BILL GENERATOR - SQLite Backend Online")
        print(f" URL: http://localhost:{PORT}")
        print(f" SQLite Database: {DB_PATH}")
        print(f" Press Ctrl+C to stop the server")
        print(f"======================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server gracefully...")
            httpd.server_close()

if __name__ == "__main__":
    port_arg = sys.argv[1] if len(sys.argv) > 1 else PORT
    try:
        PORT = int(port_arg)
    except ValueError:
        pass
    run_server()

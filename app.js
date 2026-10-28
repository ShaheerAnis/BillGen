/**
 * SAIM Medical Store - POS & Thermal Bill Generator
 * Powered by SQLite Database for Users, Store Profiles & Bills.
 */

const DEFAULT_TEMPLATE = {
  store: {
    name: "SAIM MEDICAL STORE",
    address: "Bilal Town, Kakul Road, Abbottabad.",
    dslNo: "AD/RS/296",
    cellNo: "0336-5677108",
    softwareCredit: "Software By Heath-Tech Cell # 0311-5505115"
  },
  bill: {
    paymentId: "AD-142677",
    billNo: "86431",
    date: "16/03/2025 2:33:42 PM",
    user: "Shaheer",
    counter: "01"
  },
  items: [
    { name: "GETRYL 2MG", quantity: 30, price: 6.86 },
    { name: "CONCOR 5MG", quantity: 28, price: 22.92 },
    { name: "XENGLU-MET 12.5/500MG", quantity: 28, price: 32.14 },
    { name: "XULTOPHY (100/3.6) INJ 3ML", quantity: 1, price: 10148.00 }
  ],
  discount: 0.00,
  cashReceived: 12000.00,
  policy: "No Return or Exchange After 3 Days. Fridge Items Cannot Be Returned or Exchanged."
};

let state = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
let currentUser = null;
let authToken = localStorage.getItem("pos_auth_token");
let isZoomed = false;
let autoSaveTimer = null;

// =========================================================================
// API Client (Direct connection to SQLite backend)
// =========================================================================
const api = {
  async request(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(endpoint, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  },

  // Auth: Login
  login(username, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },

  // Auth: Register (Sign Up)
  register(payload) {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  // Auth: Get current logged-in user
  me() {
    return this.request("/api/auth/me");
  },

  // Auth: Logout
  logout() {
    return this.request("/api/auth/logout", { method: "POST" });
  },

  // Store: Save latest profile to SQLite
  saveStoreProfile(storeInfo) {
    return this.request("/api/store/profile", {
      method: "POST",
      body: JSON.stringify({ storeInfo })
    });
  },

  // Bills: Fetch bills from SQLite
  getBills() {
    return this.request("/api/bills");
  },

  // Bills: Save a bill to SQLite
  saveBill(bill) {
    return this.request("/api/bills", {
      method: "POST",
      body: JSON.stringify({ bill })
    });
  },

  // Bills: Delete bill in SQLite
  deleteBill(billId) {
    return this.request("/api/bills", {
      method: "DELETE",
      body: JSON.stringify({ billId })
    });
  },

  // Bills: Clear all bills in SQLite
  clearAllBills() {
    return this.request("/api/bills", {
      method: "DELETE",
      body: JSON.stringify({ clearAll: true })
    });
  }
};

// =========================================================================
// Screen Switching (Dedicated Login View vs Billing Dashboard)
// =========================================================================
function showAuthScreen() {
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("posScreen").style.display = "none";
  clearAuthAlert();
}

function showPosScreen() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("posScreen").style.display = "block";
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById("tabLoginLink");
  const tabSignup = document.getElementById("tabSignupLink");
  const secLogin = document.getElementById("signInSection");
  const secSignup = document.getElementById("signUpSection");

  clearAuthAlert();

  if (tab === "signup") {
    tabLogin.classList.remove("active");
    tabSignup.classList.add("active");
    secLogin.classList.remove("active");
    secSignup.classList.add("active");
    document.getElementById("regUser").focus();
  } else {
    tabSignup.classList.remove("active");
    tabLogin.classList.add("active");
    secSignup.classList.remove("active");
    secLogin.classList.add("active");
    document.getElementById("loginUser").focus();
  }
}

function showAuthAlert(message, type = "error") {
  const box = document.getElementById("authAlertBox");
  box.className = `auth-alert-box ${type}`;
  box.innerText = message;
  box.style.display = "block";
}

function clearAuthAlert() {
  const box = document.getElementById("authAlertBox");
  box.style.display = "none";
  box.innerText = "";
}

// =========================================================================
// Authentication Handlers
// =========================================================================
async function handleLogin() {
  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value.trim();

  if (!username) {
    showAuthAlert("Please enter your username.");
    document.getElementById("loginUser").focus();
    return;
  }
  if (!password) {
    showAuthAlert("Please enter your password.");
    document.getElementById("loginPass").focus();
    return;
  }

  const btn = document.getElementById("btnSubmitLogin");
  const originalText = btn.innerText;
  btn.innerText = "Signing in...";
  btn.disabled = true;

  try {
    const data = await api.login(username, password);
    authToken = data.token;
    localStorage.setItem("pos_auth_token", authToken);
    applyUserSession(data.user);
    showToast(`Welcome back, ${data.user.storeInfo.name}!`, "success");
    document.getElementById("loginPass").value = "";
  } catch (err) {
    showAuthAlert(err.message || "Invalid login credentials.");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

async function handleSignup() {
  const username = document.getElementById("regUser").value.trim();
  const password = document.getElementById("regPass").value.trim();
  const storeName = document.getElementById("regStore").value.trim();
  const address = document.getElementById("regAddr").value.trim();
  const cashierName = document.getElementById("regCashierName").value.trim();
  const cellNo = document.getElementById("regPhone").value.trim();
  const dslNo = document.getElementById("regDslNo").value.trim();

  if (!username || username.length < 2) {
    showAuthAlert("Username must be at least 2 characters.");
    document.getElementById("regUser").focus();
    return;
  }
  if (!password || password.length < 3) {
    showAuthAlert("Password must be at least 3 characters.");
    document.getElementById("regPass").focus();
    return;
  }
  if (!storeName) {
    showAuthAlert("Please enter your Company / Store Name.");
    document.getElementById("regStore").focus();
    return;
  }
  if (!address) {
    showAuthAlert("Please enter your Store Location / Address.");
    document.getElementById("regAddr").focus();
    return;
  }

  const btn = document.getElementById("btnSubmitSignup");
  const originalText = btn.innerText;
  btn.innerText = "Creating account in SQLite...";
  btn.disabled = true;

  try {
    const data = await api.register({
      username,
      password,
      storeName,
      address,
      cashierName,
      cellNo,
      dslNo
    });

    authToken = data.token;
    localStorage.setItem("pos_auth_token", authToken);
    applyUserSession(data.user);
    showToast(`Store registered in SQLite: ${storeName}`, "success");
    document.getElementById("formSignUp").reset();
  } catch (err) {
    showAuthAlert(err.message || "Failed to create account.");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

async function handleLogout() {
  if (confirm("Are you sure you want to sign out?")) {
    try {
      await api.logout();
    } catch (e) {}

    authToken = null;
    currentUser = null;
    localStorage.removeItem("pos_auth_token");
    localStorage.removeItem("pos_cached_user");
    showAuthScreen();
    showToast("Signed out successfully", "info");
  }
}

function applyUserSession(user) {
  currentUser = user;
  localStorage.setItem("pos_cached_user", JSON.stringify(user));
  const store = user.storeInfo || {};

  // Hydrate state with user's stored SQLite details
  state.store.name = store.name || "STORE NAME";
  state.store.address = store.address || "";
  state.store.dslNo = store.dslNo || "";
  state.store.cellNo = store.cellNo || "";
  state.store.softwareCredit = store.softwareCredit || "Software By Heath-Tech Cell # 0311-5505115";
  state.bill.user = store.user || store.cashierName || user.username;
  state.bill.counter = store.counter || "01";
  if (store.policy) {
    state.policy = store.policy;
  }

  // Generate fresh bill IDs for this session
  state.bill.billNo = generateBillNumber();
  state.bill.paymentId = generatePaymentId();
  state.bill.date = getCurrentFormattedDate();

  // Update header titles & user pill
  const brandTitleEl = document.getElementById("headerBrandTitle");
  if (brandTitleEl) brandTitleEl.innerText = "Bill Generator";
  const storeBadgeEl = document.getElementById("headerStoreBadge");
  if (storeBadgeEl) storeBadgeEl.innerText = state.store.name;
  document.getElementById("userPillName").innerText = state.bill.user;
  document.getElementById("userPillStore").innerText = state.store.name;

  // Sync inputs and render preview
  syncAllEditorInputs();
  renderEditorItemsTable();
  renderReceiptPreview();
  updateSqliteStatus("saved");
  updateHistoryBadge();

  // Show POS Screen
  showPosScreen();
}

// =========================================================================
// SQLite Store Info Auto-Saving ("Only the latest must be saved")
// =========================================================================
function updateSqliteStatus(status) {
  const dot = document.getElementById("storeStatusDot");
  const text = document.getElementById("storeStatusText");
  if (!dot || !text) return;

  if (status === "saving") {
    dot.className = "status-dot saving";
    text.innerText = "SQLite: Saving latest info...";
  } else if (status === "saved") {
    dot.className = "status-dot saved";
    text.innerText = "SQLite: Latest info saved";
  }
}

function scheduleStoreAutoSave() {
  updateSqliteStatus("saving");
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveStoreProfileToSqlite(false);
  }, 450);
}

async function saveStoreProfileToSqlite(showToastNotification = false) {
  if (!currentUser) return;

  const latestInfo = {
    name: document.getElementById("inputStoreName").value.trim() || state.store.name,
    address: document.getElementById("inputAddress").value.trim(),
    dslNo: document.getElementById("inputDslNo").value.trim(),
    cellNo: document.getElementById("inputCellNo").value.trim(),
    softwareCredit: document.getElementById("inputSoftwareCredit").value.trim(),
    user: document.getElementById("inputUser").value.trim(),
    cashierName: document.getElementById("inputUser").value.trim(),
    counter: document.getElementById("inputCounter").value.trim(),
    policy: document.getElementById("inputPolicy").value.trim()
  };

  // Update local memory
  state.store.name = latestInfo.name;
  state.store.address = latestInfo.address;
  state.store.dslNo = latestInfo.dslNo;
  state.store.cellNo = latestInfo.cellNo;
  state.store.softwareCredit = latestInfo.softwareCredit;
  state.bill.user = latestInfo.user;
  state.bill.counter = latestInfo.counter;
  state.policy = latestInfo.policy;
  currentUser.storeInfo = latestInfo;

  // Header update
  const brandTitleEl = document.getElementById("headerBrandTitle");
  if (brandTitleEl) brandTitleEl.innerText = "Bill Generator";
  const storeBadgeEl = document.getElementById("headerStoreBadge");
  if (storeBadgeEl) storeBadgeEl.innerText = latestInfo.name;
  document.getElementById("userPillName").innerText = latestInfo.user;
  document.getElementById("userPillStore").innerText = latestInfo.name;

  try {
    await api.saveStoreProfile(latestInfo);
    updateSqliteStatus("saved");
    if (showToastNotification) {
      showToast("Store details saved in SQLite database", "success");
    }
  } catch (err) {
    console.error("SQLite save error:", err);
    updateSqliteStatus("saved");
  }
}

// =========================================================================
// Bill Operations (Scoped to SQLite User)
// =========================================================================
function startNewBill() {
  // Keep saved company metadata!
  state.bill.billNo = generateBillNumber();
  state.bill.paymentId = generatePaymentId();
  state.bill.date = getCurrentFormattedDate();
  state.items = [];
  state.discount = 0.00;
  state.cashReceived = 0.00;

  syncAllEditorInputs();
  renderEditorItemsTable();
  renderReceiptPreview();
  showToast(`New Bill #${state.bill.billNo} initialized`, "success");
}

async function saveCurrentBillToSqlite() {
  if (!currentUser) return;

  const { grossTotal } = calculateTotals();
  const billSnapshot = {
    billNo: state.bill.billNo,
    paymentId: state.bill.paymentId,
    date: state.bill.date,
    itemsCount: state.items.length,
    grossTotal: grossTotal,
    state: JSON.parse(JSON.stringify(state))
  };

  try {
    await api.saveBill(billSnapshot);
    updateHistoryBadge();
    showToast(`Bill #${state.bill.billNo} saved to SQLite`, "success");
  } catch (err) {
    showToast(`Failed to save bill: ${err.message}`, "warning");
  }
}

async function updateHistoryBadge() {
  try {
    const data = await api.getBills();
    const badge = document.getElementById("historyCount");
    if (badge) badge.innerText = (data.bills || []).length;
  } catch (e) {}
}

async function openHistoryModal() {
  const modal = document.getElementById("historyModal");
  const container = document.getElementById("historyListContainer");

  try {
    const data = await api.getBills();
    const bills = data.bills || [];

    if (bills.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 36px 0;">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <p>No saved bills in SQLite for <strong>${escapeHtml(currentUser.storeInfo?.name || currentUser.username)}</strong>.</p>
          <p style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">Click "💾 Save Bill" to record receipts.</p>
        </div>
      `;
    } else {
      container.innerHTML = bills.map(item => `
        <div style="background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div>
            <div style="font-weight: 700; font-size: 14px; color: #60a5fa;">
              Bill #${escapeHtml(item.billNo)} &nbsp;·&nbsp; ${escapeHtml(item.paymentId)}
            </div>
            <div style="font-size: 11px; color: var(--text-dim); margin-top: 3px;">
              ${escapeHtml(item.date)} · ${item.itemsCount} items · <strong>Rs. ${fmt(item.grossTotal)}</strong>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-emerald btn-sm" onclick="loadSavedBill(${item.id})">📂 Load</button>
            <button class="btn btn-danger-ghost btn-sm" onclick="deleteSavedBill(${item.id})">✕</button>
          </div>
        </div>
      `).join("");
    }
  } catch (err) {
    container.innerHTML = `<p style="color: #f87171; text-align: center;">Error loading bills: ${err.message}</p>`;
  }

  modal.classList.add("active");
}

function closeHistoryModal() {
  document.getElementById("historyModal").classList.remove("active");
}

async function clearAllHistory() {
  if (confirm("Delete all saved bill records from SQLite for your store?")) {
    try {
      await api.clearAllBills();
      updateHistoryBadge();
      openHistoryModal();
      showToast("All bills cleared from SQLite", "info");
    } catch (err) {
      showToast("Error clearing history", "warning");
    }
  }
}

window.loadSavedBill = async function(id) {
  try {
    const data = await api.getBills();
    const entry = (data.bills || []).find(h => h.id === id);
    if (entry && entry.state) {
      state = JSON.parse(JSON.stringify(entry.state));
      syncAllEditorInputs();
      renderEditorItemsTable();
      renderReceiptPreview();
      closeHistoryModal();
      showToast(`Loaded Bill #${state.bill.billNo}`, "success");
    }
  } catch (e) {
    showToast("Failed to load bill", "warning");
  }
};

window.deleteSavedBill = async function(id) {
  try {
    await api.deleteBill(id);
    updateHistoryBadge();
    openHistoryModal();
    showToast("Bill deleted from SQLite", "info");
  } catch (e) {
    showToast("Failed to delete bill", "warning");
  }
};

// =========================================================================
// General Math, Utilities & Formatting
// =========================================================================
function fmt(num) {
  const n = parseFloat(num);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}

function getCurrentFormattedDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
}

function generateBillNumber() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

function generatePaymentId() {
  return "AD-" + String(Math.floor(100000 + Math.random() * 900000));
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  const icon = type === "success" ? "✅" : type === "warning" ? "⚠️" : "ℹ️";
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function calculateTotals() {
  let subtotal = 0;
  state.items.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    subtotal += qty * price;
  });

  const discount = parseFloat(state.discount) || 0;
  const grossTotal = Math.max(0, subtotal - discount);
  const cashReceived = parseFloat(state.cashReceived) || 0;
  const balance = cashReceived - grossTotal;

  return { subtotal, discount, grossTotal, cashReceived, balance };
}

// =========================================================================
// Rendering Views & Receipts
// =========================================================================
function renderEditorItemsTable() {
  const tbody = document.getElementById("itemsTableBody");
  tbody.innerHTML = "";

  if (state.items.length === 0) {
    const emptyTr = document.createElement("tr");
    emptyTr.innerHTML = `
      <td colspan="5" style="text-align: center; color: var(--text-dim); padding: 18px 0; font-size: 13px;">
        No items in bill yet. Click <strong>"➕ Add Item"</strong> or select a <strong>Quick Add</strong> medicine above.
      </td>
    `;
    tbody.appendChild(emptyTr);
    document.getElementById("itemCountDisplay").innerText = "0";
    return;
  }

  state.items.forEach((item, index) => {
    const tr = document.createElement("tr");
    const rowTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);

    tr.innerHTML = `
      <td>
        <input type="text" class="form-input-table" value="${escapeHtml(item.name)}" 
               data-field="name" data-index="${index}" placeholder="Medicine name">
      </td>
      <td>
        <input type="number" class="form-input-table" style="text-align: center;" value="${item.quantity}" 
               data-field="quantity" data-index="${index}" min="1" step="1">
      </td>
      <td>
        <input type="number" class="form-input-table" style="text-align: right;" value="${item.price}" 
               data-field="price" data-index="${index}" min="0" step="any">
      </td>
      <td class="td-row-total">
        ${fmt(rowTotal)}
      </td>
      <td style="text-align: center;">
        <button class="btn btn-danger-ghost btn-sm btn-delete-item" data-index="${index}" title="Remove row">
          ✕
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("itemCountDisplay").innerText = state.items.length;
}

function renderReceiptPreview() {
  const { subtotal, discount, grossTotal, cashReceived, balance } = calculateTotals();

  // Store metadata
  document.getElementById("receiptStoreName").innerText = state.store.name || "STORE NAME";
  document.getElementById("receiptAddress").innerText = state.store.address || "";
  document.getElementById("receiptDsl").innerText = state.store.dslNo || "";
  document.getElementById("receiptCell").innerText = state.store.cellNo || "";
  document.getElementById("receiptSoftwareCredit").innerText = state.store.softwareCredit || "";

  // Bill metadata
  document.getElementById("receiptPaymentId").innerText = state.bill.paymentId;
  document.getElementById("receiptBillNo").innerText = state.bill.billNo;
  document.getElementById("receiptDate").innerText = state.bill.date;
  document.getElementById("receiptUser").innerText = state.bill.user;
  document.getElementById("receiptCounter").innerText = state.bill.counter;

  // Items table
  const tbody = document.getElementById("receiptItemsTbody");
  tbody.innerHTML = "";

  if (state.items.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" style="text-align: center; color: #888; padding: 12px 0;">-- No Items --</td>`;
    tbody.appendChild(tr);
  } else {
    state.items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      const total = qty * price;

      const tr = document.createElement("tr");
      tr.className = "item-row";
      tr.innerHTML = `
        <td style="word-break: break-word;">${escapeHtml(item.name)}</td>
        <td class="text-center">${qty}</td>
        <td class="text-right">${fmt(price)}</td>
        <td class="text-right">${fmt(total)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Totals & Financials
  document.getElementById("receiptTotalItemsCount").innerText = state.items.length;
  document.getElementById("receiptSubtotal").innerText = fmt(subtotal);
  document.getElementById("receiptDiscount").innerText = fmt(discount);
  document.getElementById("receiptGrossTotal").innerText = fmt(grossTotal);
  document.getElementById("receiptCashReceived").innerText = fmt(cashReceived);
  document.getElementById("receiptBalance").innerText = fmt(balance);
  document.getElementById("receiptPolicy").innerText = state.policy;

  // Update summary in editor
  document.getElementById("displaySubtotal").innerText = fmt(subtotal);
  document.getElementById("displayDiscount").innerText = fmt(discount);
  document.getElementById("displayGrossTotal").innerText = fmt(grossTotal);
  
  const balanceEl = document.getElementById("displayBalance");
  balanceEl.innerText = fmt(balance);
  if (balance < 0) {
    balanceEl.style.color = "#f43f5e";
  } else {
    balanceEl.style.color = "#34d399";
  }
}

function syncAllEditorInputs() {
  document.getElementById("inputStoreName").value = state.store.name || "";
  document.getElementById("inputAddress").value = state.store.address || "";
  document.getElementById("inputDslNo").value = state.store.dslNo || "";
  document.getElementById("inputCellNo").value = state.store.cellNo || "";
  document.getElementById("inputSoftwareCredit").value = state.store.softwareCredit || "";

  document.getElementById("inputPaymentId").value = state.bill.paymentId;
  document.getElementById("inputBillNo").value = state.bill.billNo;
  document.getElementById("inputDate").value = state.bill.date;
  document.getElementById("inputUser").value = state.bill.user;
  document.getElementById("inputCounter").value = state.bill.counter;

  document.getElementById("inputDiscount").value = state.discount;
  document.getElementById("inputCashReceived").value = state.cashReceived;
  document.getElementById("inputPolicy").value = state.policy;
}

// =========================================================================
// Event Bindings
// =========================================================================
function bindEvents() {
  // Authentication tab switches
  document.getElementById("tabLoginLink").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("tabSignupLink").addEventListener("click", () => switchAuthTab("signup"));
  document.getElementById("linkToSignup").addEventListener("click", () => switchAuthTab("signup"));
  document.getElementById("linkToLogin").addEventListener("click", () => switchAuthTab("login"));

  // Form submissions
  document.getElementById("btnSubmitLogin").addEventListener("click", handleLogin);
  document.getElementById("formSignIn").addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  document.getElementById("btnSubmitSignup").addEventListener("click", handleSignup);
  document.getElementById("formSignUp").addEventListener("keydown", e => {
    if (e.key === "Enter") handleSignup();
  });

  // Demo account chips (fast fill)
  document.querySelectorAll(".auth-demo-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.getElementById("loginUser").value = chip.dataset.user;
      document.getElementById("loginPass").value = chip.dataset.pass;
      handleLogin();
    });
  });

  // Logout button
  document.getElementById("btnLogout").addEventListener("click", handleLogout);

  // Auto-Save Store inputs (triggers debounced update to SQLite)
  const storeInputs = [
    { id: "inputStoreName", set: v => state.store.name = v },
    { id: "inputAddress", set: v => state.store.address = v },
    { id: "inputDslNo", set: v => state.store.dslNo = v },
    { id: "inputCellNo", set: v => state.store.cellNo = v },
    { id: "inputSoftwareCredit", set: v => state.store.softwareCredit = v },
    { id: "inputUser", set: v => state.bill.user = v },
    { id: "inputCounter", set: v => state.bill.counter = v },
    { id: "inputPolicy", set: v => state.policy = v }
  ];

  storeInputs.forEach(({ id, set }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", e => {
      set(e.target.value);
      renderReceiptPreview();
      scheduleStoreAutoSave();
    });
  });

  // Manual explicit "Save Info" button
  document.getElementById("btnSaveStoreExplicit").addEventListener("click", () => {
    saveStoreProfileToSqlite(true);
  });

  // Bill metadata inputs
  document.getElementById("inputPaymentId").addEventListener("input", e => {
    state.bill.paymentId = e.target.value;
    renderReceiptPreview();
  });
  document.getElementById("inputBillNo").addEventListener("input", e => {
    state.bill.billNo = e.target.value;
    renderReceiptPreview();
  });
  document.getElementById("inputDate").addEventListener("input", e => {
    state.bill.date = e.target.value;
    renderReceiptPreview();
  });

  // Financial inputs
  document.getElementById("inputDiscount").addEventListener("input", e => {
    state.discount = parseFloat(e.target.value) || 0;
    renderReceiptPreview();
  });
  document.getElementById("inputCashReceived").addEventListener("input", e => {
    state.cashReceived = parseFloat(e.target.value) || 0;
    renderReceiptPreview();
  });

  // Table row editing delegation
  document.getElementById("itemsTableBody").addEventListener("input", e => {
    const input = e.target;
    const index = parseInt(input.dataset.index, 10);
    const field = input.dataset.field;
    if (isNaN(index) || !state.items[index]) return;

    if (field === "name") {
      state.items[index].name = input.value;
    } else if (field === "quantity") {
      state.items[index].quantity = parseFloat(input.value) || 0;
    } else if (field === "price") {
      state.items[index].price = parseFloat(input.value) || 0;
    }

    const tr = input.closest("tr");
    if (tr) {
      const rowTotal = (parseFloat(state.items[index].quantity) || 0) * (parseFloat(state.items[index].price) || 0);
      const totalTd = tr.querySelector(".td-row-total");
      if (totalTd) totalTd.innerText = fmt(rowTotal);
    }

    renderReceiptPreview();
  });

  // Delete item row
  document.getElementById("itemsTableBody").addEventListener("click", e => {
    const btn = e.target.closest(".btn-delete-item");
    if (!btn) return;
    const index = parseInt(btn.dataset.index, 10);
    if (!isNaN(index)) {
      state.items.splice(index, 1);
      renderEditorItemsTable();
      renderReceiptPreview();
      showToast("Item removed", "info");
    }
  });

  // Add Item button
  document.getElementById("btnAddItem").addEventListener("click", () => {
    state.items.push({ name: "NEW MEDICINE", quantity: 1, price: 10.00 });
    renderEditorItemsTable();
    renderReceiptPreview();
    
    const inputs = document.querySelectorAll('#itemsTableBody input[data-field="name"]');
    if (inputs.length > 0) {
      inputs[inputs.length - 1].focus();
      inputs[inputs.length - 1].select();
    }
  });

  // Clear Items
  document.getElementById("btnClearItems").addEventListener("click", () => {
    if (confirm("Clear all items from current bill?")) {
      state.items = [];
      renderEditorItemsTable();
      renderReceiptPreview();
      showToast("All items cleared", "warning");
    }
  });

  // Quick preset chips
  document.querySelectorAll(".preset-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const name = chip.dataset.name;
      const price = parseFloat(chip.dataset.price) || 0;
      state.items.push({ name, quantity: 1, price });
      renderEditorItemsTable();
      renderReceiptPreview();
      showToast(`Added ${name}`, "success");
    });
  });

  // "➕ New Bill" button
  document.getElementById("btnNewBill").addEventListener("click", startNewBill);

  // Timestamp "Current Time" shortcut
  document.getElementById("btnSetNowTime").addEventListener("click", () => {
    const nowStr = getCurrentFormattedDate();
    state.bill.date = nowStr;
    document.getElementById("inputDate").value = nowStr;
    renderReceiptPreview();
    showToast("Date set to current time", "success");
  });

  // Zoom toggle
  document.getElementById("btnZoomToggle").addEventListener("click", () => {
    isZoomed = !isZoomed;
    const wrapper = document.getElementById("printableReceipt");
    const btn = document.getElementById("btnZoomToggle");
    if (isZoomed) {
      wrapper.style.transform = "scale(1.2) rotate(0deg)";
      wrapper.style.transformOrigin = "top center";
      btn.innerText = "🔍 Normal 100%";
    } else {
      wrapper.style.transform = "rotate(-0.4deg)";
      btn.innerText = "🔍 Zoom 125%";
    }
  });

  // Print handlers
  const handlePrint = () => {
    const wrapper = document.getElementById("printableReceipt");
    const prevTransform = wrapper.style.transform;
    wrapper.style.transform = "none";
    window.print();
    wrapper.style.transform = prevTransform;
  };

  document.getElementById("btnPrintTop").addEventListener("click", handlePrint);
  document.getElementById("btnPrintReceiptBtn").addEventListener("click", handlePrint);

  window.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      handlePrint();
    }
  });

  // Save bill to SQLite
  document.getElementById("btnSaveBill").addEventListener("click", saveCurrentBillToSqlite);

  // History modal
  document.getElementById("btnHistory").addEventListener("click", openHistoryModal);
  document.getElementById("btnCloseHistoryModal").addEventListener("click", closeHistoryModal);
  document.getElementById("btnCloseHistoryFooter").addEventListener("click", closeHistoryModal);
  document.getElementById("btnClearHistory").addEventListener("click", clearAllHistory);

  // React modal
  document.getElementById("btnReactCode").addEventListener("click", openReactModal);
  document.getElementById("btnCloseReactModal").addEventListener("click", closeReactModal);
  document.getElementById("btnCopyReactCode").addEventListener("click", copyReactCode);
}

async function openReactModal() {
  const modal = document.getElementById("reactModal");
  try {
    const res = await fetch("Receipt.jsx");
    const code = await res.text();
    document.getElementById("reactCodeDisplay").innerText = code;
  } catch (err) {
    document.getElementById("reactCodeDisplay").innerText = "// Could not load Receipt.jsx content.";
  }
  modal.classList.add("active");
}

function closeReactModal() {
  document.getElementById("reactModal").classList.remove("active");
}

function copyReactCode() {
  const code = document.getElementById("reactCodeDisplay").innerText;
  navigator.clipboard.writeText(code).then(() => {
    showToast("React component copied to clipboard!", "success");
  });
}

// =========================================================================
// Initialization
// =========================================================================
async function initApp() {
  bindEvents();

  if (authToken) {
    try {
      const data = await api.me();
      applyUserSession(data.user);
      return;
    } catch (e) {
      console.warn("Server check failed, checking cached session...", e);
      const cached = localStorage.getItem("pos_cached_user");
      if (cached) {
        try {
          const cachedUser = JSON.parse(cached);
          applyUserSession(cachedUser);
          if (cachedUser.storeInfo) {
            api.saveStoreProfile(cachedUser.storeInfo).catch(() => {});
          }
          return;
        } catch (err) {}
      }
      authToken = null;
      localStorage.removeItem("pos_auth_token");
      localStorage.removeItem("pos_cached_user");
    }
  }

  // Not logged in -> show login screen
  showAuthScreen();
}

document.addEventListener("DOMContentLoaded", initApp);

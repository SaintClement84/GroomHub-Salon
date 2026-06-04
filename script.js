const $ = (sel) => document.querySelector(sel);
const form = $("#loginForm");
const statusEl = $("#status");
const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const SESSION_KEY = "groomhub_v2_session";
const USERS_KEY = "groomhub_v2_users";
const LEGACY_LOGIN_KEY = "groomhub.static.login.v1";
const DEMO_EMAIL = "demo@students.edu";

function safeJsonParse(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function loadUsersDb() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    const parsed = safeJsonParse(raw, { users: [] });
    return { users: Array.isArray(parsed?.users) ? parsed.users : [] };
  } catch { return { users: [] }; }
}

function saveUsersDb(db) {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(db)); } catch {}
}

async function hashPassword(plain) {
  const input = String(plain ?? "");
  if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
    const enc = new TextEncoder();
    const bytes = enc.encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return input;
}

function getUserByEmail(email) {
  const db = loadUsersDb();
  return db.users.find((u) => String(u.email || "").toLowerCase() === String(email || "").toLowerCase()) || null;
}

async function registerUser({ name, email, password }) {
  const existing = getUserByEmail(email);
  if (existing) { return { ok: false, error: "An account with this email already exists." }; }
  const id = `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const passwordHash = await hashPassword(password);
  const db = loadUsersDb();
  db.users.push({ id, name: name ? String(name).trim() : "", email: String(email).trim(), passwordHash, createdAt: new Date().toISOString() });
  saveUsersDb(db);
  return { ok: true };
}

async function verifyLogin({ email, password }) {
  const user = getUserByEmail(email);
  if (!user) return { ok: false, error: "No account found for this email. Please create one." };
  const passwordHash = await hashPassword(password);
  if (String(user.passwordHash) !== String(passwordHash)) { return { ok: false, error: "Incorrect password." }; }
  return { ok: true, user };
}

function createLegacyLoginRecord(email) {
  try { localStorage.setItem(LEGACY_LOGIN_KEY, JSON.stringify({ email, at: new Date().toISOString() })); } catch {}
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

async function ensureDemoUser() {
  const demo = getUserByEmail(DEMO_EMAIL);
  if (demo) return;
  await registerUser({ name: "Demo Student", email: DEMO_EMAIL, password: "demo1234" });
}

function requireAuthOrRedirect() {
  const path = (window.location.pathname || "").toLowerCase();
  if (path.endsWith("index.html") || path.endsWith("/index.html")) return;
  const ok = isLoggedIn();
  if (!ok) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("auth", "required");
      window.location.href = `./index.html?auth=required`;
    } catch { window.location.href = "./index.html?auth=required"; }
  }
}

function isLoggedIn() {
  try { return Boolean(window.localStorage.getItem(SESSION_KEY)); } catch { return false; }
}

function getSession() {
  try { const raw = window.localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function applySessionToHeader() {
  const popupEl = document.getElementById("demoReminderPopup");
  if (popupEl) popupEl.remove();
  const session = getSession();
  const user = session?.user;
  if (!user) return;
  const nameEl = document.getElementById("currentUserName");
  const roleEl = document.getElementById("currentUserRole");
  const avatarEl = document.getElementById("currentUserAvatar");
  if (nameEl) nameEl.textContent = user.name || user.email || "Student";
  if (roleEl) roleEl.textContent = "Online";
  if (avatarEl) {
    const initial = String(user.name || user.email || "U").trim().charAt(0).toUpperCase();
    avatarEl.textContent = initial;
  }
  const onlineEl = document.getElementById("onlineBadge");
  if (onlineEl) onlineEl.textContent = "Logged in online";
}

function setSession(user) {
  try { window.localStorage.setItem(SESSION_KEY, JSON.stringify({ user: user || null, createdAt: new Date().toISOString() })); } catch {}
}

async function doLogin({ email, password }) {
  if (!email) return { ok: false, error: "Please enter your email." };
  if (!password) return { ok: false, error: "Please enter your password." };
  const res = await verifyLogin({ email, password });
  if (!res.ok) return res;
  createLegacyLoginRecord(email);
  setSession({ email: res.user.email, name: res.user.name || "" });
  return { ok: true };
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#email")?.value?.trim() ?? "";
  const password = $("#password")?.value ?? "";
  const { ok, error } = await doLogin({ email, password });
  if (!ok) { setStatus(error || "Login failed. Please try again."); return; }
  setStatus("Logged in. Redirecting to dashboard…");
  setTimeout(() => { window.location.href = "./dashboard.html"; }, 500);
});

$("#demoLogin")?.addEventListener("click", async (e) => {
  e.preventDefault();
  await ensureDemoUser();
  const { ok } = await doLogin({ email: DEMO_EMAIL, password: "demo1234" });
  if (!ok) { setStatus("Demo login failed. Please use Create account."); return; }
  setStatus("Demo mode enabled. Redirecting to dashboard…");
  setTimeout(() => { window.location.href = "./dashboard.html"; }, 400);
});

function showSignupPanel() {
  const loginPanel = document.getElementById("loginPanel");
  const signupPanel = document.getElementById("signupPanel");
  if (loginPanel) loginPanel.style.display = "none";
  if (signupPanel) signupPanel.style.display = "block";
}

function showLoginPanel() {
  const loginPanel = document.getElementById("loginPanel");
  const signupPanel = document.getElementById("signupPanel");
  if (signupPanel) signupPanel.style.display = "none";
  if (loginPanel) loginPanel.style.display = "block";
}

$("#signupLink")?.addEventListener("click", (e) => { e.preventDefault(); showSignupPanel(); });
$("#backToLogin")?.addEventListener("click", (e) => { e.preventDefault(); showLoginPanel(); });
$("#forgotLink")?.addEventListener("click", (e) => { e.preventDefault(); setStatus("Password reset not implemented in static preview."); });

const signupForm = $("#signupForm");
const signupEmailEl = $("#signupEmail");
const signupPasswordEl = $("#signupPassword");
const confirmPasswordEl = $("#confirmPassword");
const signupNameEl = $("#name");
const signupStatusEl = $("#signupStatus");

function setSignupStatus(msg) {
  if (signupStatusEl) signupStatusEl.textContent = msg;
}

signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = signupNameEl?.value?.trim() ?? "";
  const email = signupEmailEl?.value?.trim() ?? "";
  const password = signupPasswordEl?.value ?? "";
  const confirmPassword = confirmPasswordEl?.value ?? "";
  if (!email) { setSignupStatus("Please enter your email."); return; }
  if (!password) { setSignupStatus("Please enter your password."); return; }
  if (!confirmPassword) { setSignupStatus("Please confirm your password."); return; }
  if (password !== confirmPassword) { setSignupStatus("Passwords do not match. Please try again."); return; }
  setSignupStatus("Creating account…");
  const res = await registerUser({ name, email, password });
  if (!res.ok) { setSignupStatus(res.error || "Could not create account."); return; }
  setSession({ email, name });
  try { createLegacyLoginRecord(email); } catch {}
  setSignupStatus("Account created. Redirecting to dashboard…");
  setTimeout(() => { window.location.href = "./dashboard.html"; }, 500);
});

(function initBookingFlow() {
  const serviceGrid = document.getElementById("serviceGrid");
  const stylistGrid = document.getElementById("stylistGrid");
  const timeGrid = document.getElementById("timeGrid");
  const confirmBtn = document.getElementById("confirmBookingBtn");
  if (!serviceGrid || !stylistGrid || !timeGrid || !confirmBtn) return;

  const summaryService = document.getElementById("summaryService");
  const summaryStylist = document.getElementById("summaryStylist");
  const summaryTime = document.getElementById("summaryTime");
  const summaryDate = document.getElementById("summaryDate");
  const bookingTinyMuted = document.getElementById("bookingTinyMuted");

  const state = { serviceId: null, serviceName: null, stylistId: null, stylistName: null, timeId: null, timeLabel: null, dateLabel: summaryDate?.textContent || "Wed 14 May 2025" };

  function setMuted(msg) { if (bookingTinyMuted) bookingTinyMuted.textContent = msg; }

  function setSummary() {
    if (summaryService) summaryService.textContent = state.serviceName || "—";
    if (summaryStylist) summaryStylist.textContent = state.stylistName || "—";
    if (summaryDate) summaryDate.textContent = state.dateLabel;
    if (summaryTime) { summaryTime.textContent = state.timeLabel ? `${state.timeLabel} — 15:00` : "—"; }
  }

  function clearSelected(grid) { grid.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected")); }

  function selectChoice(el, grid, which) {
    clearSelected(grid);
    el.classList.add("selected");
    if (which === "service") {
      state.serviceId = el.getAttribute("data-service-id");
      state.serviceName = el.getAttribute("data-service-name");
      setMuted("Now choose a stylist and a valid time.");
    }
    if (which === "stylist") {
      state.stylistId = el.getAttribute("data-stylist-id");
      state.stylistName = el.getAttribute("data-stylist-name");
      setMuted("Now choose a time.");
    }
    if (which === "time") {
      state.timeId = el.getAttribute("data-time-id");
      state.timeLabel = el.getAttribute("data-time-label");
      setMuted("Ready. Confirm your booking.");
    }
    setSummary();
  }

  const initialService = serviceGrid.querySelector(".choice.selected");
  if (initialService) selectChoice(initialService, serviceGrid, "service");
  const initialStylist = stylistGrid.querySelector(".choice.selected");
  if (initialStylist) selectChoice(initialStylist, stylistGrid, "stylist");

  serviceGrid.addEventListener("click", (e) => {
    const el = e.target.closest(".choice[role='button']");
    if (!el) return;
    selectChoice(el, serviceGrid, "service");
  });

  stylistGrid.addEventListener("click", (e) => {
    const el = e.target.closest(".choice[role='button']");
    if (!el) return;
    selectChoice(el, stylistGrid, "stylist");
  });

  timeGrid.addEventListener("click", (e) => {
    const el = e.target.closest("button.time");
    if (!el || el.disabled || el.classList.contains("blocked")) return;
    clearSelected(timeGrid);
    el.classList.add("selected");
    selectChoice(el, timeGrid, "time");
  });

  confirmBtn.addEventListener("click", () => {
    if (!state.serviceId || !state.stylistId || !state.timeId) { setMuted("Select a service, stylist and a valid time."); return; }
    const payload = {
      id: `b_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      user: getSession()?.user || null,
      serviceId: state.serviceId,
      serviceName: state.serviceName,
      stylistId: state.stylistId,
      stylistName: state.stylistName,
      dateLabel: state.dateLabel,
      timeId: state.timeId,
      timeLabel: state.timeLabel,
      status: "confirmed",
    };
    const BOOKINGS_KEY = "groomhub_v2_bookings";
    const existingRaw = localStorage.getItem(BOOKINGS_KEY);
    const existing = existingRaw ? safeJsonParse(existingRaw, { bookings: [] }) : { bookings: [] };
    const bookings = Array.isArray(existing?.bookings) ? existing.bookings : [];
    bookings.unshift(payload);
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify({ bookings: bookings.slice(0, 20) }));
    window.location.href = "./dashboard.html";
  });

  setSummary();
})();

if (typeof document !== "undefined") {
  requireAuthOrRedirect();
  applySessionToHeader();
}
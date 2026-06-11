// ── If already logged in, redirect straight to the right page ──────────

(function() {
  const session = JSON.parse(localStorage.getItem("schoolos_session") || "null");
  if (session && session.loggedIn) {
    if (session.role === "principal") window.location.href = getPageUrl("../../SchoolsOs/SchoolOS.html");
    else if (session.role === "parent") window.location.href = getPageUrl("../parent.html");
  }
})();

// ── localStorage helpers ───────────────────────────────────────────────
function getUsers() { return JSON.parse(localStorage.getItem("schoolos_users") || "[]"); }
function saveUsers(u) { localStorage.setItem("schoolos_users", JSON.stringify(u)); }
function getPageUrl(path) { return new URL(path, window.location.href).href; }
function setSession(user) {
  localStorage.setItem("schoolos_session", JSON.stringify({
    loggedIn:   true,
    role:       user.role,
    email:      user.email,
    name:       (user.firstName || "") + " " + (user.lastName || ""),
    schoolName: user.schoolName  || "",
    childName:  user.childName   || "",
    childClass: user.childClass  || "",
  }));
}

// ── Navigation ─────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + id).classList.add("active");
}
function goToAuth(role, tab) { showView(role); switchTab(role, tab); }
function goBack() { showView("welcome"); }

// ── Tab switching ──────────────────────────────────────────────────────
function switchTab(role, tab) {
  const tabPrefix = role === "principal" ? "ptab" : "partab";
  document.getElementById(tabPrefix + "-login").classList.toggle("active", tab === "login");
  document.getElementById(tabPrefix + "-signup").classList.toggle("active", tab === "signup");
  document.getElementById(role + "-login-form").classList.toggle("active", tab === "login");
  document.getElementById(role + "-signup-form").classList.toggle("active", tab === "signup");
  if (role === "principal") {
    document.getElementById("principal-title").textContent = tab === "login" ? "Welcome back" : "Create account";
    document.getElementById("principal-sub").textContent = tab === "login" ? "Sign in to manage your school" : "Set up your school management account";
  } else {
    document.getElementById("parent-title").textContent = tab === "login" ? "Welcome back" : "Create account";
    document.getElementById("parent-sub").textContent = tab === "login" ? "Sign in to view your child's progress" : "Register as a parent or guardian";
  }
  clearMessages(role);
}

// ── Messages ───────────────────────────────────────────────────────────
function showError(role, msg) {
  const e = document.getElementById(role + "-error");
  e.textContent = msg; e.classList.add("visible");
  document.getElementById(role + "-success").classList.remove("visible");
}
function showSuccess(role, msg) {
  const e = document.getElementById(role + "-success");
  e.textContent = msg; e.classList.add("visible");
  document.getElementById(role + "-error").classList.remove("visible");
}
function clearMessages(role) {
  document.getElementById(role + "-error").classList.remove("visible");
  document.getElementById(role + "-success").classList.remove("visible");
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── LOGIN ──────────────────────────────────────────────────────────────
function handleLogin(role) {
  clearMessages(role);
  const email = role === "principal"
    ? document.getElementById("p-login-email").value.trim().toLowerCase()
    : document.getElementById("par-login-email").value.trim().toLowerCase();
  const pass = role === "principal"
    ? document.getElementById("p-login-pass").value
    : document.getElementById("par-login-pass").value;

  if (!email) return showError(role, "Please enter your email address.");
  if (!isValidEmail(email)) return showError(role, "Please enter a valid email address.");
  if (!pass) return showError(role, "Please enter your password.");

  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) return showError(role, "⚠️ No account found with this email. Please sign up first.");
  if (user.role !== role) return showError(role, `This account is registered as a ${user.role}, not a ${role}.`);
  if (user.password !== btoa(pass)) return showError(role, "Incorrect password. Please try again.");

  setSession(user);
  showSuccess(role, "Login successful! Redirecting…");
  setTimeout(() => {
    if (role === "principal") window.location.href = getPageUrl("../../SchoolsOs/SchoolOS.html");
    else window.location.href = getPageUrl("../parent.html");
  }, 900);
}

// ── SIGN UP ────────────────────────────────────────────────────────────
function handleSignup(role) {
  clearMessages(role);

  if (role === "principal") {
    const fname  = document.getElementById("p-signup-fname").value.trim();
    const lname  = document.getElementById("p-signup-lname").value.trim();
    const school = document.getElementById("p-signup-school").value.trim();
    const email  = document.getElementById("p-signup-email").value.trim().toLowerCase();
    const pass   = document.getElementById("p-signup-pass").value;
    const pass2  = document.getElementById("p-signup-pass2").value;

    if (!fname || !lname) return showError(role, "Please enter your full name.");
    if (!school) return showError(role, "Please enter your school name.");
    if (!isValidEmail(email)) return showError(role, "Please enter a valid email address.");
    if (pass.length < 8) return showError(role, "Password must be at least 8 characters.");
    if (pass !== pass2) return showError(role, "Passwords do not match.");

    const users = getUsers();
    if (users.find(u => u.email === email)) return showError(role, "⚠️ An account with this email is already registered. Please log in instead.");

    const newUser = { firstName: fname, lastName: lname, schoolName: school, email, password: btoa(pass), role: "principal" };
    users.push(newUser);
    saveUsers(users);
    setSession(newUser);
    showSuccess(role, "Account created! Taking you to your dashboard…");
    setTimeout(() => { window.location.href = getPageUrl("../../SchoolsOs/SchoolOS.html"); }, 1000);

  } else {
    const fname  = document.getElementById("par-signup-fname").value.trim();
    const lname  = document.getElementById("par-signup-lname").value.trim();
    const child  = document.getElementById("par-signup-child").value.trim();
    const cls    = document.getElementById("par-signup-class").value;
    const email  = document.getElementById("par-signup-email").value.trim().toLowerCase();
    const pass   = document.getElementById("par-signup-pass").value;
    const pass2  = document.getElementById("par-signup-pass2").value;

    if (!fname || !lname) return showError(role, "Please enter your full name.");
    if (!child) return showError(role, "Please enter your child's name.");
    if (!cls) return showError(role, "Please enter your child's class.");
    if (!isValidEmail(email)) return showError(role, "Please enter a valid email address.");
    if (pass.length < 8) return showError(role, "Password must be at least 8 characters.");
    if (pass !== pass2) return showError(role, "Passwords do not match.");

    const users = getUsers();
    if (users.find(u => u.email === email)) return showError(role, "⚠️ An account with this email is already registered. Please log in instead.");

    const newUser = { firstName: fname, lastName: lname, childName: child, childClass: cls, email, password: btoa(pass), role: "parent" };
    users.push(newUser);
    saveUsers(users);
    setSession(newUser);
    showSuccess(role, "Account created! Taking you to the parent portal…");
    setTimeout(() => { window.location.href = getPageUrl("../parent.html"); }, 1000);
  }
}

// ── Enter key ──────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (document.getElementById("view-principal").classList.contains("active")) {
    if (document.getElementById("principal-login-form").classList.contains("active")) handleLogin("principal");
    else handleSignup("principal");
  }
  if (document.getElementById("view-parent").classList.contains("active")) {
    if (document.getElementById("parent-login-form").classList.contains("active")) handleLogin("parent");
    else handleSignup("parent");
  }
});
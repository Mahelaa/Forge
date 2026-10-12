import "./styles.css";
import { apiBaseUrl, ApiError, login, register, getMe, updateScreenName, logout, changePassword, deleteAccount, listSessions, revokeSession, listUsers, forgotPassword, resendVerification, verifyEmail, resetPassword, clearSession, type ForgeAccount } from "./api";

document.body.innerHTML = `
  <main>
    <header><span class="eyebrow">FORGE</span><h1>Your account</h1><p id="endpoint"></p></header>
    <p id="status" role="status" aria-live="polite">Sign in or create an account.</p>
    <section id="auth" class="connection">
      <form id="login-form"><h2>Sign in</h2><div class="fields">
        <label>Email or username<input name="identifier" required maxlength="254" autocomplete="username"></label>
        <label>Password<input name="password" type="password" required maxlength="1024" autocomplete="current-password"></label>
        <button>Sign in</button></div></form>
      <details><summary>Create an account</summary><form id="register-form"><div class="fields account-fields">
        <label>Username<input name="username" required minlength="3" maxlength="64" pattern="[A-Za-z0-9_.\\-]+" autocomplete="username"></label>
        <label>Screen name<input name="screen_name" required maxlength="100" autocomplete="nickname"></label>
        <label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
        <label>Password (at least 15 characters)<input name="password" type="password" required minlength="15" maxlength="1024" autocomplete="new-password"></label>
        <button>Create account</button></div></form></details>
      <details id="verify-panel"><summary>Verify your email</summary>
        <form id="verify-form" class="inline"><label>Verification code<input name="token" required maxlength="43" autocomplete="off"></label><button>Verify email</button></form>
        <form id="resend-form" class="inline"><label>Email<input name="email" type="email" required autocomplete="email"></label><button class="secondary">Send another code</button></form>
      </details>
      <details id="recovery-panel"><summary>Forgot your password?</summary>
        <form id="forgot-form" class="inline"><label>Email<input name="email" type="email" required autocomplete="email"></label><button class="secondary">Send reset email</button></form>
        <form id="reset-form"><div class="fields"><label>Reset code<input name="token" required maxlength="43" autocomplete="off"></label><label>New password<input name="password" type="password" required minlength="15" maxlength="1024" autocomplete="new-password"></label><button>Reset password</button></div></form>
      </details>
    </section>
    <section id="workspace" hidden>
      <div class="list-heading"><h2 id="account-name"></h2><div class="inline"><button id="refresh" class="secondary">Refresh</button><button id="logout" class="secondary">Sign out</button></div></div>
      <p id="account-details" class="empty"></p>
      <form id="profile-form" class="inline"><label>Screen name<input name="screen_name" required maxlength="100" autocomplete="nickname"></label><button>Save profile</button></form>
      <details><summary>Change password</summary><form id="password-form"><div class="fields"><label>Current password<input name="current_password" type="password" required maxlength="1024" autocomplete="current-password"></label><label>New password<input name="new_password" type="password" required minlength="15" maxlength="1024" autocomplete="new-password"></label><button>Change password</button></div></form></details>
      <div class="list-heading"><h2>Active sessions</h2><button id="logout-all" class="secondary">Sign out everywhere</button></div><div id="sessions"></div>
      <section id="admin" hidden><h2>Users</h2><div id="users"></div></section>
      <details><summary>Delete account</summary><form id="delete-form"><p>This permanently deletes your account and profile.</p><label>Current password<input name="current_password" type="password" required maxlength="1024" autocomplete="current-password"></label><label class="confirm"><input type="checkbox" required>I want to permanently delete my account.</label><button class="danger">Delete my account</button></form></details>
    </section>
  </main>`;

function element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function form(id: string) { return element<HTMLFormElement>(id); }
function field(id: string, name: string) { return form(id).elements.namedItem(name) as HTMLInputElement; }
function value(id: string, name: string) { return field(id, name).value; }
let currentAccount: ForgeAccount | null = null;

function message(text: string, error = false) {
  element("status").textContent = text;
  element("status").classList.toggle("error", error);
}
function signedOut() {
  clearSession(); currentAccount = null;
  element("auth").hidden = false;
  element("workspace").hidden = true;
  element("sessions").replaceChildren();
  element("users").replaceChildren();
  for (const id of ["login-form", "profile-form", "password-form", "delete-form"]) form(id).reset();
}
function showAccount(account: ForgeAccount) {
  currentAccount = account;
  element("auth").hidden = true;
  element("workspace").hidden = false;
  element("account-name").textContent = account.username;
  element("account-details").textContent = `${account.email} · ${account.accountid} · ${account.email_verified ? "Email verified" : "Email verification pending"}`;
  field("profile-form", "screen_name").value = account.screen_name;
  element("admin").hidden = account.role !== "admin";
}
async function refresh() {
  showAccount(await getMe());
  const data = await listSessions();
  const container = element("sessions");
  container.replaceChildren();
  for (const session of data.sessions) {
    const row = document.createElement("article"); row.className = "session";
    const description = document.createElement("p");
    const current = session.id === data.current_session_id;
    description.textContent = `${current ? "This session" : (session.user_agent || "Another device")} · Signed in ${new Date(session.created_at).toLocaleString()}`;
    const button = document.createElement("button"); button.className = "secondary"; button.textContent = "Revoke";
    button.addEventListener("click", () => run(button, async () => {
      await revokeSession(session.id);
      if (current) { signedOut(); message("Session revoked. Sign in again to continue."); }
      else { await refresh(); message("Session revoked."); }
    }));
    row.append(description, button); container.append(row);
  }
  if (currentAccount?.role === "admin") {
    const users = await listUsers();
    element("users").replaceChildren();
    for (const user of users) {
      const row = document.createElement("p"); row.textContent = `${user.username} · ${user.screen_name} · ${user.accountid}`;
      element("users").append(row);
    }
  }
}
async function run(button: HTMLButtonElement, work: () => Promise<void>) {
  button.disabled = true;
  try { await work(); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) signedOut();
    message(error instanceof Error ? error.message : "Could not complete request.", true);
  } finally { button.disabled = false; }
}
function onSubmit(id: string, work: () => Promise<void>) {
  form(id).addEventListener("submit", event => { event.preventDefault(); void run(form(id).querySelector("button")!, work); });
}
function onClick(id: string, work: () => Promise<void>) { element<HTMLButtonElement>(id).addEventListener("click", () => { void run(element<HTMLButtonElement>(id), work); }); }

element("endpoint").textContent = apiBaseUrl;
onSubmit("login-form", async () => {
  const account = await login(value("login-form", "identifier"), value("login-form", "password"));
  form("login-form").reset(); showAccount(account); await refresh(); message("Signed in.");
});
onSubmit("register-form", async () => {
  const identifier = value("register-form", "username");
  const password = value("register-form", "password");
  const email = value("register-form", "email");
  const result = await register(identifier, value("register-form", "screen_name"), email, password);
  form("register-form").reset();
  if (result.verification_required) {
    element<HTMLDetailsElement>("verify-panel").open = true;
    field("resend-form", "email").value = email;
    field("login-form", "identifier").value = identifier;
    message("Account created. Check your email to verify your address, then sign in.");
  } else { showAccount(await login(identifier, password)); await refresh(); message("Account created. Signed in."); }
});
onSubmit("profile-form", async () => { await updateScreenName(value("profile-form", "screen_name")); await refresh(); message("Profile updated."); });
onSubmit("password-form", async () => { await changePassword(value("password-form", "current_password"), value("password-form", "new_password")); signedOut(); message("Password changed. Sign in again."); });
onSubmit("delete-form", async () => { await deleteAccount(value("delete-form", "current_password")); signedOut(); message("Account deleted."); });
onSubmit("forgot-form", async () => { message((await forgotPassword(value("forgot-form", "email"))).message); });
onSubmit("resend-form", async () => { message((await resendVerification(value("resend-form", "email"))).message); });
onSubmit("verify-form", async () => { message((await verifyEmail(value("verify-form", "token"))).message); form("verify-form").reset(); });
onSubmit("reset-form", async () => { message((await resetPassword(value("reset-form", "token"), value("reset-form", "password"))).message); form("reset-form").reset(); });
onClick("refresh", async () => { await refresh(); message("Account refreshed."); });
onClick("logout", async () => { try { await logout(); } finally { signedOut(); } message("Signed out."); });
onClick("logout-all", async () => { try { await logout(true); } finally { signedOut(); } message("Signed out everywhere."); });

// Email tokens live in the fragment, keeping them out of server/referrer logs.
const action = new URLSearchParams(location.hash.slice(1));
const code = action.get("token");
if (code && /^[A-Za-z0-9_-]{43}$/.test(code)) {
  const verify = action.get("action") === "verify_email";
  const reset = action.get("action") === "reset_password";
  if (verify || reset) {
    element<HTMLDetailsElement>(verify ? "verify-panel" : "recovery-panel").open = true;
    field(verify ? "verify-form" : "reset-form", "token").value = code;
    message(verify ? "Confirm your email below." : "Choose a new password below.");
  }
}
if (location.hash) history.replaceState(null, "", location.pathname + location.search);

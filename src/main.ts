import "./styles.css";
import { apiBaseUrl, listUsers, createUser, updateScreenName, type ForgeUser } from "./api";

document.body.innerHTML = `
  <main>
    <header><span class="eyebrow">FORGE</span><h1>Your users</h1><p id="endpoint"></p></header>
    <section class="connection">
      <label for="token">Access token</label>
      <div class="inline"><input id="token" type="password" autocomplete="off" placeholder="Enter your access token"><button id="connect">Connect</button></div>
      <p id="status" role="status" aria-live="polite">Connect to view and manage users.</p>
    </section>
    <section id="workspace" hidden>
      <form id="create-user">
        <h2>Create a user</h2>
        <div class="fields">
          <label>Username<input id="username" required maxlength="64" autocomplete="off"></label>
          <label>Screen name<input id="screen-name" required maxlength="100" autocomplete="off"></label>
          <button type="submit">Create user</button>
        </div>
      </form>
      <div class="list-heading"><h2>Users</h2><button id="refresh" class="secondary">Refresh</button></div>
      <div id="users"></div>
    </section>
  </main>
`;

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

element("endpoint").textContent = apiBaseUrl;
const status = element("status");
const token = element<HTMLInputElement>("token");
const connect = element<HTMLButtonElement>("connect");
const workspace = element("workspace");

function message(text: string, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

function showUsers(users: ForgeUser[]) {
  const container = element("users");
  container.replaceChildren();
  if (users.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No users yet. Create your first user above.";
    container.append(empty);
    return;
  }
  for (const user of users) {
    const row = document.createElement("article");
    row.className = "user";
    const details = document.createElement("div");
    const username = document.createElement("strong");
    username.textContent = user.username;
    const id = document.createElement("code");
    id.textContent = user.accountid;
    details.append(username, id);
    const name = document.createElement("input");
    name.value = user.screen_name;
    name.maxLength = 100;
    name.setAttribute("aria-label", "Screen name for " + user.username);
    const save = document.createElement("button");
    save.textContent = "Save";
    save.className = "secondary";
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await updateScreenName(token.value, user.accountid, name.value);
        message("Screen name updated.");
      } catch (err) {
        message(err instanceof Error ? err.message : "Could not save screen name.", true);
      } finally { save.disabled = false; }
    });
    row.append(details, name, save);
    container.append(row);
  }
}

async function refresh() {
  const users = await listUsers(token.value);
  showUsers(users);
  workspace.hidden = false;
  message("Connected · " + users.length + (users.length === 1 ? " user" : " users"));
}

connect.addEventListener("click", async () => {
  if (!token.value) { message("Enter your access token.", true); return; }
  connect.disabled = true;
  message("Connecting…");
  try { await refresh(); }
  catch (err) {
    workspace.hidden = true;
    message(err instanceof Error ? err.message : "Could not connect.", true);
  } finally { connect.disabled = false; }
});

element("refresh").addEventListener("click", async () => {
  try { await refresh(); }
  catch (err) { message(err instanceof Error ? err.message : "Could not refresh.", true); }
});

element<HTMLFormElement>("create-user").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const button = form.querySelector("button") as HTMLButtonElement;
  button.disabled = true;
  try {
    await createUser(token.value, element<HTMLInputElement>("username").value, element<HTMLInputElement>("screen-name").value);
    form.reset();
    await refresh();
    message("User created.");
  } catch (err) {
    message(err instanceof Error ? err.message : "Could not create user.", true);
  } finally { button.disabled = false; }
});

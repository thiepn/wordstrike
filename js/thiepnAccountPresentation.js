import { getSupabaseClient } from "./supabaseClient.js";
import { getOAuthRedirectUrl } from "./supabaseConfig.js";

const appRoot = () => document.querySelector("#app");

function setStatus(container, message, error = false) {
  const status = container.querySelector("[data-thiepn-account-status]");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.error = error ? "true" : "false";
}

function credentials(container) {
  return {
    email: container.querySelector("[data-thiepn-email]")?.value?.trim() || "",
    password: container.querySelector("[data-thiepn-password]")?.value || "",
  };
}

async function runButton(button, label, operation) {
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    await operation();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function enhanceSignedOut(content) {
  if (content.querySelector("[data-thiepn-email]") || !content.querySelector('[data-action="auth-google-sign-in"]')) return;

  const client = getSupabaseClient();
  if (!client) return;

  const section = document.createElement("div");
  section.className = "leaderboard-username-form thiepn-account-email-form";
  section.innerHTML = `
    <div class="leaderboard-public-username">
      <span>THIEPN ACCOUNT</span>
      <strong>EMAIL OR GOOGLE</strong>
    </div>
    <input data-thiepn-email type="email" autocomplete="email" placeholder="Email" aria-label="THIEPN Account email">
    <input data-thiepn-password type="password" autocomplete="current-password" minlength="8" placeholder="Password" aria-label="THIEPN Account password">
    <div class="leaderboard-username-feedback" data-thiepn-account-status aria-live="polite"></div>
    <div class="global-account-actions">
      <button class="arcade-button account-primary" type="button" data-thiepn-email-sign-in>SIGN IN WITH EMAIL</button>
      <button class="arcade-button" type="button" data-thiepn-email-sign-up>CREATE ACCOUNT</button>
      <button class="arcade-button" type="button" data-thiepn-email-reset>FORGOT PASSWORD</button>
    </div>`;
  content.append(section);

  const signIn = section.querySelector("[data-thiepn-email-sign-in]");
  signIn?.addEventListener("click", () => void runButton(signIn, "SIGNING IN…", async () => {
    const { email, password } = credentials(section);
    if (!email || password.length < 8) {
      setStatus(section, "ENTER AN EMAIL AND AN 8+ CHARACTER PASSWORD", true);
      return;
    }
    setStatus(section, "");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) setStatus(section, error.message.toUpperCase(), true);
  }));

  const signUp = section.querySelector("[data-thiepn-email-sign-up]");
  signUp?.addEventListener("click", () => void runButton(signUp, "CREATING…", async () => {
    const { email, password } = credentials(section);
    if (!email || password.length < 8) {
      setStatus(section, "ENTER AN EMAIL AND AN 8+ CHARACTER PASSWORD", true);
      return;
    }
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getOAuthRedirectUrl() },
    });
    if (error) {
      setStatus(section, error.message.toUpperCase(), true);
      return;
    }
    if (!data.session) setStatus(section, "ACCOUNT CREATED — CHECK YOUR EMAIL TO CONFIRM");
  }));

  const reset = section.querySelector("[data-thiepn-email-reset]");
  reset?.addEventListener("click", () => void runButton(reset, "SENDING…", async () => {
    const { email } = credentials(section);
    if (!email) {
      setStatus(section, "ENTER YOUR EMAIL FIRST", true);
      return;
    }
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: getOAuthRedirectUrl(),
    });
    setStatus(
      section,
      error ? error.message.toUpperCase() : "IF THE ACCOUNT EXISTS, A RESET EMAIL WAS SENT",
      Boolean(error),
    );
  }));
}

function enhanceSignedIn(content) {
  const signOut = content.querySelector('[data-action="auth-sign-out"]');
  if (!signOut || content.querySelector("[data-thiepn-new-password]")) return;

  for (const strong of content.querySelectorAll("strong")) {
    if (strong.textContent?.trim() === "Google account connected") {
      strong.textContent = "THIEPN Account connected";
    }
  }

  const client = getSupabaseClient();
  if (!client) return;

  const section = document.createElement("div");
  section.className = "leaderboard-username-form thiepn-account-password-form";
  section.innerHTML = `
    <input data-thiepn-new-password type="password" autocomplete="new-password" minlength="8" placeholder="Set or change password" aria-label="Set or change THIEPN Account password">
    <div class="leaderboard-username-feedback" data-thiepn-account-status aria-live="polite"></div>
    <div class="global-account-actions">
      <button class="arcade-button" type="button" data-thiepn-save-password>SAVE PASSWORD</button>
    </div>`;
  content.append(section);

  const save = section.querySelector("[data-thiepn-save-password]");
  save?.addEventListener("click", () => void runButton(save, "SAVING…", async () => {
    const password = section.querySelector("[data-thiepn-new-password]")?.value || "";
    if (password.length < 8) {
      setStatus(section, "USE AT LEAST 8 CHARACTERS", true);
      return;
    }
    const { error } = await client.auth.updateUser({ password });
    setStatus(section, error ? error.message.toUpperCase() : "THIEPN ACCOUNT PASSWORD UPDATED", Boolean(error));
    if (!error) section.querySelector("[data-thiepn-new-password]").value = "";
  }));
}

function enhance() {
  const root = appRoot();
  if (!root) return;
  root.querySelectorAll(".global-account").forEach((account) => {
    const heading = account.querySelector("#global-account-heading");
    if (heading && heading.textContent !== "THIEPN ACCOUNT") {
      heading.textContent = "THIEPN ACCOUNT";
    }
    const content = account.querySelector("#global-account-content");
    if (!content) return;
    enhanceSignedOut(content);
    enhanceSignedIn(content);
  });
}

let queued = false;
function queueEnhancement() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    enhance();
  });
}

const root = appRoot();
if (root) new MutationObserver(queueEnhancement).observe(root, { childList: true, subtree: true });
enhance();

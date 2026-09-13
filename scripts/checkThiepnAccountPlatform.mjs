import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = (message) => {
  console.error(`A5 WORDSTRIKE ACCOUNT PLATFORM FAIL: ${message}`);
  process.exitCode = 1;
};
const check = (condition, message) => {
  if (!condition) fail(message);
};

const vendor = read("js/vendor/thiepnAccountSdk.js");
const adapter = read("js/thiepnAccount.js");
const auth = read("js/authService.js");
const supabase = read("js/supabaseClient.js");
const packageJson = JSON.parse(read("package.json"));

check(vendor.includes('THIEPN_ACCOUNT_VERSION = "1.2.0"'), "vendored SDK must remain pinned at 1.2.0 for this cutover.");
check(vendor.includes('THIEPN_PLATFORM_VERSION = "1.0.0"'), "platform contract must remain 1.0.0.");
check(vendor.includes('sessionKey: "sb-hycegznamzjhwinegaai-auth-token"'), "canonical THIEPN Account session key changed.");
check(vendor.includes("recordAppActivity"), "vendored SDK lacks A4 app activity support.");
check(vendor.includes("getEcosystemState"), "vendored SDK lacks A4 ecosystem state support.");

check(adapter.includes('THIEPN_ACCOUNT_SDK_SOURCE_SHA = "124221f39a932d50f9a86ad5c3da2d8fd1fe50af"'), "SDK source pin changed without a reviewed cutover.");
check(adapter.includes('WORDSTRIKE_PLATFORM_APP_ID = "wordstrike"'), "WORDSTRIKE platform app id changed.");
check(adapter.includes("prepareSharedAuthStorage(storage)"), "legacy same-project auth migration was removed.");
check(adapter.includes("recordAppActivity({ appId: WORDSTRIKE_PLATFORM_APP_ID })"), "WORDSTRIKE no longer records real authenticated platform activity.");
check(adapter.includes("needsMfaChallenge"), "MFA-aware account handoff is missing.");

check(auth.includes("prepareAccountPlatformStorage"), "auth initialization does not prepare platform storage.");
check(auth.includes("adoptSupabaseSession"), "auth service does not adopt returned Supabase sessions into the shared SDK.");
check(auth.includes("markWordstrikeAccountActivity"), "auth service does not mark account activity.");
check(auth.includes("clearAccountPlatformSession"), "auth service does not clear the SDK mirror on sign-out.");
check(auth.includes("getAuthAccountHandoffState"), "auth service does not expose MFA/account handoff state.");
check(auth.includes('signInWithOAuth({'), "existing Supabase JS OAuth engine must remain intact during A5 cutover.");
check(auth.includes('scope: "local"'), "local browser sign-out semantics changed.");

check(supabase.includes('flowType: "implicit"'), "WORDSTRIKE implicit OAuth return flow changed.");
check(supabase.includes("persistSession: true"), "Supabase session persistence changed.");
check(supabase.includes("autoRefreshToken: true"), "Supabase refresh behavior changed.");
check(supabase.includes("detectSessionInUrl: true"), "OAuth callback detection changed.");

check(packageJson.type === "module", "WORDSTRIKE must remain ESM for the vendored SDK adapter.");

for (const [file, content] of [
  ["js/vendor/thiepnAccountSdk.js", vendor],
  ["js/thiepnAccount.js", adapter],
  ["js/authService.js", auth],
]) {
  check(!/service[_-]?role/i.test(content), `${file} contains a service-role reference.`);
  check(!/sb_secret_/i.test(content), `${file} contains a secret Supabase key.`);
}

if (!process.exitCode) {
  console.log("A5 WORDSTRIKE THIEPN Account platform contract: PASS");
}

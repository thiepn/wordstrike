import assert from "node:assert/strict";
import { renderPendingResultNotice, renderSettingsAccountManagement } from "../js/statisticsUi.js";
import { resolveAppClickAction } from "../js/appClickRouting.js";
import { Screens } from "../js/state.js";

const signedOut = renderSettingsAccountManagement({
  localProfile: { displayName: "PLAYER" },
  authState: { status: "signed-out" },
  leaderboardProfileState: { status: "idle" },
});
assert.match(signedOut, /ACCOUNT &amp; LEADERBOARDS/);
assert.match(signedOut, /LOCAL DISPLAY NAME/);
assert.match(signedOut, /CONTINUE WITH GOOGLE/);
assert.match(signedOut, /settings-edit-name/);

const signedIn = renderSettingsAccountManagement({
  localProfile: { displayName: "PLAYER" },
  editing: true,
  draft: "NEW NAME",
  authState: { status: "signed-in", user: { id: "user-1" } },
  leaderboardProfileState: { status: "ready", profile: { username: "Player_1", canChangeAt: null } },
  syncState: { status: "error", dirty: true, errorCode: "SYNC_UNAVAILABLE" },
});
assert.match(signedIn, /profile-name-input/);
assert.match(signedIn, /PUBLIC USERNAME/);
assert.match(signedIn, /CHANGE USERNAME/);
assert.match(signedIn, /SIGN OUT/);
assert.match(signedIn, /CLOUD SAVE NEEDS RETRY/);
assert.match(signedIn, /account-sync-retry/);

const usernameRequired = renderPendingResultNotice(
  { status: "username-required" },
  { status: "needs-username", profile: null },
);
assert.match(usernameRequired, /SET A PUBLIC USERNAME TO CONTINUE/);
assert.doesNotMatch(usernameRequired, /RETRY SUBMISSION/);
const existingProfile = renderPendingResultNotice(
  { status: "username-required" },
  { status: "ready", profile: { username: "Player_1" } },
);
assert.doesNotMatch(existingProfile, /SET A PUBLIC USERNAME/);
assert.match(existingProfile, /SUBMIT LAST RESULT/);
assert.match(renderPendingResultNotice({ status: "failed" }), /RETRY SUBMISSION/);
assert.match(renderPendingResultNotice({ status: "failed", errorCode: "OFFLINE" }), /APPEAR TO BE OFFLINE/);
assert.doesNotMatch(renderPendingResultNotice({ status: "failed", errorCode: "MALFORMED_INTENT" }), /RETRY SUBMISSION/);
assert.match(renderPendingResultNotice({ status: "expired", errorCode: "EXPIRED" }), /SAVED RESULT EXPIRED/);
assert.doesNotMatch(renderPendingResultNotice({ status: "waiting-for-profile" }), /RETRY SUBMISSION/);
assert.match(renderPendingResultNotice({ status: "submitting" }), /SUBMITTING\.\.\./);
assert.equal(renderPendingResultNotice({ status: "idle" }), "");

const root = { contains: () => true };
const screen = { className: "settings-screen", parent: null };
const button = {
  disabled: false,
  dataset: { action: "auth-google-sign-in" },
  parent: screen,
  getAttribute: () => null,
  closest(selector) {
    if (selector === "[data-action]") return this;
    if (selector === ".settings-screen") return screen;
    return null;
  },
};
assert.equal(resolveAppClickAction({ target: button, button: 0 }, { root, screen: Screens.SETTINGS }), "auth-google-sign-in");

console.log("Settings exposes shared local-profile, Google-auth, and public-username management controls.");

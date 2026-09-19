import assert from "node:assert/strict";
import { createLeaderboardProfileService } from "../js/leaderboardProfileService.js";

function createMock(responses = []) {
  const calls = [];
  return {
    calls,
    client: {
      functions: {
        async invoke(name, options) {
          calls.push({ name, options });
          const response = responses.shift() ?? { ok: true, data: { profile: null } };
          return { data: response, error: null };
        },
      },
    },
  };
}

const noProfileMock = createMock([{ ok: true, data: { profile: null } }]);
const service = createLeaderboardProfileService({ getClient: () => noProfileMock.client });
await service.checkUsernameAvailability("ValidName");
assert.equal(noProfileMock.calls.length, 0);
assert.equal((await service.initializeLeaderboardProfile({ id: "user-1" })).status, "needs-username");
await service.initializeLeaderboardProfile({ id: "user-1" });
assert.equal(noProfileMock.calls.length, 1);
assert.deepEqual(noProfileMock.calls[0], {
  name: "leaderboard-profile",
  options: { body: { action: "get" } },
});
service.resetLeaderboardProfile();
assert.equal(service.getLeaderboardProfileState().status, "idle");

const profile = {
  username: "WordStriker",
  usernameChangedAt: null,
  canChangeAt: null,
};
const existingMock = createMock([
  { ok: true, data: { profile } },
  { ok: true, data: { username: "wordstriker", available: true } },
  { ok: true, data: { profile: { ...profile, username: "NewStriker" } } },
]);
const existing = createLeaderboardProfileService({ getClient: () => existingMock.client });
assert.equal((await existing.initializeLeaderboardProfile({ id: "user-2" })).status, "ready");
assert.equal(existing.getLeaderboardProfileState().profile.username, "WordStriker");
await existing.initializeLeaderboardProfile({ id: "user-2" });
assert.equal(existingMock.calls.length, 1);
await existing.checkUsernameAvailability(" wordstriker ");
assert.equal(existing.getLeaderboardProfileState().availability.available, true);
existing.startUsernameChange();
assert.equal(existing.getLeaderboardProfileState().editing, true);
await existing.changeUsername("NewStriker");
assert.equal(existing.getLeaderboardProfileState().profile.username, "NewStriker");
assert.equal(JSON.stringify(existing.getLeaderboardProfileState()).includes("access_token"), false);

const claimMock = createMock([
  { ok: true, data: { profile: null } },
  { ok: true, data: { profile } },
]);
const claimService = createLeaderboardProfileService({ getClient: () => claimMock.client });
await claimService.initializeLeaderboardProfile({ id: "user-3" });
await claimService.claimUsername("WordStriker");
assert.equal(claimService.getLeaderboardProfileState().status, "ready");
assert.equal(claimService.getLeaderboardProfileState().notice, "Username created successfully.");

for (const code of [
  "INVALID_USERNAME", "USERNAME_TAKEN", "PROFILE_ALREADY_EXISTS", "PROFILE_NOT_FOUND",
  "CHANGE_COOLDOWN", "NOT_AUTHENTICATED", "SERVER_ERROR",
]) {
  const mock = createMock([
    { ok: true, data: { profile: null } },
    { ok: false, error: { code, canChangeAt: "2030-01-01T00:00:00.000Z" } },
  ]);
  const instance = createLeaderboardProfileService({ getClient: () => mock.client });
  await instance.initializeLeaderboardProfile({ id: `user-${code}` });
  await instance.claimUsername("Valid_Name");
  assert.equal(instance.getLeaderboardProfileState().error.code, code);
  assert.doesNotMatch(instance.getLeaderboardProfileState().error.message, /postgres|token|stack/i);
}

const unavailable = createLeaderboardProfileService({ getClient: () => null });
assert.equal((await unavailable.initializeLeaderboardProfile({ id: "user-4" })).status, "unavailable");

const recoveredProfile = {
  username: "Recovered_Player",
  usernameChangedAt: null,
  canChangeAt: null,
};
const retryMock = createMock([
  { ok: false, error: { code: "SERVER_ERROR" } },
  { ok: true, data: { profile: recoveredProfile } },
  { ok: true, data: { profile: recoveredProfile } },
]);
const retryService = createLeaderboardProfileService({ getClient: () => retryMock.client });
assert.equal((await retryService.initializeLeaderboardProfile({ id: "user-retry" })).status, "error");
assert.equal(
  (await retryService.initializeLeaderboardProfile({ id: "user-retry" })).status,
  "ready",
  "a transient profile failure must be retryable for the same signed-in account",
);
assert.equal(retryMock.calls.length, 2);
await retryService.initializeLeaderboardProfile({ id: "user-retry" });
assert.equal(retryMock.calls.length, 2, "settled healthy profile checks stay deduplicated");
await retryService.initializeLeaderboardProfile({ id: "user-retry" }, { force: true });
assert.equal(retryMock.calls.length, 3, "explicit profile retry forces a fresh server check");

console.log("Leaderboard profile initialization, deduplication, retry recovery, operations, errors, and sign-out reset passed.");

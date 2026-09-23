import assert from "node:assert/strict";
import { renderGlobalSubmissionMarkup } from "../js/ui.js";

const endless = { boardKey: "endless-v1" };
assert.match(renderGlobalSubmissionMarkup({ ...endless, status: "ineligible", reason: "signed-out" }), /Sign in.*CONTINUE WITH GOOGLE.*VIEW ENDLESS LEADERBOARD/s);
assert.match(renderGlobalSubmissionMarkup({ ...endless, status: "ineligible", reason: "username-required" }), /Choose a public username/);
assert.match(renderGlobalSubmissionMarkup({ ...endless, status: "ready" }), /SUBMIT GLOBAL SCORE.*view-endless-leaderboard/s);
const automaticReady = renderGlobalSubmissionMarkup({ ...endless, status: "ready", automatic: true });
assert.match(automaticReady, /Submitting global score/);
assert.match(automaticReady, /aria-busy="true"/);
assert.doesNotMatch(automaticReady, /SUBMIT GLOBAL SCORE|submit-global-score/);
const checking = renderGlobalSubmissionMarkup({ ...endless, status: "checking", automatic: true });
assert.match(checking, /Checking global account/);
assert.match(checking, /aria-busy="true"/);
const submitting = renderGlobalSubmissionMarkup({ ...endless, status: "submitting" });
assert.match(submitting, /Submitting global score/);
assert.match(submitting, /aria-busy="true"/);
assert.match(renderGlobalSubmissionMarkup({ ...endless, status: "submitted", rank: 42 }), /Global score submitted.*Rank #42/s);
assert.match(renderGlobalSubmissionMarkup({ ...endless, status: "already-submitted" }), /already submitted/);
assert.match(renderGlobalSubmissionMarkup({ ...endless, status: "error" }), /result is saved locally.*Keep this page open.*RETRY.*VIEW ENDLESS LEADERBOARD/s);
assert.match(renderGlobalSubmissionMarkup({ ...endless, status: "offline" }), /offline.*result is saved locally.*Keep this page open.*RETRY/s);
assert.match(
  renderGlobalSubmissionMarkup({ ...endless, status: "error", retryPersisted: true }),
  /Queued for automatic retry.*result is saved locally/s,
);
assert.match(
  renderGlobalSubmissionMarkup({ ...endless, status: "offline", retryPersisted: true }, { localResultStored: false }),
  /Submission queued for retry.*not saved to local history/s,
);
assert.match(
  renderGlobalSubmissionMarkup({ ...endless, status: "error" }, { localResultStored: false }),
  /not saved locally or queued.*Keep this page open and retry/s,
);
assert.match(
  renderGlobalSubmissionMarkup({ ...endless, status: "ready" }, { localResultStored: false }),
  /could not be saved locally.*Submit now before leaving this page/s,
);
assert.doesNotMatch(renderGlobalSubmissionMarkup({ ...endless, status: "ready" }), /email|token|user-?id/i);
assert.match(renderGlobalSubmissionMarkup({ boardKey: "campaign-highest-level-v1", status: "ready" }), /VIEW CAMPAIGN LEADERBOARD/);
const failedCampaign = renderGlobalSubmissionMarkup({ boardKey: "campaign-highest-level-v1", status: "ineligible", reason: "campaign-failed" });
assert.match(failedCampaign, /Only successfully completed levels/);
assert.doesNotMatch(failedCampaign, /SUBMIT GLOBAL SCORE/);
assert.match(renderGlobalSubmissionMarkup({ boardKey: "typing-60s-english200-v1", status: "ready" }), /VIEW 60S LEADERBOARD/);
assert.match(renderGlobalSubmissionMarkup({ boardKey: "typing-15s-english200-v1", status: "ready" }), /VIEW 15S LEADERBOARD/);
assert.match(renderGlobalSubmissionMarkup({ mode: "typing", boardKey: null, status: "ineligible", reason: "unsupported-test" }), /Only 15-second and 60-second English 200 tests/);
assert.equal(renderGlobalSubmissionMarkup({ boardKey: "daily-strike-v1", status: "ready" }), "");

console.log("Generic result submission UI covers active Campaign, Typing, and Endless boards while retired Daily has no submission surface.");

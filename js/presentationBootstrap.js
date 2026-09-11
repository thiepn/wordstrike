// WORDSTRIKE V12 presentation bootstrap.
//
// Presentation modules expose idempotent sync functions. One shared lifecycle
// owns app-root DOM observation. V12 also routes Typing Results through this
// coordinator so the historical results stack no longer owns an app observer.
import { syncCampaignGameplayPresentation } from "./campaignGameplayPresentation.js";
import { syncEndlessGameplayPresentation } from "./endlessGameplayPresentation.js";
import { syncBossGameplayPresentation } from "./bossGameplayPresentation.js";
import { syncArcadeRushGameplayPresentation } from "./arcadeRushGameplayPresentation.js";
import { syncProfileLeaderboardsSettingsPresentation } from "./profileLeaderboardsSettingsPresentation.js";
import { syncUi12GlobalPresentation } from "./ui12GlobalPresentation.js";
import { syncTypingResultsRuntime } from "./typingResultsRuntime.js";
import { createPresentationLifecycle } from "./presentationLifecycle.js";

const appRoot = document.querySelector("#app");

export const presentationLifecycle = createPresentationLifecycle({
  root: appRoot,
  presenters: [
    { id: "campaign", sync: syncCampaignGameplayPresentation },
    { id: "endless", sync: syncEndlessGameplayPresentation },
    { id: "boss", sync: syncBossGameplayPresentation },
    { id: "arcade-rush", sync: syncArcadeRushGameplayPresentation },
    { id: "profile-leaderboards-settings", sync: syncProfileLeaderboardsSettingsPresentation },
    { id: "ui12-global", sync: syncUi12GlobalPresentation },
    { id: "typing-results", sync: syncTypingResultsRuntime },
  ],
});

presentationLifecycle.start();

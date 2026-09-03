export const ONBOARDING_VERSIONS = Object.freeze({
  general: 3,
  campaign: 1,
  typing: 1,
  endless: 1,
  boss: 1,
  leaderboards: 1,
});

const step = (title, body, visualType, primaryLabel = "NEXT", extra = {}) => Object.freeze({
  title, body, visualType, primaryLabel, ...extra,
});

export const ONBOARDING_TUTORIALS = Object.freeze({
  general: Object.freeze({
    id: "general", version: 3, title: "WORDSTRIKE INTRODUCTION",
    steps: Object.freeze([
      step("TYPE BEFORE THEY STRIKE", "Words move toward the center.\n\nType them correctly before they reach it.", "approaching-word"),
      step("JUST START TYPING", "Typing the first valid letter narrows or selects a target. Once one word is highlighted, finish it before targeting another.\n\nOn phones and tablets, tap the game area to open the keyboard.", "typing-highlight"),
      step("NAVIGATE YOUR WAY", "Use mouse, touch, or keyboard.", "navigation-controls", "NEXT", {
        controls: Object.freeze([
          Object.freeze({ key: "ARROW KEYS", label: "Move between menus and options" }),
          Object.freeze({ key: "ENTER", label: "Select or confirm" }),
          Object.freeze({ key: "ESC", label: "Go back or pause" }),
        ]),
      }),
      step("PLAY YOUR WAY", "Progress and records stay on this device.\n\nSigning in is optional and enables global score submission.", "local-first", "START", {
        secondaryLabel: "SIGN IN WITH GOOGLE", secondaryChoice: "google",
        secondarySignedOutOnly: true,
      }),
    ]),
  }),
  campaign: Object.freeze({
    id: "campaign", version: 1, title: "CAMPAIGN GUIDE",
    steps: Object.freeze([
      step("PROTECT THE CORE", "Words move toward the center. Type them before they reach the core.", "approaching-word"),
      step("DON’T LET WORDS THROUGH", "Missed words damage core integrity. Complete the highlighted word before choosing another target.", "core-integrity"),
      step("COMPLETE LEVELS", "Clear every incoming word to complete the level. Better speed and accuracy lead to better results.", "campaign-complete", "START LEVEL 1"),
    ]),
  }),
  typing: Object.freeze({
    id: "typing", version: 1, title: "TYPING TEST GUIDE",
    steps: Object.freeze([
      step("PURE TYPING", "No words attack the center here. Type the displayed text as quickly and accurately as possible.", "word-stream"),
      step("THE TIMER STARTS WITH YOUR FIRST KEY", "Type the current word, then press Space to advance. Use Backspace to correct mistakes.", "typing-highlight", "NEXT", {
        controls: Object.freeze([
          Object.freeze({ key: "TYPE", label: "Start and enter the current word." }),
          Object.freeze({ key: "SPACE", label: "Submit and move to the next word." }),
          Object.freeze({ key: "BACKSPACE", label: "Correct the current word." }),
          Object.freeze({ key: "TAB", label: "Restart the current test." }),
          Object.freeze({ key: "ESC", label: "Pause the test." }),
        ]),
      }),
      step("CHOOSE YOUR TEST", "Timed tests end when time runs out. Word tests end after the selected number of words. 15s and 60s tests can join global rankings.", "typing-options", "CHOOSE A TEST"),
    ]),
  }),
  endless: Object.freeze({
    id: "endless", version: 1, title: "ENDLESS GUIDE",
    steps: Object.freeze([
      step("SURVIVE AS LONG AS YOU CAN", "There is no final level. Keep typing and protect the core for as long as possible.", "approaching-word"),
      step("IT KEEPS GETTING HARDER", "Words become faster and more difficult over time. Your final stage and score determine your result.", "difficulty-growth", "START ENDLESS"),
    ]),
  }),
  boss: Object.freeze({
    id: "boss", version: 1, title: "BOSS GUIDE",
    steps: Object.freeze([
      step("BOSS BATTLE", "Bosses use longer phrases instead of normal words. Type each phrase correctly to attack.", "boss-phrase"),
      step("COMPLETE EVERY PHASE", "Finish every phrase before the battle timer runs out.", "boss-phases", "BEGIN BATTLE"),
    ]),
  }),
  leaderboards: Object.freeze({
    id: "leaderboards", version: 1, title: "GLOBAL LEADERBOARDS",
    steps: Object.freeze([
      step("GLOBAL LEADERBOARDS", "View rankings without signing in. Sign in with Google and choose a public username to submit your own scores.", "leaderboard-ranking", "VIEW RANKINGS", {
        secondaryLabel: "CONTINUE WITH GOOGLE", secondaryChoice: "google",
        tertiaryLabel: "NOT NOW", tertiaryChoice: "not-now",
      }),
    ]),
  }),
});

export function getOnboardingTutorial(id) {
  return ONBOARDING_TUTORIALS[id] || null;
}

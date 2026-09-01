import { Screens } from "./appScreens.js";

const DOMAIN_DEFAULTS = Object.freeze({
  environment: Object.freeze({
    devMode: false,
    developerSeed: null,
  }),
  resources: Object.freeze({
    save: null,
    wordBank: null,
    bossWordBank: null,
    speedTestWordBank: null,
    commonWordBank: null,
  }),
  navigation: Object.freeze({
    screen: Screens.TITLE,
    previousScreen: Screens.TITLE,
    menuIndex: 0,
    modeSelection: 0,
    pauseIndex: 0,
    settingsIndex: 0,
  }),
  session: Object.freeze({
    game: null,
  }),
  campaign: Object.freeze({
    currentLevel: 1,
    results: null,
    campaignResult: null,
    levelSelection: 1,
    resultsIndex: 0,
    resultsReadyAt: 0,
  }),
  typing: Object.freeze({
    speedTestConfigId: "time-60",
    speedTestResultsIndex: 0,
    speedTestResultsReadyAt: 0,
    speedTestResult: null,
    speedTestRecordFlags: null,
  }),
  endless: Object.freeze({
    endlessResult: null,
    endlessResultsIndex: 0,
    endlessResultsReadyAt: 0,
    endlessStartStage: 1,
  }),
  daily: Object.freeze({
    dailyDateKey: null,
    dailyDateOverride: false,
    dailyResult: null,
    dailyRecordFlags: null,
    dailyResultsIndex: 0,
    dailyResultsReadyAt: 0,
  }),
  profile: Object.freeze({
    statisticsTabIndex: 0,
    statisticsRecentFilter: "all",
    profileEditing: false,
    profileDraft: "",
    profileNameError: "",
    profileCopyMessage: "",
  }),
});

const LEGACY_PROPERTY_ORDER = Object.freeze([
  ["screen", "navigation"],
  ["previousScreen", "navigation"],
  ["devMode", "environment"],
  ["developerSeed", "environment"],
  ["save", "resources"],
  ["wordBank", "resources"],
  ["bossWordBank", "resources"],
  ["speedTestWordBank", "resources"],
  ["commonWordBank", "resources"],
  ["currentLevel", "campaign"],
  ["game", "session"],
  ["results", "campaign"],
  ["campaignResult", "campaign"],
  ["menuIndex", "navigation"],
  ["modeSelection", "navigation"],
  ["speedTestConfigId", "typing"],
  ["speedTestResultsIndex", "typing"],
  ["speedTestResultsReadyAt", "typing"],
  ["speedTestResult", "typing"],
  ["speedTestRecordFlags", "typing"],
  ["endlessResult", "endless"],
  ["endlessResultsIndex", "endless"],
  ["endlessResultsReadyAt", "endless"],
  ["endlessStartStage", "endless"],
  ["dailyDateKey", "daily"],
  ["dailyDateOverride", "daily"],
  ["dailyResult", "daily"],
  ["dailyRecordFlags", "daily"],
  ["dailyResultsIndex", "daily"],
  ["dailyResultsReadyAt", "daily"],
  ["levelSelection", "campaign"],
  ["pauseIndex", "navigation"],
  ["resultsIndex", "campaign"],
  ["resultsReadyAt", "campaign"],
  ["settingsIndex", "navigation"],
  ["statisticsTabIndex", "profile"],
  ["statisticsRecentFilter", "profile"],
  ["profileEditing", "profile"],
  ["profileDraft", "profile"],
  ["profileNameError", "profile"],
  ["profileCopyMessage", "profile"],
]);

function createDomain(defaults) {
  return Object.seal({ ...defaults });
}

export const stateDomains = Object.freeze(Object.fromEntries(
  Object.entries(DOMAIN_DEFAULTS).map(([name, defaults]) => [name, createDomain(defaults)]),
));

const propertyOwnership = new Map();
for (const [property, domainName] of LEGACY_PROPERTY_ORDER) {
  if (propertyOwnership.has(property)) throw new Error(`Duplicate app state property: ${property}`);
  if (!Object.hasOwn(stateDomains[domainName], property)) {
    throw new Error(`State ownership mismatch: ${domainName}.${property}`);
  }
  propertyOwnership.set(property, domainName);
}

for (const [domainName, domain] of Object.entries(stateDomains)) {
  for (const property of Object.keys(domain)) {
    if (propertyOwnership.get(property) !== domainName) {
      throw new Error(`Unmapped app state property: ${domainName}.${property}`);
    }
  }
}

const facade = {};
for (const [property, domainName] of LEGACY_PROPERTY_ORDER) {
  Object.defineProperty(facade, property, {
    enumerable: true,
    configurable: false,
    get() {
      return stateDomains[domainName][property];
    },
    set(value) {
      stateDomains[domainName][property] = value;
    },
  });
}

export const appState = Object.preventExtensions(facade);
export const STATE_DOMAIN_NAMES = Object.freeze(Object.keys(stateDomains));

export function getStateDomain(domainName) {
  return stateDomains[domainName] || null;
}

export function getStateOwner(property) {
  return propertyOwnership.get(property) || null;
}

export function patchStateDomain(domainName, patch) {
  const domain = stateDomains[domainName];
  if (!domain) throw new TypeError(`Unknown state domain: ${domainName}`);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("State domain patch must be an object");
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(domain, key)) {
      throw new TypeError(`Unknown ${domainName} state property: ${key}`);
    }
    domain[key] = value;
  }
  return domain;
}

export function resetStateDomains() {
  for (const [domainName, defaults] of Object.entries(DOMAIN_DEFAULTS)) {
    Object.assign(stateDomains[domainName], defaults);
  }
  return stateDomains;
}

export function snapshotStateDomains() {
  return Object.freeze(Object.fromEntries(
    Object.entries(stateDomains).map(([name, domain]) => [name, Object.freeze({ ...domain })]),
  ));
}

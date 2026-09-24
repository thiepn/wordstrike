export const FLOW_THEME_PREFERENCE_STORAGE_KEY = "wordstrike_flow_theme_preference_v1";
export const FLOW_THEME_PREFERENCE_VERSION = 1;

const SAFE_THEME_PATTERN = /^[a-z0-9-]{1,32}$/;

export function normalizeStoredFlowTheme(value, fallback = "mixed") {
  const theme = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SAFE_THEME_PATTERN.test(theme) ? theme : fallback;
}

export function loadPreferredFlowTheme(fallback = "mixed") {
  try {
    const stored = globalThis.localStorage?.getItem(FLOW_THEME_PREFERENCE_STORAGE_KEY);
    return normalizeStoredFlowTheme(stored, fallback);
  } catch {
    return fallback;
  }
}

export function savePreferredFlowTheme(theme, fallback = "mixed") {
  const normalized = normalizeStoredFlowTheme(theme, fallback);
  try {
    globalThis.localStorage?.setItem(FLOW_THEME_PREFERENCE_STORAGE_KEY, normalized);
  } catch {
    // Flow remains fully playable if preference storage is unavailable.
  }
  return normalized;
}

export function formatFlowThemeLabel(value) {
  const normalized = normalizeStoredFlowTheme(value, "mixed");
  if (normalized === "mixed") return "Mixed";
  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getFlowStreamIdentity(plan, activeSegmentIndex = 0) {
  if (!plan || plan.structure !== "continuous-stream") {
    return Object.freeze({
      modeLabel: "FLOW",
      modeDescriptor: "Continuous longform",
      selectedTheme: "mixed",
      selectedThemeLabel: "Mixed",
      sourceTitle: "Flow",
      sourceTheme: "mixed",
      sourceThemeLabel: "Mixed",
      sourcePosition: "Text",
      documentIndex: 0,
      documentCount: 0,
      difficulty: "natural",
      wordCount: 0,
    });
  }

  const segments = Array.isArray(plan.segments) ? plan.segments : [];
  const documents = Array.isArray(plan.documents) ? plan.documents : [];
  const safeSegmentIndex = Math.max(0, Math.min(
    Math.max(0, segments.length - 1),
    Math.round(Number(activeSegmentIndex) || 0),
  ));
  const segment = segments[safeSegmentIndex] || null;
  const documentIndex = Math.max(0, Math.min(
    Math.max(0, documents.length - 1),
    Math.round(Number(segment?.documentIndex) || 0),
  ));
  const document = documents[documentIndex] || null;
  const selectedTheme = normalizeStoredFlowTheme(plan.theme, "mixed");
  const sourceTheme = normalizeStoredFlowTheme(document?.theme, selectedTheme);

  return Object.freeze({
    modeLabel: "FLOW",
    modeDescriptor: "Continuous longform",
    selectedTheme,
    selectedThemeLabel: formatFlowThemeLabel(selectedTheme),
    sourceTitle: String(document?.title || plan.seriesTitle || "Flow"),
    sourceTheme,
    sourceThemeLabel: String(document?.themeLabel || formatFlowThemeLabel(sourceTheme)),
    sourcePosition: documents.length
      ? `Text ${documentIndex + 1} / ${documents.length}`
      : "Text",
    documentIndex,
    documentCount: documents.length,
    difficulty: String(document?.difficulty || plan.difficulty || "natural"),
    wordCount: Math.max(0, Math.round(Number(document?.wordCount) || 0)),
  });
}

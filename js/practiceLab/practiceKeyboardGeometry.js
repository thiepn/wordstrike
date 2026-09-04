export const PRACTICE_KEYBOARD_GEOMETRY_VERSION = 1;
export const PRACTICE_KEYBOARD_GEOMETRY_NEAR_DISTANCE = 1.75;

export const PRACTICE_KEYBOARD_GEOMETRY_CLASSES = Object.freeze([
  "same-side-near",
  "same-side-far",
  "cross-side",
  "same-key",
  "unknown",
]);

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function row(keys, stagger = 0) {
  return Object.freeze({ keys: Object.freeze([...keys]), stagger });
}

const LAYOUT_ROWS = Object.freeze({
  qwerty: Object.freeze([
    row("qwertyuiop", 0),
    row("asdfghjkl", 0.25),
    row("zxcvbnm", 0.75),
  ]),
  qwertz: Object.freeze([
    row("qwertzuiop", 0),
    row("asdfghjkl", 0.25),
    row("yxcvbnm", 0.75),
  ]),
  azerty: Object.freeze([
    row("azertyuiop", 0),
    row("qsdfghjklm", 0.25),
    row("wxcvbn", 0.75),
  ]),
  colemak: Object.freeze([
    row("qwfpgjluy;", 0),
    row("arstdhneio", 0.25),
    row("zxcvbkm,./", 0.75),
  ]),
  dvorak: Object.freeze([
    row(["'", ",", ".", "p", "y", "f", "g", "c", "r", "l", "/", "="], 0),
    row(["a", "o", "e", "u", "i", "d", "h", "t", "n", "s", "-"], 0.25),
    row([";", "q", "j", "k", "x", "b", "m", "w", "v", "z"], 0.75),
  ]),
});

function buildGeometry(rows) {
  const keys = {};
  rows.forEach((rowDefinition, rowIndex) => {
    const center = (rowDefinition.keys.length - 1) / 2;
    rowDefinition.keys.forEach((key, column) => {
      if (keys[key]) return;
      const x = column + rowDefinition.stagger;
      keys[key] = Object.freeze({
        row: rowIndex,
        column,
        stagger: rowDefinition.stagger,
        x,
        side: column <= center ? "left" : "right",
      });
    });
  });
  return freezeDeep(keys);
}

export const PRACTICE_KEYBOARD_LAYOUTS = freezeDeep(Object.fromEntries(
  Object.entries(LAYOUT_ROWS).map(([layout, rows]) => [layout, {
    version: PRACTICE_KEYBOARD_GEOMETRY_VERSION,
    layout,
    status: "supported",
    keys: buildGeometry(rows),
  }]),
));

export function normalizePracticeGeometryLayout(layout) {
  return typeof layout === "string" ? layout.trim().toLowerCase() : "";
}

export function getPracticeKeyboardLayoutGeometry(layout) {
  const normalized = normalizePracticeGeometryLayout(layout);
  return PRACTICE_KEYBOARD_LAYOUTS[normalized] ?? freezeDeep({
    version: PRACTICE_KEYBOARD_GEOMETRY_VERSION,
    layout: normalized || null,
    status: "unsupported",
    keys: {},
  });
}

function normalizeGeometryKey(value) {
  if (typeof value !== "string" || !value) return null;
  const normalized = value.normalize("NFC").toLowerCase();
  return [...normalized].length === 1 ? normalized : null;
}

export function getPracticeKeyGeometry(layout, value) {
  const definition = getPracticeKeyboardLayoutGeometry(layout);
  const key = normalizeGeometryKey(value);
  if (definition.status !== "supported" || !key) return null;
  return definition.keys[key] ?? null;
}

export function calculatePracticeKeyGeometryDistance(from, to) {
  if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(to.x)) return null;
  return Math.hypot(to.x - from.x, to.row - from.row);
}

export function classifyPracticeKeyboardGeometry({
  layout,
  previousExpected,
  currentExpected,
  nearDistance = PRACTICE_KEYBOARD_GEOMETRY_NEAR_DISTANCE,
} = {}) {
  const definition = getPracticeKeyboardLayoutGeometry(layout);
  const from = getPracticeKeyGeometry(layout, previousExpected);
  const to = getPracticeKeyGeometry(layout, currentExpected);
  if (definition.status !== "supported" || !from || !to) return freezeDeep({
    geometryVersion: PRACTICE_KEYBOARD_GEOMETRY_VERSION,
    layoutStatus: definition.status,
    geometryClass: "unknown",
    distance: null,
    known: false,
  });
  const distance = calculatePracticeKeyGeometryDistance(from, to);
  let geometryClass;
  if (from.row === to.row && from.column === to.column) geometryClass = "same-key";
  else if (from.side !== to.side) geometryClass = "cross-side";
  else geometryClass = distance <= nearDistance ? "same-side-near" : "same-side-far";
  return freezeDeep({
    geometryVersion: PRACTICE_KEYBOARD_GEOMETRY_VERSION,
    layoutStatus: "supported",
    geometryClass,
    distance,
    known: true,
  });
}

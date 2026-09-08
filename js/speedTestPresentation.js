export const SPEED_TEST_FONT_SIZES = Object.freeze([
  Object.freeze({ value: "auto", label: "Auto" }),
  Object.freeze({ value: "small", label: "Small" }),
  Object.freeze({ value: "medium", label: "Medium" }),
  Object.freeze({ value: "large", label: "Large" }),
]);

export function normalizeSpeedTestFontSize(value) {
  return SPEED_TEST_FONT_SIZES.some((option) => option.value === value) ? value : "auto";
}

export function speedTestFontSizeMarkup(value) {
  const selected = normalizeSpeedTestFontSize(value);
  return `<label class="speed-font-size">TEXT SIZE
    <select data-speed-font-size aria-label="Typing text size">${SPEED_TEST_FONT_SIZES.map(
    (option) => `<option value="${option.value}"${option.value === selected ? " selected" : ""}>${option.label}</option>`,
  ).join("")}</select></label>`;
}

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function englishContext(context) {
  const language = String(context?.language ?? context?.locale ?? "en").toLowerCase();
  return language === "en" || language.startsWith("en-");
}
function canProduceAll(requiredCharacters, inputCapability) {
  if (!inputCapability) return true;
  if (typeof inputCapability.canProduceExpectedGrapheme === "function") return requiredCharacters.every((value) => inputCapability.canProduceExpectedGrapheme(value) === true);
  if (inputCapability.supportedCharacters instanceof Set) return requiredCharacters.every((value) => inputCapability.supportedCharacters.has(value));
  if (Array.isArray(inputCapability.supportedCharacters)) {
    const set = new Set(inputCapability.supportedCharacters);
    return requiredCharacters.every((value) => set.has(value));
  }
  return inputCapability.fullTextInput !== false;
}

export function getPracticeSpecialDomainAvailability({
  context,
  practiceFormSet = null,
  checkFormSet = null,
  practiceError = null,
  checkError = null,
  practiceDurationsMs = [],
  requiredCharacters = [],
  inputCapability = null,
  codePrefix = "SPECIAL_DOMAIN",
} = {}) {
  const english = englishContext(context);
  const compatible = canProduceAll(requiredCharacters, inputCapability);
  const reasons = [];
  if (!english) reasons.push(`${codePrefix}_UNSUPPORTED_LANGUAGE`);
  if (!compatible) reasons.push(`${codePrefix}_INPUT_INCOMPATIBLE`);
  if (!practiceFormSet?.forms?.length) reasons.push(practiceError?.code ?? `${codePrefix}_PRACTICE_FORMS_UNAVAILABLE`);
  if (!checkFormSet?.forms?.length) reasons.push(checkError?.code ?? `${codePrefix}_CHECK_FORMS_UNAVAILABLE`);
  const practiceAvailable = english && compatible && Boolean(practiceFormSet?.forms?.length);
  const checkAvailable = english && compatible && Boolean(checkFormSet?.forms?.length);
  return freezeDeep({
    practiceAvailable,
    practiceDurations: practiceAvailable ? [...practiceDurationsMs] : [],
    practiceDurationsMs: practiceAvailable ? [...practiceDurationsMs] : [],
    checkAvailable,
    reasons: [...new Set(reasons)],
  });
}

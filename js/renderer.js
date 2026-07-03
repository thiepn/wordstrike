const wordElements = new Map();
let bossPhraseElement = null;

export function getBossPhraseSizeClass(characterCount) {
  if (characterCount > 110) return "boss-phrase-size-extreme";
  if (characterCount > 75) return "boss-phrase-size-dense";
  return "boss-phrase-size-normal";
}

function playArea() {
  return document.querySelector("#play-area");
}

export function clearWordElements() {
  for (const { position } of wordElements.values()) {
    position.remove();
  }
  wordElements.clear();
}

export function createWordElement(word) {
  const area = playArea();
  if (!area) return;
  const position = document.createElement("div");
  const separation = document.createElement("div");
  const visual = document.createElement("div");
  const text = document.createElement("span");
  const typed = document.createElement("span");
  const remaining = document.createElement("span");
  position.className = "word-position";
  separation.className = "word-separation";
  visual.className = "word-visual";
  text.className = "word-text";
  typed.className = "typed-letter";
  remaining.className = "remaining-letter";
  position.dataset.wordId = word.id;
  position.setAttribute("aria-label", word.text);
  visual.addEventListener("animationend", (event) => {
    if (event.animationName === "wrong") visual.classList.remove("wrong");
  });
  text.append(typed, remaining);
  visual.append(text);
  separation.append(visual);
  position.append(separation);
  area.append(position);
  wordElements.set(word.id, {
    position,
    separation,
    visual,
    typed,
    remaining,
    renderedText: null,
    renderedTypedIndex: null,
  });
  updateWordElement(word, false);
}

export function updateWordElement(word, isActive, candidateState = null) {
  const elements = wordElements.get(word.id);
  if (!elements) return;
  const { position, separation, visual, typed, remaining } = elements;
  const isCandidate = candidateState?.candidate === true;
  const candidatePrefixLength = isCandidate
    ? Math.max(0, candidateState.prefixLength || 0)
    : 0;
  position.style.transform = `translate3d(${word.x}px, ${word.y}px, 0) translate(-50%, -50%)`;
  separation.style.transform = `translate3d(${word.separationX || 0}px, ${word.separationY || 0}px, 0)`;
  visual.classList.toggle("active", isActive);
  visual.classList.toggle("candidate", isCandidate);
  const displayTypedIndex = isCandidate ? candidatePrefixLength : word.typedIndex;
  if (
    elements.renderedText !== word.text ||
    elements.renderedTypedIndex !== displayTypedIndex
  ) {
    typed.textContent = word.text.slice(0, displayTypedIndex);
    remaining.textContent = word.text.slice(displayTypedIndex);
    position.setAttribute("aria-label", word.text);
    elements.renderedText = word.text;
    elements.renderedTypedIndex = displayTypedIndex;
  }
}

export function removeWordElement(word, completed = false, particlesEnabled = true) {
  const elements = wordElements.get(word.id);
  if (!elements) return;
  if (completed && particlesEnabled) {
    const burst = document.createElement("div");
    burst.className = "burst";
    burst.style.left = `${word.x}px`;
    burst.style.top = `${word.y}px`;
    playArea()?.append(burst);
    window.setTimeout(() => burst.remove(), 350);
  }
  elements.position.remove();
  wordElements.delete(word.id);
}

export function flashWrong(wordId) {
  const visual = wordElements.get(wordId)?.visual;
  if (!visual) return;
  visual.classList.remove("wrong");
  void visual.offsetWidth;
  visual.classList.add("wrong");
}

export function flashCandidateWrong(candidateIds) {
  for (const wordId of candidateIds) flashWrong(wordId);
}

export function flashDamage(screenShake = true) {
  const area = playArea();
  if (!area) return;
  area.classList.remove("damage-flash");
  void area.offsetWidth;
  area.classList.add("damage-flash");
  if (screenShake) {
    area.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: "translate(-5px, 2px)" },
        { transform: "translate(4px, -2px)" },
        { transform: "translate(0, 0)" },
      ],
      { duration: 180 },
    );
  }
  window.setTimeout(() => area.classList.remove("damage-flash"), 260);
}

export function clearBossPhrase() {
  if (bossPhraseElement) {
    bossPhraseElement.innerHTML = "";
    if (bossPhraseElement.dataset) delete bossPhraseElement.dataset.phrase;
  }
  bossPhraseElement = null;
}

export function renderBossPhrase(game) {
  const container = document.querySelector("#boss-phrase");
  if (!container) return;
  bossPhraseElement = container;
  const renderedPhrase = container.dataset?.phrase ?? container._bossPhrase;
  if (renderedPhrase !== game.currentPhrase) {
    container.classList?.remove(
      "boss-phrase-size-normal",
      "boss-phrase-size-dense",
      "boss-phrase-size-extreme",
    );
    container.classList?.add(getBossPhraseSizeClass(game.currentPhrase.length));
    let globalIndex = 0;
    container.innerHTML = game.currentPhrase.split(" ").map((word, wordIndex, words) => {
      const characters = [...word].map((character) => {
        const index = globalIndex;
        globalIndex += 1;
        return `<span class="boss-char" data-char-index="${index}">${character}</span>`;
      }).join("");
      const trailingSpace = wordIndex < words.length - 1
        ? `<span class="boss-char boss-space" data-char-index="${globalIndex++}">&nbsp;</span>`
        : "";
      return `<span class="boss-word-group">${characters}${trailingSpace}</span>`;
    }).join('<wbr class="boss-wrap-opportunity">');
    if (container.dataset) container.dataset.phrase = game.currentPhrase;
    else container._bossPhrase = game.currentPhrase;
  }
  container.querySelectorAll?.(".boss-char").forEach((character) => {
    const index = Number(character.dataset.charIndex);
    character.classList.toggle("boss-typed", index < game.phraseCharIndex);
    character.classList.toggle("boss-current", index === game.phraseCharIndex);
    character.classList.toggle("boss-remaining", index > game.phraseCharIndex);
  });
  const progress = document.querySelector("#boss-progress-fill");
  if (progress) {
    const percent = game.currentPhrase.length
      ? (game.phraseCharIndex / game.currentPhrase.length) * 100
      : 0;
    progress.style.width = `${percent}%`;
  }
}

export function flashBossWrong() {
  const frame = document.querySelector(".boss-phrase-frame");
  if (!frame) return;
  frame.classList.remove("wrong");
  void frame.offsetWidth;
  frame.classList.add("wrong");
  window.setTimeout(() => frame.classList.remove("wrong"), 180);
}

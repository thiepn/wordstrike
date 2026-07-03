import assert from "node:assert/strict";
import { updateWordSeparation } from "../js/gameLoop.js";
import {
  advanceWordTrajectory,
  createWordTrajectory,
  projectWordTrajectory,
} from "../js/gameplayWorld.js";

const viewport = { width: 800, height: 450 };
const gameFor = (words) => ({
  words,
  targetingState: { activeTargetId: null, candidateIds: [] },
});
const movingWord = (edge, id, ratio = 0.5) => ({
  id,
  text: "extraordinary",
  typedIndex: 0,
  separationX: 0,
  separationY: 0,
  ...createWordTrajectory({ edge, ratio, speed: 100 }),
});

const deltas = [16, 33, 50, 100, 100, 100];
const runEdge = (edge, id) => {
  const word = movingWord(edge, id);
  projectWordTrajectory(word, viewport);
  const initial = { x: word.x, y: word.y };
  const positions = [];
  const progress = [];
  updateWordSeparation(gameFor([word]), viewport, 16);
  assert.equal(word.separationX, 0);
  assert.equal(word.separationY, 0);
  for (const delta of deltas) {
    advanceWordTrajectory(word, delta, viewport);
    updateWordSeparation(gameFor([word]), viewport, delta);
    positions.push({ x: word.x, y: word.y });
    progress.push(word.travelProgress);
    assert.equal(word.separationX, 0, `${edge} separationX`);
    assert.equal(word.separationY, 0, `${edge} separationY`);
  }
  assert.ok(progress.every((value, index) => index === 0 || value > progress[index - 1]));
  return { word, initial, positions };
};

const left = runEdge("left", 1);
const right = runEdge("right", 2);
assert.ok(left.initial.x < 110, "long left word may begin partially clipped");
assert.ok(right.initial.x > viewport.width - 110, "long right word may begin partially clipped");
assert.ok(left.positions.every((point, index, values) => index === 0 || point.x > values[index - 1].x));
assert.ok(right.positions.every((point, index, values) => index === 0 || point.x < values[index - 1].x));
const leftDisplacement = left.positions.at(-1).x - left.initial.x;
const rightDisplacement = right.initial.x - right.positions.at(-1).x;
assert.ok(Math.abs(leftDisplacement - rightDisplacement) < 1e-9);
runEdge("top", 3);
runEdge("bottom", 4);

const first = movingWord("left", 5, 0.5);
const second = movingWord("left", 6, 0.505);
projectWordTrajectory(first, viewport);
projectWordTrajectory(second, viewport);
const overlapGame = gameFor([first, second]);
let previousProgress = 0;
let separationActivated = false;
for (const delta of [16, 33, 50, 100]) {
  advanceWordTrajectory(first, delta, viewport);
  advanceWordTrajectory(second, delta, viewport);
  updateWordSeparation(overlapGame, viewport, delta);
  assert.ok(first.travelProgress > previousProgress);
  previousProgress = first.travelProgress;
  assert.ok(Math.abs(first.separationX) <= 30 && Math.abs(first.separationY) <= 30);
  assert.ok(Math.abs(second.separationX) <= 30 && Math.abs(second.separationY) <= 30);
  separationActivated ||= Math.abs(first.separationX) + Math.abs(first.separationY) > 0;
}
assert.equal(separationActivated, true);

class ClassList {
  toggle() {}
  add() {}
  remove() {}
}
class Element {
  constructor() {
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.classList = new ClassList();
    this.innerHTMLWrites = 0;
    this.textWrites = 0;
  }
  set className(value) { this._className = value; }
  set innerHTML(value) { this._innerHTML = value; this.innerHTMLWrites += 1; }
  set textContent(value) { this._textContent = value; this.textWrites += 1; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener() {}
  remove() {}
}
const area = new Element();
globalThis.document = {
  querySelector: (selector) => selector === "#play-area" ? area : null,
  createElement: () => new Element(),
};
globalThis.window = { setTimeout() {} };
const { createWordElement, updateWordElement, clearWordElements } = await import("../js/renderer.js");
const rendered = { id: 99, text: "example", typedIndex: 0, x: 10, y: 20, separationX: 0, separationY: 0 };
createWordElement(rendered);
const position = area.children[0];
const separation = position.children[0];
const visual = separation.children[0];
const text = visual.children[0];
const typedNode = text.children[0];
const remainingNode = text.children[1];
const initialTextWrites = typedNode.textWrites + remainingNode.textWrites;
rendered.x = 20;
updateWordElement(rendered, false);
assert.equal(visual.innerHTMLWrites, 0);
assert.equal(typedNode.textWrites + remainingNode.textWrites, initialTextWrites);
assert.match(position.style.transform, /^translate3d\(/);
assert.match(separation.style.transform, /^translate3d\(/);
rendered.typedIndex = 1;
updateWordElement(rendered, true);
assert.ok(typedNode.textWrites + remainingNode.textWrites > initialTextWrites);
rendered.typedIndex = 0;
updateWordElement(rendered, false, { candidate: true, prefixLength: 2 });
assert.equal(typedNode._textContent, "ex");
assert.equal(remainingNode._textContent, "ample");
updateWordElement(rendered, false, { candidate: false, prefixLength: 0 });
assert.equal(typedNode._textContent, "");
assert.equal(remainingNode._textContent, "example");
clearWordElements();

console.log("Edge entry stays monotonic and symmetric while overlap correction and cached word markup remain active.");

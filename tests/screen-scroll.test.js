import assert from "node:assert/strict";
import { captureScreenScroll, restoreScreenScroll } from "../js/screenScroll.js";

const screen = { scrollTop: 428, scrollLeft: 9, classList: { contains: (name) => name === "screen" } };
const root = { firstElementChild: screen, querySelector: () => screen };
const calls = [];
const windowRef = { scrollX: 3, scrollY: 17, scrollTo: (...args) => calls.push(args) };
const snapshot = captureScreenScroll(root, windowRef);
assert.deepEqual(snapshot, { screenTop: 428, screenLeft: 9, pageX: 3, pageY: 17 });
screen.scrollTop = 0;
screen.scrollLeft = 0;
assert.equal(restoreScreenScroll(root, snapshot, windowRef), true);
assert.equal(screen.scrollTop, 428);
assert.equal(screen.scrollLeft, 9);
assert.deepEqual(calls, [[3, 17]]);
console.log("Same-screen scroll capture/restore keeps result/profile/settings positions stable.");

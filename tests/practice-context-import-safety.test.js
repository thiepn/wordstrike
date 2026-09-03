import assert from "node:assert/strict";

const names = ["indexedDB", "localStorage", "addEventListener", "setInterval", "setTimeout"];
const descriptors = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const touched = [];
const trapObject = (name) => new Proxy({}, {
  get() {
    touched.push(name);
    throw new Error(name + " must not be touched during Practice context import");
  },
});

try {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: trapObject("indexedDB") });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: trapObject("localStorage") });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, writable: true, value: () => { touched.push("addEventListener"); throw new Error("listener installation is forbidden during import"); } });
  Object.defineProperty(globalThis, "setInterval", { configurable: true, writable: true, value: () => { touched.push("setInterval"); throw new Error("timers are forbidden during import"); } });
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, writable: true, value: () => { touched.push("setTimeout"); throw new Error("timers are forbidden during import"); } });
  const module = await import("../js/practiceLab/practiceContext.js?pl5-import-safety=1");
  assert.equal(typeof module.createDefaultPracticeContext, "function");
  assert.deepEqual(touched, []);
} finally {
  for (const name of names) {
    const descriptor = descriptors.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

console.log("PL5 context module import is zero-side-effect.");

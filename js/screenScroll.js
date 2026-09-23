function currentScreen(root) {
  if (!root) return null;
  const direct = root.firstElementChild;
  if (direct?.classList?.contains?.("screen")) return direct;
  return root.querySelector?.(".screen") ?? null;
}

export function captureScreenScroll(root, windowRef = globalThis.window) {
  const screen = currentScreen(root);
  return Object.freeze({
    screenTop: Number(screen?.scrollTop) || 0,
    screenLeft: Number(screen?.scrollLeft) || 0,
    pageX: Number(windowRef?.scrollX) || 0,
    pageY: Number(windowRef?.scrollY) || 0,
  });
}

export function restoreScreenScroll(root, snapshot, windowRef = globalThis.window) {
  if (!snapshot) return false;
  const screen = currentScreen(root);
  if (screen) {
    screen.scrollTop = snapshot.screenTop;
    screen.scrollLeft = snapshot.screenLeft;
  }
  if (typeof windowRef?.scrollTo === "function") {
    windowRef.scrollTo(snapshot.pageX, snapshot.pageY);
  }
  return Boolean(screen);
}

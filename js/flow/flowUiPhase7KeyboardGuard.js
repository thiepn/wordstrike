const params = new URLSearchParams(globalThis.location?.search || "");
const enabled = params.get("dev") === "1"
  && params.get("mode") === "flow"
  && params.get("flowRun") === "1"
  && params.get("flowUi") === "1";

if (enabled) {
  globalThis.window?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) return;
    const phase7Control = focused.matches("[data-flow-choice-group], [data-flow-ui-action='setup']");
    if (!phase7Control) return;

    // Flow's legacy developer controller treats Enter on READY/COMPLETE as a
    // global start/restart shortcut. Dedicated Phase 7 controls must own Enter
    // while focused so keyboard users do not accidentally launch a run.
    event.preventDefault();
    event.stopImmediatePropagation();
    focused.click();
  }, true);
}

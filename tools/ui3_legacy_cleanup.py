from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    source = target.read_text()
    if new in source and old not in source:
        return
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"UI3 residual cleanup anchor mismatch in {path}: count={count}, anchor={old!r}")
    target.write_text(source.replace(old, new, 1))


replace_once(
    "style.css",
    "  .mode-panel,\n  .results-panel,\n  .settings-panel,\n  .endless-ready-panel,",
    "  .results-panel,\n  .settings-panel,\n  .endless-ready-panel,",
)
replace_once(
    "style.css",
    "  :is(\n    .mode-panel,\n    .results-panel,",
    "  :is(\n    .results-panel,",
)

# UI1's reduced-motion fallback still listed the retired Mode Select card selector.
# UI3 owns all Mode Select motion in its dedicated stylesheet, so only remove that membership.
replace_once(
    "styles/ui-system.css",
    "  .tutorial-help-button,\n  .mode-card,\n  .level-tile {",
    "  .tutorial-help-button,\n  .level-tile {",
)
replace_once(
    "styles/ui-system.css",
    "  .tutorial-help-button:hover,\n  .mode-card:hover,\n  .level-tile:hover {",
    "  .tutorial-help-button:hover,\n  .level-tile:hover {",
)

legacy = Path("style.css").read_text()
system = Path("styles/ui-system.css").read_text()
for forbidden in (".mode-panel {", ".mode-panel,", "    .mode-panel,", ".mode-panel h1", ".mode-panel ."):
    if forbidden in legacy:
        raise RuntimeError(f"Residual legacy Mode Select selector remains after cleanup: {forbidden}")
if ".mode-card" in system or ".mode-panel" in system:
    raise RuntimeError("Residual UI1 Mode Select compatibility selector remains after UI3 cleanup")

print("UI3 residual legacy and UI1 Mode Select ownership removed.")

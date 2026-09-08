from pathlib import Path

path = Path("style.css")
source = path.read_text()

replacements = [
    (
        "  .mode-panel,\n  .results-panel,\n  .settings-panel,\n  .endless-ready-panel,",
        "  .results-panel,\n  .settings-panel,\n  .endless-ready-panel,",
    ),
    (
        "  :is(\n    .mode-panel,\n    .results-panel,",
        "  :is(\n    .results-panel,",
    ),
]

for old, new in replacements:
    if new in source and old not in source:
        continue
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"UI3 residual Mode Select cleanup anchor mismatch: count={count}, anchor={old!r}")
    source = source.replace(old, new, 1)

for forbidden in (".mode-panel {", ".mode-panel,", "    .mode-panel,", ".mode-panel h1", ".mode-panel ."):
    if forbidden in source:
        raise RuntimeError(f"Residual legacy Mode Select selector remains after cleanup: {forbidden}")

path.write_text(source)
print("UI3 residual legacy Mode Select responsive ownership removed.")

from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
path = root / "tests/practice-ability-storage-migration.test.js"
text = subprocess.check_output([
    "git", "show", "origin/main:tests/practice-ability-storage-migration.test.js"
], cwd=root, text=True)
text = text.replace(
    'test("PL13 advances only the intended wrapper/storage versions", () => {\n  assert.equal(PRACTICE_DATABASE_VERSION, 3);',
    'test("PL13 ability contracts remain intact inside the PL14 storage/session/foundation envelope", () => {\n  assert.equal(PRACTICE_DATABASE_VERSION, 4);',
    1,
)
text = text.replace('  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 7);', '  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 8);', 1)
text = text.replace('  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 5);', '  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 6);', 1)
text = text.replace(
    'test("PL13 fresh DB v3 creates exactly all declared stores and indexes", () => {',
    'test("PL13 abilityStates remain structurally correct in the current fresh DB v4 schema", () => {',
    1,
)
text = text.replace(
    'test("PL13 sessionSummary v6 migrates sequentially to v7 with null ability summary and no historical ability backfill", () => {',
    'test("PL13 sessionSummary v6 ability migration remains null through the current PL14 v8 wrapper", () => {',
    1,
)
text = text.replace(
    '  assert.deepEqual(migration.steps, ["sessionSummary:6->7"]);\n  assert.equal(migration.value.recordVersion, 7);\n  assert.equal(migration.value.abilityMeasurementSummary, null);',
    '  assert.deepEqual(migration.steps, ["sessionSummary:6->7", "sessionSummary:7->8"]);\n  assert.equal(migration.value.recordVersion, 8);\n  assert.equal(migration.value.abilityMeasurementSummary, null);\n  assert.equal(migration.value.performanceMeasurementSummary, null);',
    1,
)
path.write_text(text)
Path(__file__).unlink()
print("PL13 storage/migration contracts advanced through PL14 wrappers")

from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
path = root / "tests/practice-ability-session-repository.test.js"
text = subprocess.check_output([
    "git", "show", "origin/main:tests/practice-ability-session-repository.test.js"
], cwd=root, text=True)
text = text.replace(
    'test("PL13 ordinary non-measurement session stays foundation v5/session v7 with no ability state", async () => {',
    'test("PL13 ordinary non-measurement session stays ability-isolated inside PL14 foundation v6/session v8 wrappers", async () => {',
    1,
)
text = text.replace('  assert.equal(foundationSeen.version, 5);', '  assert.equal(foundationSeen.version, 6);', 1)
text = text.replace(
    '  assert.equal(foundationSeen.ability.observation, null);\n  assert.equal(result.summary.recordVersion, 7);',
    '  assert.equal(foundationSeen.ability.observation, null);\n  assert.equal(foundationSeen.performance.status, "not-requested");\n  assert.equal(result.summary.recordVersion, 8);',
    1,
)
text = text.replace(
    '  assert.equal(result.summary.abilityMeasurementSummary, null);',
    '  assert.equal(result.summary.abilityMeasurementSummary, null);\n  assert.equal(result.summary.performanceMeasurementSummary, null);',
    1,
)
path.write_text(text)
Path(__file__).unlink()
print("PL13 session fixture restored with PL14 wrapper assertions only")

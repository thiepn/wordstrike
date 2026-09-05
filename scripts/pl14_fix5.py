from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
files = [
    "tests/practice-context-identity.test.js",
    "tests/practice-corpus-isolation.test.js",
    "tests/practice-error-foundation.test.js",
    "tests/practice-error-migration-validation.test.js",
    "tests/practice-error-session-integration.test.js",
    "tests/practice-foundation-contract.test.js",
    "tests/practice-latency-migration-validation.test.js",
    "tests/practice-latency-session-integration.test.js",
    "tests/practice-limiter-service-isolation.test.js",
    "tests/practice-normalization-migration-validation.test.js",
    "tests/practice-normalization-session-integration.test.js",
    "tests/practice-profile-migration.test.js",
    "tests/practice-schema-defaults.test.js",
    "tests/practice-skill-evidence-session-repository.test.js",
]

def main_text(path):
    return subprocess.check_output(["git", "show", f"origin/main:{path}"], cwd=root, text=True)

def apply_common(text):
    pairs = [
        ("assert.equal(PRACTICE_DATABASE_VERSION, 3);", "assert.equal(PRACTICE_DATABASE_VERSION, 4);"),
        ("assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 7);", "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 8);"),
        ("assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 5);", "assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 6);"),
        ("assert.equal(foundation.version, 5);", "assert.equal(foundation.version, 6);"),
        ("assert.equal(received.foundationAnalysis.version, 5);", "assert.equal(received.foundationAnalysis.version, 6);"),
        ("assert.equal(result.summary.recordVersion, 7);", "assert.equal(result.summary.recordVersion, 8);"),
        ("assert.equal(base.recordVersion, 7);", "assert.equal(base.recordVersion, 8);"),
        ("assert.equal(migrated.toVersion, 7);", "assert.equal(migrated.toVersion, 8);"),
        ("assert.equal(migration.toVersion, 7);", "assert.equal(migration.toVersion, 8);"),
        ("assert.equal(migrated.value.recordVersion, 7);", "assert.equal(migrated.value.recordVersion, 8);"),
        ("assert.equal(migration.value.recordVersion, 7);", "assert.equal(migration.value.recordVersion, 8);"),
        ('"sessionSummary:6->7"]', '"sessionSummary:6->7", "sessionSummary:7->8"]'),
        ('"sessionSummary:6->7",\n  ])', '"sessionSummary:6->7",\n    "sessionSummary:7->8",\n  ])'),
        ('"sessionSummary:6->7",\n  ]);', '"sessionSummary:6->7",\n    "sessionSummary:7->8",\n  ]);'),
    ]
    for old, new in pairs:
        text = text.replace(old, new)
    return text

for path in files:
    text = apply_common(main_text(path))
    if path.endswith("practice-foundation-contract.test.js"):
        text = text.replace("Phase 0 foundation constants remain intact inside the current PL13 storage envelope", "Phase 0 foundation constants remain intact inside the current PL14 storage envelope")
        text = text.replace("assert.equal(PRACTICE_STORE_NAMES.length, 11);", "assert.equal(PRACTICE_STORE_NAMES.length, 12);")
    if path.endswith("practice-corpus-isolation.test.js"):
        text = text.replace("Practice corpus architecture stays isolated while later PL13 advances IndexedDB to v3", "Practice corpus architecture stays isolated while later PL14 advances IndexedDB to v4")
    if path.endswith("practice-error-foundation.test.js"):
        text = text.replace("PL9 latency/error outputs remain intact inside PL13 foundation analysis v5", "PL9 latency/error outputs remain intact inside PL14 foundation analysis v6")
        text = text.replace("assert.equal(foundation.ability.observation, null);", "assert.equal(foundation.ability.observation, null);\n  assert.equal(foundation.performance.status, \"not-requested\");", 1)
    if path.endswith("practice-error-session-integration.test.js"):
        text = text.replace("PL9 live events remain intact while PL13 sessions persist canonical errorSummary", "PL9 live events remain intact while PL14 sessions persist canonical errorSummary")
        text = text.replace("PL9 experiment analyzers receive frozen errors inside PL13 foundation v5", "PL9 experiment analyzers receive frozen errors inside PL14 foundation v6")
    if path.endswith("practice-error-migration-validation.test.js"):
        text = text.replace("PL9 contracts remain intact while PL13 advances only the surrounding storage/session envelope", "PL9 contracts remain intact while PL14 advances only the surrounding storage/session envelope")
        text = text.replace("PL9 v3 error migration remains intact through PL10 v5, PL11 v6 and PL13 v7", "PL9 v3 error migration remains intact through PL10 v5, PL11 v6, PL13 v7 and PL14 v8")
        text = text.replace("PL9 preserves the full historical session migration chain through PL13", "PL9 preserves the full historical session migration chain through PL14")
    if path.endswith("practice-latency-migration-validation.test.js"):
        text = text.replace("PL8 sessionSummary v2 fluency migration proceeds sequentially through PL13 v7", "PL8 sessionSummary v2 fluency migration proceeds sequentially through PL14 v8")
        text = text.replace("v1 -> v2 -> v3 -> v4 -> v5 -> v6 -> v7 chain", "v1 -> v2 -> v3 -> v4 -> v5 -> v6 -> v7 -> v8 chain")
        text = text.replace("current v7 session summaries", "current v8 session summaries")
    if path.endswith("practice-profile-migration.test.js"):
        text = text.replace("  sessionSummary: 7,\n  abilityState: 1,", "  sessionSummary: 8,\n  abilityState: 1,\n  performanceState: 1,")
        text = text.replace("PL13-isolated versioning", "PL14-isolated versioning")
    if path.endswith("practice-schema-defaults.test.js"):
        text = text.replace('  "meta", "profiles", "contexts", "skillStats", "abilityStates", "sessionSummaries", "reviewItems",', '  "meta", "profiles", "contexts", "skillStats", "abilityStates", "performanceStates", "sessionSummaries", "reviewItems",')
        text = text.replace("DB3 schema descriptors passed", "DB4 schema descriptors passed")
    if path.endswith("practice-skill-evidence-session-repository.test.js"):
        text = text.replace("PL11 canonical deltas remain intact inside PL13 foundation v5/session v7", "PL11 canonical deltas remain intact inside PL14 foundation v6/session v8")
    if path.endswith("practice-normalization-migration-validation.test.js"):
        text = text.replace("current PL13 storage/session/foundation envelope", "current PL14 storage/session/foundation envelope")
        text = text.replace("current PL13 v7", "current PL14 v8")
        text = text.replace("v1 -> v7 migration chain", "v1 -> v8 migration chain")
    if path.endswith("practice-normalization-session-integration.test.js"):
        text = text.replace("current PL13 session envelope", "current PL14 session envelope")
        text = text.replace("PL13 foundationAnalysis v5", "PL14 foundationAnalysis v6")
    if path.endswith("practice-limiter-service-isolation.test.js"):
        text = text.replace("current PL13 storage/session/foundation envelope", "current PL14 storage/session/foundation envelope")
    if path.endswith("practice-latency-session-integration.test.js"):
        text = text.replace("current PL13 session envelope", "current PL14 session envelope")
    (root / path).write_text(text)

Path(__file__).unlink()
print(f"Advanced {len(files)} legacy Practice compatibility tests to the PL14 wrapper envelope")

import fs from "node:fs";

function replace(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing PL10 legacy test anchor: ${path}: ${before}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replace("tests/practice-context-identity.test.js", "PRACTICE_RECORD_VERSIONS.sessionSummary, 4", "PRACTICE_RECORD_VERSIONS.sessionSummary, 5");
replace("tests/practice-profile-migration.test.js", "  sessionSummary: 4,", "  sessionSummary: 5,");

replace("tests/practice-error-foundation.test.js", 'test("PL9 foundation analysis v2 contains frozen latency and generic errors"', 'test("PL9 latency/error outputs remain intact inside PL10 foundation analysis v3"');
replace("tests/practice-error-foundation.test.js", "PRACTICE_FOUNDATION_ANALYSIS_VERSION, 2", "PRACTICE_FOUNDATION_ANALYSIS_VERSION, 3");
replace("tests/practice-error-foundation.test.js", "foundation.version, 2", "foundation.version, 3");
replace("tests/practice-error-foundation.test.js", "foundation.version, 2", "foundation.version, 3");

replace("tests/practice-error-migration-validation.test.js", 'test("PL9 advances only sessionSummary to v4 while Practice DB and checkpoint remain unchanged"', 'test("PL9 contracts remain intact after PL10 advances only sessionSummary to v5"');
replace("tests/practice-error-migration-validation.test.js", "PRACTICE_RECORD_VERSIONS.sessionSummary, 4", "PRACTICE_RECORD_VERSIONS.sessionSummary, 5");
replace("tests/practice-error-migration-validation.test.js", 'test("PL9 sessionSummary v3 migrates sequentially to v4 with null historical error evidence"', 'test("PL9 v3 error migration remains intact through PL10 v5"');
replace("tests/practice-error-migration-validation.test.js", "migrated.toVersion, 4", "migrated.toVersion, 5");
replace("tests/practice-error-migration-validation.test.js", '["sessionSummary:3->4"]', '["sessionSummary:3->4", "sessionSummary:4->5"]');
replace("tests/practice-error-migration-validation.test.js", 'assert.equal(migrated.value.errorSummary, null);', 'assert.equal(migrated.value.errorSummary, null);\n  assert.equal(migrated.value.normalizationSummary, null);');
replace("tests/practice-error-migration-validation.test.js", '["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4"]', '["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4", "sessionSummary:4->5"]');
replace("tests/practice-error-migration-validation.test.js", 'assert.equal(migrated.value.errorSummary, null);\n});', 'assert.equal(migrated.value.errorSummary, null);\n  assert.equal(migrated.value.normalizationSummary, null);\n});');

replace("tests/practice-latency-migration-validation.test.js", "PL9 v4", "PL10 v5");
replace("tests/practice-latency-migration-validation.test.js", '["sessionSummary:2->3", "sessionSummary:3->4"]', '["sessionSummary:2->3", "sessionSummary:3->4", "sessionSummary:4->5"]');
replace("tests/practice-latency-migration-validation.test.js", "migrated.value.recordVersion, 4", "migrated.value.recordVersion, 5");
replace("tests/practice-latency-migration-validation.test.js", "v1 -> v2 -> v3 -> v4 chain", "v1 -> v2 -> v3 -> v4 -> v5 chain");
replace("tests/practice-latency-migration-validation.test.js", '["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4"]', '["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4", "sessionSummary:4->5"]');
replace("tests/practice-latency-migration-validation.test.js", "migrated.value.recordVersion, 4", "migrated.value.recordVersion, 5");
replace("tests/practice-latency-migration-validation.test.js", 'test("current v4 session summaries still accept null or valid compact PL8 fluency summaries"', 'test("current v5 session summaries still accept null or valid compact PL8 fluency summaries"');
replace("tests/practice-latency-migration-validation.test.js", "base.recordVersion, 4", "base.recordVersion, 5");

console.log("PL10 legacy current-version test assertions updated");

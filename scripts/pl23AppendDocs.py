from pathlib import Path

ADDENDA = {
    "docs/PRACTICE_LAB_ERROR_RECOVERY_MODEL.md": """
## PL23 — Accuracy & Recovery intervention consumer

PL23 `accuracy-control` is the first deliberate-practice intervention that directly consumes PL9's closed error/recovery facts. It does not create another error tracker and does not infer cognitive intent. Observable recovery behavior remains distinct from explanations such as carelessness, panic, noticing late, or loss of focus.

The shared Practice engine forwards a compact closed PL9 episode only after canonical PL11 primary error attribution. PL23 can emit one transient repair cue only when that episode is attributed to the selected target **and** its primary error position lies inside the immutable `Repair` phase. The cue is observational: `repair-clean` when no correct text was removed, `repair-extra-deletion` when correct text was also deleted, or `repair-complete` when repair completion is known but precision detail is unavailable. It never blocks input or displays live repair milliseconds.

PL23 recovery results aggregate selected-target episodes from Control, Repair, and Mix. No corrected target episode means recovery was **not observed**, not perfect. Counterfactual Recovery Debt remains intentionally absent.
""",
    "docs/PRACTICE_LAB_LEARNING_CURVES_AND_SATURATION.md": """
## PL23 — Accuracy & Recovery acquisition dose

PL23 remains an ordinary direct acquisition intervention for PL16. A completed standard session contributes exactly one direct acquisition dose for its one selected entity:

- key: 80 target opportunities;
- bigram: 50 target opportunities;
- trigram: 35 target opportunities;
- word: 15 target opportunities.

The stable treatment identity is `experimentId = accuracy-control`, `experimentVersion = 1`, `policyVersion = 1`, and `feedbackVersion = 1`. Incidental entities receive no direct PL23 acquisition dose.

For an object-bound trusted PL23 content plan, PL16 uses the immutable `Baseline` and `Check` phase ranges for entry/exit acquisition semantics. Serialized metadata alone cannot claim this privilege. Generic Practice sessions and the existing PL20–PL22 trusted interventions keep their established fallback or `entry-probe` / `exit-probe` semantics.

PL23 does not write learning state, learning rate, saturation, or causal treatment effects. PL16 remains the canonical owner of those longitudinal models.
""",
    "docs/PRACTICE_LAB_LIMITER_IMPACT_MODEL.md": """
## PL23 — Accuracy & Recovery candidate consumption

PL23 consumes existing PL12 limiter evidence only for target recommendation. The primary control dimensions are `inaccurate` and `recovery-heavy`. Confirmed/likely evidence is preferred; possible evidence is secondary. Mixed candidates are eligible only when an accuracy/recovery dimension is materially involved. Slow-only, hesitant-only, and unstable-only entities are not normally recommended for this treatment mechanism.

PL12 hierarchy remains authoritative. Higher-order targets strongly explained by lower-level likely/confirmed limiters are de-emphasized rather than declared independent or causal. PL15 Robust/Retained targets are normally excluded from recommendations, and PL16 likely/supported saturation further de-emphasizes candidates. Manual practice remains available after normal target/content feasibility checks, including the saturation warning that recent similar acquisition practice may have low marginal gain.

PL23 never writes limiter severity, impact, hierarchy, mastery, or saturation. Its selection score is transient and mode-specific.
""",
    "docs/PRACTICE_LAB_SESSION_ENGINE.md": """
## PL23 — Accuracy & Recovery session contract

PL23 executes one canonical Practice session with exactly one direct target (`key`, `bigram`, `trigram`, or `word`). The session role/purpose is `training`, correction behavior is `allow`, completion is content-based, and v1 is non-resumable with no active checkpoint.

The immutable five-phase protocol is `Baseline → Control → Repair → Mix → Check`. Baseline/Mix/Check are uncued; Control and Repair use subtle target cues. Live aggregate WPM/accuracy, PBs, leaderboard, metronome, rhythm coach, and live repair milliseconds remain off. The only PL23-specific live feedback is a brief target-attributed repair status after a real closed PL9 error episode in the Repair phase; it never pauses input.

PL23 requests no ability, performance-frontier, retention-review, protected-evaluation, or assessment measurement role. Its final Check is target-enriched training evidence, not transfer. The trusted plan binds target, context, corpus/index identity, exact entity dose, phase quotas, cue policy, and repair-feedback policy.
""",
}

changed = False
for filename, addition in ADDENDA.items():
    path = Path(filename)
    text = path.read_text()
    heading = addition.strip().splitlines()[0]
    if heading in text:
        continue
    path.write_text(text.rstrip() + "\n\n" + addition.strip() + "\n")
    changed = True

print("PL23 documentation addenda appended" if changed else "PL23 documentation addenda already present")

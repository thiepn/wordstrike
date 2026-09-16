# Practice Lab PL38 — Research / A-B Infrastructure

PL38 adds explicit, versioned, local randomized Practice studies. It does not replace PL32 Treatment Response: PL32 is observational; PL38 owns randomized assignment. Randomization improves treatment comparability but does not create perfect causal certainty because treatment abandonment, missing follow-ups, post-randomization exclusions, and outside-WordStrike practice remain possible.

## Local-only and consent

Research is opt-in. No study enrolls a user automatically and no hidden arm assignment occurs outside an enrolled study. Enrollment copy must explain that assignment is randomized, either eligible treatment may be assigned, benefit is not guaranteed, participation is optional, withdrawal is allowed, research records remain local, and ordinary Practice remains available. Study data, target identity, arm, seed, outcomes, and randomization statistics are not uploaded, sent to Supabase, or emitted to remote analytics.

## Version and storage envelope

PL38 migrates Practice DB 11 → 12. It adds `researchEnrollments`, `researchAssignments`, and `researchAnalysisStates`. `sessionSummary` moves 13 → 14 and adds nullable trusted `researchBinding`; historical summaries migrate with `researchBinding = null`. Foundation Analysis does not receive a Research field or version bump. PL38 record versions are 1. Research protocol/schema/enrollment/assignment/randomization/probe/contamination/analysis/result/consent versions are all 1.

## Static study registry

Study definitions are trusted code, not mutable IndexedDB records or remotely fetched configuration. Canonical definitions are deterministically serialized and SHA-256 hashed. Enrollment binds the hash. A changed hash without a study-version increment is a hard incompatibility.

The first study is `WS-AB-WEAKNESS-BOSS-1`, **Boss vs Focused Practice**. Its question is: “When the same type of measured weakness is eligible for both approaches, does delayed target performance differ after Weakness Boss versus the corresponding standard focused intervention?” It is a two-arm randomized study with a precommitted maximum of 24 assignments or 90 enrollment days, whichever occurs first.

Arm A, **Focused Practice**, maps `key → weak-keys`, `bigram → combination-repair`, `trigram → combination-repair`, and `word → problem-words`. Arm B is `weakness-boss`. Accuracy & Recovery is intentionally outside this study.

## Eligibility and target-before-arm doctrine

The research target is selected from current evidence before the treatment arm is derived. Arm identity is never an input to target candidate generation. Eligible targets are key, bigram, trigram, or word weaknesses that satisfy the intersection of Boss and standard-treatment readiness, remain likely/confirmed and independent/partial, have learning headroom, Boss target utility ≥35, available content, and the canonical PL25 focused mapping. Stable anchors, saturated/resolved-ineligible targets, Accuracy & Recovery defaults, due/overdue retention reviews, today’s Coach target, direct practice within 24 hours, and the same research target within 7 days are excluded. Targets unused in the study for 30 days are preferred.

## Randomization and no reroll

Enrollment creates one local >=128-bit seed using `crypto.getRandomValues`. `Math.random()` and user-ID-derived seeds are forbidden. The seed is persisted locally so assignment is reproducible and cannot reroll on refresh or a new tab.

Randomization is stratified by entity type. Each stratum uses permuted blocks of four with exactly 2 Focused and 2 Boss assignments. The six valid blocks are AABB, ABAB, ABBA, BAAB, BABA, and BBAA. Block choice is derived from seed + study ID/version + context + stratum + block index using SHA-256. Deterministic rejection sampling avoids modulo bias. Once persisted, an assigned arm never changes, including technical-invalid or declined assignments.

Assignment creation uses transactional uniqueness for enrollment sequence slots, one active assignment per enrollment, and one new randomized treatment assignment per profile/context/local day.

## Allocation concealment

The arm may be assigned before baseline but normal UI must conceal it until the common baseline completes validly. The target itself may be visible. This is described as “allocation concealed until baseline completion”; PL38 does not claim blinding or double blinding. A failed/insufficient baseline consumes the slot, does not reveal the arm in normal flow, and never rerolls.

## Common research probe

`research-target-probe` is a hidden trusted diagnostic protocol, not a catalog card. It uses diagnostic-partition material only and carries exactly one canonical target. Exact opportunities are key 12, bigram 8, trigram 6, word 4. It uses the existing target execution quality equation and requires quality coverage ≥0.60.

The probe is measurement exposure: no PL16 acquisition dose, no target `lastPractisedAt`, no retention-cycle start/reset, no PL13 ability channel, no PL14 performance measurement, no PL17 retention measurement, and no PL18 evaluation measurement. It is non-resumable, allows correction, uses content-complete completion, and suppresses live WPM, aggregate accuracy, target cues, metronome, and Boss UI.

Baseline and follow-up use the same exact target/quota, disjoint families, DifficultyIndex difference ≤0.30, and weighted feature RMS ≤0.60 where supported. Key probes additionally use position-profile TVD ≤0.20 and geometry TVD ≤0.30; word probes use launch-context TVD ≤0.30. Probe selection never consumes assigned arm.

## Treatment and PL32

After a valid baseline the arm is revealed. The user may run the assigned canonical intervention or decline. Decline records `abandoned / declined-after-reveal`; it does not create a replacement arm or another same-day randomized assignment.

Research launches the normal underlying protocol with trusted `research-plan` semantics; it does not change dose, phase quotas, cues, feedback, or content semantics. Focused Practice and Weakness Boss each retain one canonical PL16 dose. Trusted `PracticeResearchBinding` contains study/version, enrollment, assignment, arm, phase, and assignment hash. Normal session configuration cannot spoof it.

The randomized treatment session may emit a normal PL32 Treatment Episode with `assignmentKind = randomized` and its actual treatment family (`weak-keys`, `combination-repair`, `problem-words`, or `weakness-boss`). Baseline and follow-up probes do not create Treatment Episodes. PL32 observational response states remain separate from PL38’s precommitted randomized analysis. PL33 Coach Personalization does not consume PL38 evidence in v1.

## Follow-up and outcomes

After valid treatment completion, primary follow-up becomes eligible only after 24 hours and on a different local day, and expires after 72 hours. The app does not schedule a background timer or notification; readiness is derived when Research is opened. A late probe cannot substitute for the expired precommitted outcome.

Primary outcome is `ResearchQualityDelta = FollowupQuality - BaselineQuality`, measured in quality-points. Positive values mean higher delayed exact-target execution quality. Precommitted descriptive secondary outcomes are first-pass accuracy delta (percentage points), normalized residual delta (milliseconds), disfluency delta (percentage points), and word launch/internal residual deltas where available. Residual delta is Follow-up − Baseline, so negative means faster relative execution.

## Contamination and analysis eligibility

The contamination interval runs from assigned-treatment exposure end to follow-up start. Same-target direct practice, same-target retention review, another same-target research treatment, and relevant frozen lower-level overlap are material. Custom Text is uncertain without inspecting its private text. Unrelated targeted practice and broad real-text practice are background for v1. Outside-WordStrike practice is unobserved.

Primary randomized analysis requires a persisted randomized assignment, valid common baseline, completed assigned treatment, valid 24–72h follow-up, compatible versions, and contamination of none/background. Uncertain/material assignments remain visible but are excluded from the primary per-protocol effect. Every arm reports assigned, baseline valid, treatment started, treatment completed, follow-up completed, and analysis eligible.

Completion rate is analysis-eligible / assigned. With at least eight total assignments, an absolute arm difference ≥20 percentage points raises an attrition concern. The same 20pp rule applies to technical-invalid rates. Baseline balance reports mean/median quality; with ≥4 valid baselines per arm, an absolute mean difference ≥10 quality points raises a caution but does not invalidate randomization.

## Randomized analysis

Each eligible assignment contributes one outcome without response-confidence weighting. Arm summaries report count, mean, median, MAD, positive, negative, and deadband counts using the 5-quality-point practical threshold.

Primary effect is `Mean_B - Mean_A` (Boss minus Focused). Robust effect is `Median_B - Median_A`. Exact randomization inference uses only complete original four-assignment blocks. Each complete block has six valid 2A/2B reallocations, so B complete blocks yield `6^B` exact permutations, at most 46,656 for this v1 design. The two-sided p-value counts permutations with `|T_perm| >= |T_obs|`. No Monte Carlo correction is used. Fewer than two complete blocks yields no p-value.

Normal completed-study analysis is insufficient below 8 eligible outcomes total or 4 per arm. `randomized-signal` requires ≥12 eligible, ≥6 per arm, ≥2 complete blocks, absolute effect ≥5 points, exact randomization p≤0.10, and no attrition/technical-exclusion concern. `little-observed-difference` requires the same sample minimums, absolute effect <5, p>0.10, and no major attrition concern. Other sufficiently populated results are `inconclusive`. The 0.10 threshold is an exploratory local-study rule, not a universal significance standard. Secondary metrics and entity-type subgroups are descriptive only.

## Interim results, stopping, withdrawal, deletion

Normal users do not see interim arm-effect comparisons. Progress such as assignments created and current step is allowed. Developer diagnostics must be explicitly marked interim/not user-facing. No favorable-result optional stopping control exists.

Pause blocks new assignments but permits pending follow-up. Withdraw blocks future randomized assignments and labels the study incomplete. Deleting research records is separate from withdrawal: it removes the selected enrollment, assignments, analysis sidecar, associated research bindings where feasible, and randomized PL32 research sidecars/recomputed response state where supported. It does not erase the typing session, PL11 skill evidence, PL16 learning evidence, or ordinary session history because those events actually occurred. Normal Practice reset clears PL38 stores.

## Privacy, performance, and release boundary

PL38 persists only local study identifiers, canonical target IDs, arm, probe/outcome metrics, timestamps, contamination, and randomization metadata. It stores no probe text, wrong strings, raw key trace, Custom Text content, or PL36 physical telemetry. Study definitions are static. Pure modules perform no IndexedDB open, localStorage write, fetch, timer, or event-listener work at import.

Research remains an orchestration/sidecar layer. Child sessions commit their canonical Practice evidence first, then Research reconciles assignment state and recomputes bounded analysis. Reconciliation never reconstructs randomization from session order and never guesses a missing assignment record from a stray binding.

PL38 v1 is best described as a **randomized per-protocol local comparison**. It does not implement population A/B testing, cloud research, multi-user inference, multi-arm/factorial/adaptive designs, bandits, blinded treatment delivery, perfect intention-to-treat inference, missing-outcome imputation, effect confidence intervals, subgroup significance testing, automatic treatment optimization, randomized Daily Coach, public scientific claims, or public Practice release.

PL39 must deeply audit consent, immutability, randomization correctness, no-reroll persistence, deletion, session-binding privacy, no-network behavior, local-only claims, malformed records, storage integrity, and two-tab races. PL40 decides whether Research remains development/experimental even if the rest of Practice is releasable.

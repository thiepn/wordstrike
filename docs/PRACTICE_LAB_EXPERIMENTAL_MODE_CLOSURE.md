# Practice Lab — Experimental Mode Closure

Phase 6 closes the public experimental-mode question before final hardening.

## Release decisions

| Surface | Decision | Public release behavior |
| --- | --- | --- |
| Weakness Boss | Finish / graduate | Public Advanced challenge. Fixed-dose progress remains explicitly non-mastery and non-transfer. |
| Read-Ahead | Finish / graduate | Public Fluency practice protocol. Visible-preview manipulation is descriptive and never presented as eye tracking. |
| Metronome Typing | Finish / graduate | Public Fluency practice protocol. Fixed cadence cue is descriptive, not a one-key-per-beat target or causal claim. |
| Treatment Response | Keep / simplify | Retained as cautious **Observed Response** inside Progress, not presented as a separate effectiveness product. |
| Physical Keyboard | Keep / advanced opt-in | Local-only aggregate diagnostics, default off, no raw physical keystroke sequence persistence, not an experiment card. |
| Research A/B | Hide from normal release | Runtime/storage/tests remain for developer work, but the route and navigation are developer-only. |
| Retention / Review scheduling | Keep / core | Review Queue and Daily Coach review scheduling remain normal product behavior with strict delayed-verification eligibility. |
| Learning curves / saturation | Keep internal / simplify | Used to de-emphasize low-headroom targets; not promoted into a standalone score, badge, or claim that a skill is permanently fixed. |
| Adaptive recommendations | Keep bounded | Daily Coach remains deterministic/auditable: current need gates inclusion; treatment-response history may only make bounded adjustments among compatible methods. |

## Public maturity rule

The 17 public Practice experiment cards contain no experimental maturity status after Phase 6. A released drill may still have strong evidence-boundary copy; removing an Experimental badge does not widen its scientific claims.

Weakness Boss remains a fixed-dose Practice challenge. Boss HP is protocol progress. Read-Ahead remains visible-preview manipulation, not gaze measurement. Metronome remains a cadence cue with within-session descriptive comparison.

## Research boundary

Research A/B is intentionally not deleted. It has useful local randomized-assignment infrastructure and remains covered by its focused tests. However, consent, arm concealment, assignment lifecycle and delayed study follow-up add substantial cognitive and storage complexity that is not needed for ordinary Practice.

Normal public routing therefore maps Research to the Practice home. Developer mode may still open the Research route and its existing consent/study UI.

## Progress boundary

Treatment-response tracking remains passive longitudinal evidence. The user-facing surface is now Progress → Observed Response. Wording remains associative and non-causal. Same-session checks are not promoted into delayed-response evidence.

## Physical Keyboard boundary

Physical Keyboard telemetry remains discoverable only in eligible physical-keyboard contexts. Collection is opt-in and local. It remains separate from canonical skill evidence and is not registered as a training experiment.

## Freeze rule

Phase 6 does not add new experimental modes. Any future experimental system must remain developer-only until a later release decision explicitly graduates it.


## Internal adaptive-system closure

Retention scheduling is no longer treated as experimental infrastructure. It is a normal evidence workflow, but eligibility remains conservative: direct practice is not a retention verification, due reviews can become stale, and stale review content is blocked rather than silently weakened.

Learning-curve and saturation state remain internal decision inputs. They may lower the priority of repeated acquisition when observed headroom is small. They are not surfaced as a standalone “learning score,” and saturation does not mean permanent mastery.

Adaptive recommendation behavior remains deliberately narrow. Daily Coach does not invent protocols or optimize an opaque reward function. Need, hierarchy, mastery/headroom, readiness and protocol compatibility determine whether a target is actionable. Longitudinal response evidence can only adjust compatible treatment selection within the bounded personalization policy; it cannot make an otherwise non-actionable target enter the plan.

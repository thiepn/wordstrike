# A8 — Developer Platform Consumer Certification

**Consumer:** WORDSTRIKE  
**Account contract:** 1.0  
**SDK compatibility:** 1.x  
**Integration mode:** `certified-legacy`  
**Verdict:** **CONSUMER CONTRACT CERTIFIED**

A8 leaves the A6/A7 WORDSTRIKE identity and online-service runtime untouched. The consumer publishes the normalized developer manifest and is guarded by a dedicated compatibility workflow against the frozen Account SDK 1.x contract.

## Contract

- THIEPN Account remains the canonical identity/session authority;
- local campaign/typing/endless/arcade gameplay remains independent from account availability;
- backend/network failure does not become logout or erase local progress;
- online writes remain server-validated and score submission keeps the existing idempotency/rate-limit rules;
- A7 request correlation and redacted Edge Function logging remain required;
- future account behavior should be added through the central SDK contract before being duplicated in WORDSTRIKE.

## Certification evidence

- A8 consumer-contract workflow passes.
- Existing Node, browser, customization and release-certification suites pass.
- The A7 operational correlation contract remains present.
- No WORDSTRIKE gameplay/auth runtime code is changed by A8.

Merge remains gated on those workflows being green for the final A8 head. Runtime behavior remains the A7-certified release.

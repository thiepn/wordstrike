# A8 — Developer Platform Consumer Certification

**Consumer:** WORDSTRIKE  
**Account contract:** 1.0  
**SDK compatibility:** 1.x  
**Integration mode:** `certified-legacy`

A8 leaves the A6/A7 WORDSTRIKE identity and online-service runtime untouched. The consumer now publishes the normalized developer manifest and a dedicated compatibility check against the frozen Account SDK 1.x contract.

## Contract

- THIEPN Account remains the canonical identity/session authority;
- local campaign/typing/endless/arcade gameplay remains independent from account availability;
- backend/network failure does not become logout or erase local progress;
- online writes remain server-validated and score submission keeps the existing idempotency/rate-limit rules;
- A7 request correlation and redacted Edge Function logging remain required;
- future account behavior should be added through the central SDK contract before being duplicated in WORDSTRIKE.

## Status

**CERTIFICATION PENDING A8 CI.** Runtime behavior is unchanged from the A7-certified release.

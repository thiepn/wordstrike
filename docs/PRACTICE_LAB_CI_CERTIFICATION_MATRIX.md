# Practice Lab CI Certification Matrix

Practice Lab CI has one owner for each type of evidence. This prevents the same full suite and browser journeys from being rerun by historical phase workflows.

| Check surface | Current owner | Purpose |
| --- | --- | --- |
| Full WordStrike Node regression suite | `Tests` | One global `npm test` execution for every PR |
| Practice focused contracts | `Practice Certification Matrix / focused` | Fast, named subsystem failures without rerunning the full suite |
| Practice deterministic content | `Practice Certification Matrix / content` | Corpus, indexes, typability, sustained/special-domain forms, Common Words and Read-Ahead reproducibility |
| Privacy, storage and migrations | `Practice Certification Matrix / integrity` | Local-data boundaries, migrations and PL39 integrity |
| Chromium desktop/mobile journeys | `Practice Certification Matrix / browser` | Studio, Workshop, editor, all public drills, Assessment, advanced input, evidence, accessibility, offline and storage |
| Firefox/WebKit compatibility | `Practice Certification Matrix / compat` | Cross-browser UI, public sessions, Assessment and storage |
| Browser privacy/security | `Practice Certification Matrix / browser privacy` | XSS/network/URL/cache/privacy browser checks |
| Practice performance | `Practice Certification Matrix / performance` | Browser performance budget |
| Practice release verdict | `Practice Certification Matrix / release gate` | One final status that depends on every Practice matrix area |
| Non-Practice browser regression | `Non-Practice browser regressions` | Other WordStrike modes; deliberately outside Practice CI |
| Deployed GitHub Pages smoke | `Practice Production Smoke` | Main-only verification after deployment |

## Legacy workflows

Historical PL28–PL40 and older Practice Studio/Workshop/Playability/Completion/Storage/Assessment workflows remain in the repository as manual `workflow_dispatch` tools. They no longer run automatically on pull requests or main pushes.

This keeps historical diagnostic entry points available without creating duplicate required checks.

## Rules

1. Do not add `npm test` to a Practice-specific workflow. The global `Tests` workflow owns the complete Node suite.
2. New Practice browser coverage belongs in the appropriate matrix job rather than a new standalone PR workflow.
3. Main-only deployed-site checks belong in `Practice Production Smoke`.
4. A new subsystem may have a focused matrix entry when it improves failure localization, but it must not duplicate the full suite.
5. The `release gate` is the canonical Practice CI verdict for PRs and source-level main builds.

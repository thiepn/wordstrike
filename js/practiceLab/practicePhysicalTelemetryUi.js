import { PRACTICE_PHYSICAL_DIAGNOSTICS_VERSION } from "./practicePhysicalTelemetryConstants.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
const ms = (value) => Number.isFinite(value) ? `${Math.round(value)} ms` : "—";

function rows(items, kind) {
  if (!items?.length) return `<tr><td colspan="6">No ${kind} telemetry yet.</td></tr>`;
  return items.map((item) => {
    if (kind === "key") return `<tr><th scope="row">${esc(item.entityKey)}</th><td>${item.observation.activationCount ?? 0}</td><td>${pct(item.observedMisstrikeOriginRate)}</td><td>${ms(item.medianResidualMs)}</td><td>${pct(item.disfluencyRate)}</td><td>${esc(item.confidence)}</td></tr>`;
    if (kind === "transition") {
      const [from, to] = item.entityKey.split(">");
      return `<tr><th scope="row">${esc(from)}</th><td>${esc(to)}</td><td>${item.observation.timingEligibleCount ?? 0}</td><td>${ms(item.medianResidualMs)}</td><td>${pct(item.disfluencyRate)}</td><td>${esc(item.confidence)}</td></tr>`;
    }
    return `<tr><th scope="row">${esc(item.entityKey)}</th><td>${item.observation.opportunityCount ?? 0}</td><td>${item.observation.timingEligibleCount ?? 0}</td><td>${ms(item.medianResidualMs)}</td><td>${esc(item.confidence)}</td></tr>`;
  }).join("");
}

export function renderPracticePhysicalTelemetryPanel({ availability, snapshot, hasStoredData = false } = {}) {
  const enabled = availability?.enabled === true;
  const physical = availability?.contextEligible === true;
  const coverage = snapshot?.coverage ?? {};
  const empty = !hasStoredData && !coverage.eligibleSessions;
  const stateCopy = !enabled
    ? `<p>Off. WordStrike is not storing physical key-position telemetry.</p><button type="button" data-practice-physical-enable>Enable physical telemetry</button>`
    : empty
      ? `<p>Physical telemetry will appear after completed eligible Practice sessions.</p>`
      : "";
  return `<section class="practice-physical-telemetry" data-practice-physical-telemetry data-diagnostics-version="${PRACTICE_PHYSICAL_DIAGNOSTICS_VERSION}">
    <header><h2>Physical Keyboard</h2><p>Local aggregate telemetry from physical-keyboard Practice sessions.</p><span>Local only</span></header>
    <p>WordStrike saves aggregate physical key positions and transitions only. It does not save raw physical keystroke sequences, does not analyze Custom Text with this feature, and does not send these statistics to the cloud.</p>
    ${physical ? "" : `<p>Collection is unavailable for this ${esc(availability?.inputMethod ?? "unknown")} input context. Historical local data can still be viewed.</p>`}
    ${stateCopy}
    <dl aria-label="Physical keyboard telemetry coverage"><div><dt>Eligible sessions</dt><dd>${coverage.eligibleSessions ?? 0}</dd></div><div><dt>Physical key activations</dt><dd>${coverage.physicalKeyActivations ?? 0}</dd></div><div><dt>Physical codes observed</dt><dd>${coverage.physicalCodesObserved ?? 0}</dd></div><div><dt>Transitions observed</dt><dd>${coverage.transitionsObserved ?? 0}</dd></div><div><dt>Latest telemetry date</dt><dd>${esc(coverage.latestTelemetryDate ?? "—")}</dd></div></dl>
    <h3>Physical Codes</h3><table><thead><tr><th scope="col">Physical code</th><th scope="col">Events</th><th scope="col">Observed misstrike origins</th><th scope="col">Normalized timing</th><th scope="col">Disfluency</th><th scope="col">Evidence</th></tr></thead><tbody>${rows(snapshot?.keys, "key")}</tbody></table>
    <h3>Physical Transitions</h3><table><thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Timing samples</th><th scope="col">Median residual</th><th scope="col">Disfluency</th><th scope="col">Evidence</th></tr></thead><tbody>${rows(snapshot?.transitions, "transition")}</tbody></table>
    <h3>Modifier Patterns</h3><p>These are observed routes, not recommended techniques.</p><table><thead><tr><th scope="col">Route</th><th scope="col">Opportunities</th><th scope="col">Timing samples</th><th scope="col">Median residual</th><th scope="col">Evidence</th></tr></thead><tbody>${rows(snapshot?.modifierRoutes, "modifier")}</tbody></table>
    ${hasStoredData ? `<button type="button" data-practice-physical-clear>Clear physical keyboard telemetry</button>` : ""}
  </section>`;
}

export function renderPracticePhysicalTelemetrySetting({ enabled, hasStoredData = false } = {}) {
  return `<section data-practice-physical-setting><h3>Physical keyboard telemetry</h3><label><input type="checkbox" data-practice-physical-toggle ${enabled ? "checked" : ""}> Enable local physical-keyboard telemetry</label><p>${enabled ? "On for eligible physical-keyboard Practice contexts. Aggregate telemetry stays in this browser." : "Off. WordStrike is not storing physical key-position telemetry."}</p><p>WordStrike does not save raw physical keystroke sequences, does not analyze Custom Text with this feature, and does not send these statistics to the cloud.</p>${hasStoredData ? `<button type="button" data-practice-physical-clear>Clear physical keyboard telemetry</button>` : ""}</section>`;
}

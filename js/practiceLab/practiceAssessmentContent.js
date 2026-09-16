// Resolve composite diagnostics only from their governed, ordered source items.
export async function resolvePracticeAssessmentDiagnosticContent({ form, items, hashText = null } = {}) {
  const hash = hashText ?? (async text => 'sha256-' + Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join(''));
  const ids = form?.contentIds ?? (form?.contentId ? [form.contentId] : []);
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Invalid diagnostic segment identities');
  const byId = new Map(items.map(item => [item.contentId, item]));
  const segments = []; let offset = 0;
  for (const [index, id] of ids.entries()) {
    const item = byId.get(id);
    const expectedHash = form.segmentHashes?.[index] ?? form.contentHash;
    if (!item || item.partition !== 'diagnostic' || item.reviewStatus !== 'approved' || item.familyId !== form.familyId || item.sourceId !== form.sourceId || item.contentHash !== expectedHash || await hash(item.text) !== expectedHash) throw new Error('Diagnostic source binding mismatch');
    const count = [...item.text].length;
    if (form.segmentGraphemes && count !== form.segmentGraphemes[index]) throw new Error('Diagnostic segment length mismatch');
    segments.push({ contentId: id, startIndex: offset, endIndex: offset + count });
    offset += count + 1;
  }
  const text = ids.map(id => byId.get(id).text).join(' ');
  if ([...text].length !== form.graphemeCount || await hash(text) !== form.contentHash) throw new Error('Diagnostic composite binding mismatch');
  return Object.freeze({contentId: `practice-content_${form.formId}`, text, evidenceSegments: segments});
}

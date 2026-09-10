import { createPracticeLabController as createPracticeLabControllerV30 } from "./practiceLabControllerRuntimeV30.js";
import { renderPracticeLabV31, renderPracticeCustomTextDetail } from "./practiceLabRendererV31.js";
import { registerPracticeCustomTextExperiment } from "./practiceCustomTextExperiment.js";
import { PRACTICE_CUSTOM_TEXT_DEFAULT_TIMED_DURATION_MS, PRACTICE_CUSTOM_TEXT_ERROR_CODES, PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES, PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS } from "./practiceCustomTextConstants.js";
import { getPracticeCustomTextTimedAvailability } from "./practiceCustomTextAvailability.js";
import { buildPracticeCustomTypingProjection } from "./practiceCustomTextProjection.js";
import { inspectPracticeCustomTextSource } from "./practiceCustomTextValidation.js";
import { importPracticeCustomTextFile, exportPracticeCustomTextFile } from "./practiceCustomTextImportExport.js";
import { PRACTICE_LAB_ROUTES } from "./practiceLabRoutes.js";

const CUSTOM = "custom-text";
const emptyEditor = () => ({ customTextId: null, revision: null, sourceHash: null, title: "", sourceText: "", dataLocale: null, baselineTitle: "", baselineSourceText: "" });

export function createPracticeLabController(options = {}) {
  const { root, experimentRegistry, logger = null } = options;
  registerPracticeCustomTextExperiment(experimentRegistry);
  let state = {
    status: "idle", texts: [], contextDataLocale: null, editor: emptyEditor(), sessionMode: "full-text",
    timedDurationMs: PRACTICE_CUSTOM_TEXT_DEFAULT_TIMED_DURATION_MS, timedAvailability: [], sourceGraphemeCount: 0,
    validationErrorCode: PRACTICE_CUSTOM_TEXT_ERROR_CODES.EMPTY, localeMismatch: false, dirty: false,
    saving: false, starting: false, errorCode: null,
  };
  let host = null;
  let mounted = false;
  let lastView = null;
  let listeners = false;
  let deriveTimer = null;
  let loadEpoch = 0;
  let startEpoch = 0;
  const externalRenderer = typeof options.renderer === "function" ? options.renderer : null;
  const routeId = (base) => base.getSnapshot()?.route?.name === PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL ? base.getSnapshot()?.route?.params?.experimentId : null;
  const detailId = (view) => view?.kind === "experiment-detail" && view.title === "Custom Text" ? CUSTOM : null;
  const dirty = () => Boolean(state.editor.customTextId)
    ? state.editor.title !== state.editor.baselineTitle || state.editor.sourceText !== state.editor.baselineSourceText
    : Boolean(state.editor.title.trim() || state.editor.sourceText);
  const sourceDirty = () => Boolean(state.editor.customTextId) && state.editor.sourceText !== state.editor.baselineSourceText;
  const confirmDiscard = () => !dirty() || globalThis.confirm?.("Discard unsaved Custom Text changes?") !== false;

  function attach() {
    if (listeners || !mounted) return;
    root?.addEventListener?.("click", click, true);
    root?.addEventListener?.("input", input, true);
    root?.addEventListener?.("change", change, true);
    globalThis.addEventListener?.("beforeunload", beforeUnload);
    listeners = true;
  }
  function detach() {
    if (!listeners) return;
    root?.removeEventListener?.("click", click, true);
    root?.removeEventListener?.("input", input, true);
    root?.removeEventListener?.("change", change, true);
    globalThis.removeEventListener?.("beforeunload", beforeUnload);
    listeners = false;
  }
  function beforeUnload(event) { if (routeId(base) === CUSTOM && dirty() && !host) { event.preventDefault(); event.returnValue = ""; } }

  function renderer(renderRoot, view, rendererOptions = {}) {
    lastView = view;
    if (detailId(view)) {
      attach();
      const detail = { ...view, kind: "custom-text-detail", ...state, dirty: dirty() };
      if (externalRenderer) return externalRenderer(renderRoot, detail, rendererOptions);
      return renderPracticeCustomTextDetail(renderRoot, detail, rendererOptions);
    }
    detach();
    return externalRenderer ? externalRenderer(renderRoot, view, rendererOptions) : renderPracticeLabV31(renderRoot, view, rendererOptions);
  }

  const base = createPracticeLabControllerV30({ ...options, renderer });
  function rerender(focusSelector = null) { if (mounted && !host && routeId(base) === CUSTOM && lastView) renderer(root, lastView, { focusSelector }); }
  function setState(patch, focusSelector = null) { state = { ...state, ...patch, dirty: dirty() }; rerender(focusSelector); }

  function deriveEditor({ render = false } = {}) {
    let sourceGraphemeCount = 0;
    let validationErrorCode = null;
    let timedAvailability = [];
    try {
      const source = inspectPracticeCustomTextSource(state.editor.sourceText);
      sourceGraphemeCount = source.graphemeCount;
      const projection = buildPracticeCustomTypingProjection(source.sourceText);
      timedAvailability = getPracticeCustomTextTimedAvailability(projection.graphemeCount);
      if (!projection.text) validationErrorCode = PRACTICE_CUSTOM_TEXT_ERROR_CODES.EMPTY;
      else if (projection.graphemeCount < PRACTICE_CUSTOM_TEXT_MIN_GRAPHEMES) validationErrorCode = PRACTICE_CUSTOM_TEXT_ERROR_CODES.TOO_SHORT;
    } catch (error) { validationErrorCode = error?.code ?? PRACTICE_CUSTOM_TEXT_ERROR_CODES.TOO_LARGE; }
    state = { ...state, sourceGraphemeCount, timedAvailability, validationErrorCode, dirty: dirty() };
    if (render) rerender();
    else updateDerivedDom();
  }
  function scheduleDerive() { if (deriveTimer) clearTimeout(deriveTimer); deriveTimer = setTimeout(() => { deriveTimer = null; deriveEditor(); }, 120); }
  function updateDerivedDom() {
    if (routeId(base) !== CUSTOM || host) return;
    const count = root?.querySelector?.("[data-custom-text-count]"); if (count) count.textContent = `${state.sourceGraphemeCount} source graphemes · locale ${state.contextDataLocale ?? "—"}`;
    const dirtyNode = root?.querySelector?.("[data-custom-text-dirty]"); if (dirtyNode) dirtyNode.textContent = dirty() ? "Unsaved changes" : (state.editor.customTextId ? "Saved" : "Not saved");
    const error = root?.querySelector?.("[data-custom-text-error]"); if (error) error.textContent = state.errorCode ?? state.validationErrorCode ?? "";
    const save = root?.querySelector?.("[data-practice-action='custom-save']"); if (save) save.disabled = state.saving || !dirty() || Boolean(state.localeMismatch);
    const start = root?.querySelector?.("[data-practice-action='custom-start']"); if (start) start.disabled = state.starting || Boolean(state.localeMismatch) || Boolean(state.validationErrorCode);
    for (const button of root?.querySelectorAll?.("[data-practice-action='custom-duration']") ?? []) {
      const value = Number(button.dataset.durationMs); const available = state.timedAvailability.find((row) => row.durationMs === value)?.available === true; button.disabled = !available;
    }
  }

  async function load() {
    if (!mounted || routeId(base) !== CUSTOM) return;
    const epoch = ++loadEpoch;
    setState({ status: "loading", errorCode: null });
    try {
      const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
      const workspace = await runtime.getWorkspaceState();
      if (!mounted || epoch !== loadEpoch || routeId(base) !== CUSTOM) return;
      const editor = state.editor.dataLocale == null ? { ...state.editor, dataLocale: workspace.dataLocale } : state.editor;
      state = { ...state, status: "ready", texts: workspace.texts, contextDataLocale: workspace.dataLocale, editor, localeMismatch: Boolean(editor.customTextId && editor.dataLocale !== workspace.dataLocale), errorCode: null };
      deriveEditor({ render: true });
    } catch (error) {
      if (mounted && epoch === loadEpoch) setState({ status: "unavailable", errorCode: error?.code ?? "CUSTOM_TEXT_UNAVAILABLE" });
    }
  }

  async function openSaved(customTextId) {
    if (!confirmDiscard()) return false;
    try {
      const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
      const record = await runtime.getCustomText(customTextId);
      if (!record) throw Object.assign(new Error("Custom Text missing"), { code: PRACTICE_CUSTOM_TEXT_ERROR_CODES.NOT_FOUND });
      state = { ...state, editor: { customTextId: record.customTextId, revision: record.revision, sourceHash: record.sourceHash, title: record.title, sourceText: record.sourceText, dataLocale: record.dataLocale, baselineTitle: record.title, baselineSourceText: record.sourceText }, localeMismatch: record.dataLocale !== state.contextDataLocale, errorCode: null };
      deriveEditor({ render: true });
      return true;
    } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_LOAD_FAILED" }); return false; }
  }

  function newText() {
    if (!confirmDiscard()) return false;
    state = { ...state, editor: { ...emptyEditor(), dataLocale: state.contextDataLocale }, localeMismatch: false, errorCode: null };
    deriveEditor({ render: true });
    return true;
  }

  async function save() {
    if (state.saving || state.localeMismatch) return false;
    setState({ saving: true, errorCode: null });
    try {
      const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
      const record = state.editor.customTextId
        ? await runtime.updateCustomText({ customTextId: state.editor.customTextId, expectedRevision: state.editor.revision, title: state.editor.title, sourceText: state.editor.sourceText, dataLocale: state.editor.dataLocale ?? state.contextDataLocale })
        : await runtime.createCustomText({ title: state.editor.title, sourceText: state.editor.sourceText, dataLocale: state.contextDataLocale });
      state = { ...state, editor: { customTextId: record.customTextId, revision: record.revision, sourceHash: record.sourceHash, title: record.title, sourceText: record.sourceText, dataLocale: record.dataLocale, baselineTitle: record.title, baselineSourceText: record.sourceText }, localeMismatch: false, saving: false, errorCode: null };
      await load();
      return true;
    } catch (error) { setState({ saving: false, errorCode: error?.code ?? "CUSTOM_TEXT_SAVE_FAILED" }); return false; }
  }

  async function rebind() {
    if (!state.editor.customTextId || !state.localeMismatch) return false;
    try {
      const runtime = experimentRegistry.getRegistration(CUSTOM).runtime;
      const record = await runtime.rebindCustomTextLocale({ customTextId: state.editor.customTextId, expectedRevision: state.editor.revision });
      state = { ...state, editor: { ...state.editor, revision: record.revision, sourceHash: record.sourceHash, dataLocale: record.dataLocale, baselineTitle: record.title, baselineSourceText: record.sourceText, title: record.title, sourceText: record.sourceText }, localeMismatch: false, errorCode: null };
      await load(); return true;
    } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_REBIND_FAILED" }); return false; }
  }

  async function remove() {
    if (!state.editor.customTextId) return false;
    if (globalThis.confirm?.("Delete this saved Custom Text from this device?") === false) return false;
    try { await experimentRegistry.getRegistration(CUSTOM).runtime.deleteCustomText(state.editor.customTextId); state = { ...state, editor: { ...emptyEditor(), dataLocale: state.contextDataLocale }, localeMismatch: false, errorCode: null }; await load(); return true; }
    catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_DELETE_FAILED" }); return false; }
  }

  async function startCustom() {
    if (state.starting || state.localeMismatch) return false;
    const epoch = ++startEpoch;
    state = { ...state, starting: true, errorCode: null }; rerender();
    try {
      const registration = experimentRegistry.getRegistration(CUSTOM);
      const source = root?.querySelector?.("[data-custom-text-source]");
      const selectionRange = state.sessionMode === "selection" ? { start: source?.selectionStart ?? -1, end: source?.selectionEnd ?? -1 } : null;
      const savedIdentity = Boolean(state.editor.customTextId) && !sourceDirty();
      const prepared = await registration.setupFactory({
        sourceText: state.editor.sourceText,
        sourceKind: savedIdentity ? "saved" : "ephemeral",
        customTextId: savedIdentity ? state.editor.customTextId : null,
        revision: savedIdentity ? state.editor.revision : null,
        sourceHash: savedIdentity ? state.editor.sourceHash : null,
        sessionMode: state.sessionMode,
        timedDurationMs: state.sessionMode === "timed" ? state.timedDurationMs : null,
        selectionRange,
      });
      if (!mounted || epoch !== startEpoch) return false;
      const session = registration.sessionFactory(prepared);
      const module = await import("./practiceCustomTextSessionHost.js");
      detach();
      host = await module.mountPracticeCustomTextSession({
        root, session, runtime: registration.runtime, logger,
        onExit() { host = null; if (mounted) { state = { ...state, starting: false }; void load(); } },
        onPracticeAgain() { queueMicrotask(() => { if (mounted) void startCustom(); }); },
      });
      return true;
    } catch (error) {
      logger?.warn?.("PL31 Custom Text start failed", error);
      if (mounted && epoch === startEpoch) setState({ starting: false, errorCode: error?.code ?? "CUSTOM_TEXT_UNAVAILABLE" });
      return false;
    }
  }

  function input(event) {
    if (routeId(base) !== CUSTOM || host) return;
    if (event.target?.matches?.("[data-custom-text-title]")) { state = { ...state, editor: { ...state.editor, title: event.target.value }, dirty: true }; updateDerivedDom(); }
    else if (event.target?.matches?.("[data-custom-text-source]")) { state = { ...state, editor: { ...state.editor, sourceText: event.target.value }, dirty: true, errorCode: null }; scheduleDerive(); }
  }

  async function change(event) {
    const fileInput = event.target?.matches?.("[data-custom-text-file]") ? event.target : null;
    if (!fileInput || routeId(base) !== CUSTOM || host) return;
    const file = fileInput.files?.[0]; fileInput.value = ""; if (!file) return;
    if (!confirmDiscard()) return;
    try {
      const imported = await importPracticeCustomTextFile(file);
      state = { ...state, editor: { ...emptyEditor(), title: imported.suggestedTitle, sourceText: imported.sourceText, dataLocale: state.contextDataLocale }, localeMismatch: false, errorCode: null };
      deriveEditor({ render: true });
    } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_IMPORT_FAILED" }); }
  }

  function click(event) {
    const button = event.target?.closest?.("[data-practice-action]"); if (!button || !root?.contains?.(button) || routeId(base) !== CUSTOM || host) return;
    const action = button.dataset.practiceAction;
    if (!["back", "custom-new", "custom-open", "custom-save", "custom-delete", "custom-import", "custom-export", "custom-rebind", "custom-mode", "custom-duration", "custom-start"].includes(action)) return;
    event.stopPropagation();
    if (action === "back") { if (confirmDiscard()) { const value = base.back(); queueMicrotask(afterRoute); return value; } return; }
    if (action === "custom-new") { newText(); return; }
    if (action === "custom-open") { void openSaved(button.dataset.customTextId); return; }
    if (action === "custom-save") { void save(); return; }
    if (action === "custom-delete") { void remove(); return; }
    if (action === "custom-import") { root.querySelector?.("[data-custom-text-file]")?.click?.(); return; }
    if (action === "custom-export") { try { exportPracticeCustomTextFile({ sourceText: state.editor.sourceText, title: state.editor.title || "Untitled text" }); } catch (error) { setState({ errorCode: error?.code ?? "CUSTOM_TEXT_EXPORT_FAILED" }); } return; }
    if (action === "custom-rebind") { void rebind(); return; }
    if (action === "custom-mode") { const mode = button.dataset.customMode; if (["full-text", "selection", "timed"].includes(mode)) setState({ sessionMode: mode }, `[data-custom-mode='${mode}']`); return; }
    if (action === "custom-duration") { const value = Number(button.dataset.durationMs); if (PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS.includes(value) && state.timedAvailability.find((row) => row.durationMs === value)?.available) setState({ timedDurationMs: value }, `[data-duration-ms='${value}']`); return; }
    if (action === "custom-start") void startCustom();
  }

  const afterRoute = () => { if (routeId(base) === CUSTOM) void load(); else detach(); };
  return Object.freeze({
    mount(route) { mounted = true; const value = base.mount(route); queueMicrotask(afterRoute); return value; },
    navigate(...args) { if (routeId(base) === CUSTOM && !host && !confirmDiscard()) return false; const value = base.navigate(...args); queueMicrotask(afterRoute); return value; },
    back() { if (host) { void host.stop?.(); return true; } if (routeId(base) === CUSTOM && !confirmDiscard()) return false; const value = base.back(); queueMicrotask(afterRoute); return value; },
    getSnapshot() { const snapshot = base.getSnapshot(); return Object.freeze({ ...snapshot, customText: Object.freeze({ ...state, dirty: dirty(), sessionActive: Boolean(host) }) }); },
    subscribe(listener) { return base.subscribe(listener); },
    unmount() { mounted = false; loadEpoch += 1; startEpoch += 1; if (deriveTimer) clearTimeout(deriveTimer); detach(); if (host) { void host.exit(); host = null; } experimentRegistry.getRegistration(CUSTOM)?.runtime?.close?.(); return base.unmount(); },
  });
}

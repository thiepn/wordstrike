const freezeDeep = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep); Object.freeze(value);
  }
  return value;
};
// Exercise composition must not block navigation or keystrokes on the UI thread.
export function createPracticeTargetWorkerClient({ kind, options, withContext }) {
  let worker = null;
  let nextId = 0;
  const pending = new Map();
  const reset = (error) => {
    worker?.terminate(); worker = null;
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  };
  const call = async (method, args) => withContext(context => new Promise((resolve, reject) => {
    if (!worker) {
      try { worker = new Worker(new URL('./practiceTargetWorker.js', import.meta.url), { type: 'module' }); }
      catch (error) { reject(error); return; }
      worker.onmessage = ({ data }) => {
        const task = pending.get(data.id); if (!task) return;
        pending.delete(data.id);
        if (data.error) task.reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
        else task.resolve(freezeDeep(data.result));
      };
      worker.onerror = () => reset(new Error('Practice exercise preparation failed. Please try again.'));
      worker.onmessageerror = () => reset(new Error('Practice exercise preparation returned invalid data.'));
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try { worker.postMessage({ id, kind, options, method, args, context }); }
    catch (error) { pending.delete(id); reject(error); }
  }));
  return Object.freeze({
    inspectTarget: args => call('inspectTarget', args),
    prepare: args => call('prepare', args),
    getDiagnostics: () => call('getDiagnostics'),
    clear: () => reset(new Error('Practice preparation cancelled.')),
  });
}

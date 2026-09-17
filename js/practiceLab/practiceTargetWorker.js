const modules = {
  WeakKeys: './practiceWeakKeysRuntime.js',
  ProblemWords: './practiceProblemWordsRuntime.js',
  AccuracyRecovery: './practiceAccuracyRecoveryRuntime.js',
};
const assetRoot = new URL('../../data/practice/', import.meta.url);
function fetchAsset(path) {
  const url = new URL(path, new URL('../../', import.meta.url));
  if (url.origin !== assetRoot.origin || url.protocol !== assetRoot.protocol || !url.pathname.startsWith(assetRoot.pathname) || url.search || url.hash) throw new TypeError('Practice worker only loads static corpus assets');
  return fetch(url);
}
let runtime = null;
let context = null;
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  // Serial execution keeps each request bound to its own profile context.
  queue = queue.then(async () => {
    try {
      if (!modules[data.kind] || !['inspectTarget', 'prepare', 'getDiagnostics'].includes(data.method)) throw new Error('Invalid Practice preparation request');
      context = data.context;
      if (!runtime) {
        const module = await import(modules[data.kind]);
        runtime = module[`createPractice${data.kind}Runtime`]({ ...data.options,
          contextProvider: async () => context,
          fetchImpl: fetchAsset,
        });
      }
      self.postMessage({ id: data.id, result: await runtime[data.method](data.args) });
    } catch (error) {
      self.postMessage({ id: data.id, error: { message: error.message, code: error.code } });
    }
  });
};

const modules = {
  WeakKeys: './practiceWeakKeysRuntime.js',
  ProblemWords: './practiceProblemWordsRuntime.js',
  AccuracyRecovery: './practiceAccuracyRecoveryRuntime.js',
};
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
          fetchImpl: path => fetch(new URL(path, new URL('../../', import.meta.url))),
        });
      }
      self.postMessage({ id: data.id, result: await runtime[data.method](data.args) });
    } catch (error) {
      self.postMessage({ id: data.id, error: { message: error.message, code: error.code } });
    }
  });
};

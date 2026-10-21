// Scripts run src modules outside Next, where the `server-only` guard has no
// package to resolve (Next ships its own). Preloaded with `tsx --require`, it
// becomes an empty module — the scripts are server code by definition.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a --require preload is CommonJS
const Module = require("node:module");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "server-only" ? __filename : resolve.call(this, request, ...rest);
};

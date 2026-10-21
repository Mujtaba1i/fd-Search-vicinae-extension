const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/fd-search.tsx"), "utf8");
const ast = ts.createSourceFile("fd-search.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parts = [];
for (const node of ast.statements) {
  if (!ts.isFunctionDeclaration(node)) continue;
  if (node.name?.text === "Command") {
    for (const inner of node.body.statements) {
      if (ts.isFunctionDeclaration(inner) && ["loadCachedIndex", "runSearch"].includes(inner.name?.text)) {
        parts.push(inner.getText(ast));
      }
    }
  } else {
    if (["readSearchCache", "writeSearchCache"].includes(node.name?.text)) continue;
    parts.push(node.getText(ast));
  }
}
const javascript = ts.transpileModule(parts.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness({ failLoad = false, savedCache = null } = {}) {
  let finish;
  const ready = new Promise((resolve) => { finish = resolve; });
  const refs = {};
  for (const name of ["cachedIndexRef", "cachedIndexFingerprintRef", "cachedIndexPromiseRef", "currentSearchAbort", "indexFingerprintRef"]) {
    refs[name] = { current: null };
  }
  refs.searchGenerationRef = { current: 0 };
  refs.latestQueryRef = { current: "Practical 6" };
  refs.latestFilterTypeRef = { current: "all" };
  const updates = [];
  const failures = [];
  const selections = [];
  const queries = [];
  const stream = { destroyed: false, destroy() { this.destroyed = true; } };
  const dependencies = {
    ...refs, path, fs: { existsSync: () => true, statSync: () => ({ mtimeMs: 1 }) },
    ACTIVE_INDEX_FILE: "/index", CACHE_LOAD_YIELD_EVERY: 2000,
    SEARCH_CHUNK_SIZE: 1500, PARTIAL_RESULT_UPDATE_INTERVAL_MS: 32,
    maxResults: 25, filterType: "all", AbortController, setImmediate,
    readSearchCache: async () => savedCache, writeSearchCache: async () => {},
    setResultQuery: (query) => queries.push(query),
    setSelectedItemPath: (selected) => selections.push(selected),
    createReadStream: () => stream,
    readline: { createInterface: () => ({
      close() {},
      async *[Symbol.asyncIterator]() {
        if (failLoad) throw new Error("Index read failed");
        yield "/home/Practical6.zip\t0\t10\t1000\t.zip";
        await ready;
        yield "/media/Practical 6\t1\t0\t1000\t";
      },
    }) },
    setResults: (results) => updates.push(results),
    setHasIndex() {}, setLoading() {},
    showToast: (toast) => failures.push(toast), Toast: { Style: { Failure: "failure" } },
  };
  const api = new Function(...Object.keys(dependencies), `${javascript}\nreturn { loadCachedIndex, runSearch };`)(...Object.values(dependencies));
  return { ...api, refs, updates, failures, selections, queries, finish, source: { path: "/index", mtimeMs: 1 } };
}

test("cold launch waits for the full cache before publishing results", async () => {
  const h = harness();
  const loading = h.loadCachedIndex(h.source);
  await new Promise(setImmediate);
  const searching = h.runSearch("Practical 6");
  await new Promise(setImmediate);
  const earlyUpdates = h.updates.length;
  h.finish();
  await loading;
  await searching;
  await new Promise(setImmediate);
  assert.equal(earlyUpdates, 0, "An incomplete cache must not select an early match");
  assert.equal(h.updates.at(-1)[0].path, "/media/Practical 6");
  assert.equal(h.failures.length, 0);
  assert.equal(h.updates.length, 1);
  assert.equal(h.selections.at(-1), "/media/Practical 6");
  assert.equal(h.queries.at(-1), JSON.stringify(["Practical 6", "all"]));
});

test("concurrent cache readers wait for the same complete snapshot", async () => {
  const h = harness();
  const first = h.loadCachedIndex(h.source);
  await new Promise(setImmediate);
  let finished = false;
  const second = h.loadCachedIndex(h.source).then((data) => { finished = true; return data; });
  await new Promise(setImmediate);
  const finishedEarly = finished;
  h.finish();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(finishedEarly, false);
  assert.equal(left, right);
  assert.equal(right.entries.length, 2);
});

test("a newer query cancels an earlier query waiting for cache loading", async () => {
  const h = harness();
  const first = h.runSearch("Practical 6");
  await new Promise(setImmediate);
  h.refs.latestQueryRef.current = "no matching filename";
  const second = h.runSearch(h.refs.latestQueryRef.current);
  h.finish();
  await Promise.all([first, second]);
  await new Promise(setImmediate);
  assert.ok(h.updates.every((results) => results.length === 0));
});

test("cache read failures report an error and allow retrying", async () => {
  const h = harness({ failLoad: true });
  await h.runSearch("Practical 6");
  assert.equal(h.failures[0].title, "Failed to load search index");
  assert.equal(h.refs.cachedIndexRef.current, null);
  assert.equal(h.refs.cachedIndexPromiseRef.current, null);
});

test("saved caches skip rebuilding and release the pending load", async () => {
  const savedCache = { entries: [], prefixIndex: new Map() };
  const h = harness({ savedCache, failLoad: true });
  assert.equal(await h.loadCachedIndex(h.source), savedCache);
  assert.equal(h.refs.cachedIndexPromiseRef.current, null);
  assert.equal(h.refs.cachedIndexRef.current, savedCache);
});

test("a new search selects its best result instead of keeping the old selection", async () => {
  const h = harness();
  h.finish();
  await h.runSearch("Practical6.zip");
  assert.equal(h.selections.at(-1), "/home/Practical6.zip");
  await h.runSearch("Practical 6");
  assert.equal(h.selections.at(-1), "/media/Practical 6");
  assert.notEqual(h.queries[0], h.queries[1]);
});

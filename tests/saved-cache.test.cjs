const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { serialize, deserialize } = require("node:v8");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/fd-search.tsx"), "utf8");
const ast = ts.createSourceFile("fd-search.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) &&
  ["readSearchCache", "writeSearchCache", "getIndexFingerprint"].includes(node.name?.text));
const javascript = ts.transpileModule(functions.map((node) => node.getText(ast)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

function cacheHarness(saved) {
  const files = new Map();
  if (saved) files.set("/cache", saved);
  const api = new Function("fs", "serialize", "deserialize", "process", "SEARCH_CACHE_FILE", "SEARCH_CACHE_VERSION",
    `${javascript}\nreturn { readSearchCache, writeSearchCache };`)(
    { promises: {
      readFile: async (file) => { if (!files.has(file)) throw new Error("ENOENT"); return files.get(file); },
      stat: async () => ({ size: 100 }),
      writeFile: async (file, data) => files.set(file, data),
      rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
      unlink: async (file) => files.delete(file),
    } }, serialize, deserialize, { pid: 1 }, "/cache", 1,
  );
  return { ...api, files };
}

test("saved cache round trip preserves entries and prefix map", async () => {
  const h = cacheHarness();
  const index = { path: "/index", mtimeMs: 1 };
  const data = { entries: [{ path: "/docs/report" }], prefixIndex: new Map([["rep", [0]]]) };
  await h.writeSearchCache(index, data);
  assert.deepEqual(await h.readSearchCache(index), data);
  assert.deepEqual([...h.files.keys()], ["/cache"]);
  assert.equal(await h.readSearchCache({ ...index, mtimeMs: 2 }), null);
});

test("missing, corrupt, old and mismatched caches fall back to rebuilding", async () => {
  const data = { entries: [], prefixIndex: new Map() };
  for (const saved of [undefined, Buffer.from("broken"),
    serialize({ version: 0, fingerprint: "/index:1", size: 100, data }),
    serialize({ version: 1, fingerprint: "/index:1", size: 99, data }),
  ]) {
    assert.equal(await cacheHarness(saved).readSearchCache({ path: "/index", mtimeMs: 1 }), null);
  }
});

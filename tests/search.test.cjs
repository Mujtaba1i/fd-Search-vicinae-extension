const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

// Load the search helpers without starting the Vicinae command.
const source = fs.readFileSync(path.join(__dirname, "../src/fd-search.tsx"), "utf8");
const ast = ts.createSourceFile("fd-search.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text !== "Command");
const javascript = ts.transpileModule(helpers.map((node) => node.getText(ast)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const search = new Function("path", `${javascript}\nreturn {
  createCachedIndexEntry, prepareSearchQuery, getCachedMatchScore,
  parseSearchQuery, getEditDistanceWithinLimit
};`)(path);

function entry(filePath) {
  return search.createCachedIndexEntry({
    path: filePath, isDirectory: false, size: 100, mtimeMs: 1000,
    extension: path.extname(filePath),
  });
}

test("exact names rank ahead of prefixes, substrings and path matches", () => {
  const query = search.prepareSearchQuery("report");
  const scores = ["/docs/report", "/docs/reports", "/docs/old-report", "/report/notes"]
    .map((name) => search.getCachedMatchScore(query, entry(name)));
  assert.deepEqual(scores, [2000, 1800, 1600, 1200]);
});

test("normalization, Unicode and missing word matching keep their scores", () => {
  for (const [query, filePath, expected] of [
    ["annual report", "/docs/annual-report", 2000],
    ["文書", "/media/USB Drive/文書.txt", 1800],
    ["annual missing report", "/docs/annual-report", 1320],
    ["rpt", "/docs/report", 703],
    ["repxrt", "/docs/report", 800],
  ]) {
    assert.equal(search.getCachedMatchScore(search.prepareSearchQuery(query), entry(filePath)), expected);
  }
});

test("repeated path tokens reuse typo distances within one query", () => {
  const query = search.prepareSearchQuery("repxrt");
  search.getCachedMatchScore(query, entry("/docs/report"));
  const distances = [...query.tokenDistances];
  assert.equal(query.tokenDistances.get("report"), 1);
  search.getCachedMatchScore(query, entry("/docs/report"));
  assert.deepEqual([...query.tokenDistances], distances);
  assert.equal(search.prepareSearchQuery("other").tokenDistances.size, 0);
});

test("filters and wildcard queries retain their parsed values", () => {
  const query = search.parseSearchQuery("/media *.pdf type:pdf -cache since:1h size:>10mb");
  assert.equal(query.pathScope, "/media");
  assert.equal(query.typeFilter, "pdf");
  assert.deepEqual(query.excludeTerms, ["cache"]);
  assert.equal(query.sinceMs, 3600000);
  assert.equal(query.minSizeBytes, 10 * 1024 * 1024);
  assert.equal(query.maxSizeBytes, null);
  assert.ok(query.wildcardPattern.test("/media/a.pdf"));
});

test("local search input is not throttled", () => {
  let throttle;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "throttle") throttle = node.initializer?.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(throttle, "{false}");
});

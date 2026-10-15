import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = "index.ts";
const layers = {
  domain: new Set(["domain"]),
  history: new Set(["domain", "history"]),
  storage: new Set(["domain", "storage"]),
  agents: new Set(["domain", "history", "storage", "agents"]),
  ui: new Set(["domain", "ui"]),
  application: new Set(["domain", "history", "storage", "agents", "ui", "application"]),
};
async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const lists = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(dir, entry.name))
        : /\.(ts|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")
          ? [relative(root, join(dir, entry.name))]
          : [],
    ),
  );
  return lists.flat();
}
// Recognize the import forms used here, including the URL passed to spawn and jiti's worker import.
// A new loading convention must be added here rather than marking an orphan as an entry point.
function dependencies(text) {
  const patterns = [
    /^\s*(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["'](\.[^"']+)["']/gm,
    /\b(?:import|jiti\.import)\(\s*["'](\.[^"']+)["']/g,
    /new URL\(\s*["'](\.[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1]));
}
const files = new Set([entry, ...(await sourceFiles(join(root, "src")))]);
const texts = new Map(
  await Promise.all(
    [...files].map(async (path) => [path, await readFile(join(root, path), "utf8")]),
  ),
);
const graph = new Map();
const errors = [];
for (const [path, text] of texts) {
  const edges = dependencies(text).map((specifier) =>
    relative(root, resolve(root, dirname(path), specifier)),
  );
  graph.set(path, edges);
  for (const target of edges) {
    if (!files.has(target)) {
      errors.push(`${path}: missing source ${target}`);
      continue;
    }
    const fromLayer = path.split("/")[1],
      toLayer = target.split("/")[1];
    if (layers[fromLayer] && !layers[fromLayer].has(toLayer))
      errors.push(`${path}: ${fromLayer} must not depend on ${target}`);
  }
}
const reached = new Set();
function visit(path) {
  if (reached.has(path)) return;
  reached.add(path);
  for (const target of graph.get(path) || []) visit(target);
}
visit(entry);
for (const path of files) if (!reached.has(path)) errors.push(`No production consumer: ${path}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Structure verified: ${files.size} runtime/type source modules reachable from ${entry}; layer boundaries respected.`,
  );

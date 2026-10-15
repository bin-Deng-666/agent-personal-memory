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
async function sourceFiles(directory) {
  const children = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      children.map((child) =>
        child.isDirectory()
          ? sourceFiles(join(directory, child.name))
          : /\.(?:ts|mjs)$/.test(child.name) && !child.name.endsWith(".d.ts")
            ? [relative(root, join(directory, child.name))]
            : [],
      ),
    )
  ).flat();
}
const files = new Set([entry, ...(await sourceFiles(join(root, "src")))]),
  graph = new Map(),
  errors = [];
for (const path of files) {
  const text = await readFile(join(root, path), "utf8");
  const patterns = [
    /^\s*(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["'](\.[^"']+)["']/gm,
    /\b(?:import|jiti\.import)\(\s*["'](\.[^"']+)["']/g,
    /new URL\(\s*["'](\.[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
  ];
  const edges = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) =>
      relative(root, resolve(root, dirname(path), match[1])),
    ),
  );
  graph.set(path, edges);
  for (const target of edges) {
    if (!files.has(target)) {
      errors.push(`${path}: missing source ${target}`);
      continue;
    }
    const from = path.split("/")[1],
      to = target.split("/")[1];
    if (layers[from] && !layers[from].has(to))
      errors.push(`${path}: ${from} must not depend on ${target}`);
  }
}
const reached = new Set();
function visit(path) {
  if (reached.has(path)) return;
  reached.add(path);
  for (const edge of graph.get(path) || []) visit(edge);
}
visit(entry);
for (const path of files) if (!reached.has(path)) errors.push(`No production consumer: ${path}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Structure verified: ${files.size} source modules reachable from ${entry}; layer boundaries respected.`,
  );

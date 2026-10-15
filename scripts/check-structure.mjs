import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const entries = ["packages/pi/src/extension.ts", "packages/claude-code/src/main.ts"];
async function files(directory) {
  const children = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      children.map((child) =>
        child.isDirectory()
          ? files(join(directory, child.name))
          : /\.(?:ts|mjs)$/.test(child.name) && !child.name.endsWith(".d.ts")
            ? [relative(root, join(directory, child.name))]
            : [],
      ),
    )
  ).flat();
}
const paths = new Set(
  (
    await Promise.all(
      ["core", "pi", "claude-code"].map((name) => files(join(root, "packages", name, "src"))),
    )
  ).flat(),
);
const graph = new Map(),
  errors = [];
for (const path of paths) {
  const text = await readFile(join(root, path), "utf8");
  const patterns = [
    /^\s*(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["'](\.[^"']+)["']/gm,
    /\b(?:import|jiti\.import)\(\s*["'](\.[^"']+)["']/g,
    /new URL\(\s*["'](\.[^"']+)\.(?:ts|mjs)["']\s*,\s*import\.meta\.url\s*\)/g,
  ];
  const edges = [...text.matchAll(patterns[0]), ...text.matchAll(patterns[1])].map(
    (match) => match[1],
  );
  // The Pi launcher/runner are actual production consumers, not artificial graph roots.
  if (path.endsWith("/agents/tasks.ts")) edges.push("./runner.mjs");
  const targets = edges.map((edge) => relative(root, resolve(root, dirname(path), edge)));
  graph.set(path, targets);
  for (const target of targets) {
    if (!paths.has(target)) {
      errors.push(`${path}: missing ${target}`);
      continue;
    }
    const sourcePackage = path.split("/")[1],
      targetPackage = target.split("/")[1];
    if (sourcePackage === "core" && targetPackage !== "core")
      errors.push(`${path}: core depends on a host`);
    if (sourcePackage !== "core" && targetPackage !== "core" && targetPackage !== sourcePackage)
      errors.push(`${path}: hosts must not depend on one another`);
  }
  if (path.startsWith("packages/core/") && /@earendil-works|@modelcontextprotocol/.test(text))
    errors.push(`${path}: core imports a host runtime`);
}
const reached = new Set();
function visit(path) {
  if (reached.has(path)) return;
  reached.add(path);
  for (const edge of graph.get(path) || []) visit(edge);
}
entries.forEach(visit);
for (const path of paths) if (!reached.has(path)) errors.push(`No production consumer: ${path}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Structure verified: ${paths.size} source modules; common core and separate Pi/Claude host boundaries.`,
  );

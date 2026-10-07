/**
 * Resolve the AgentInspect version actually loaded by this kit vs package.json pin.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(__dirname, "..");

/**
 * @param {{ kitRoot?: string, requireResolve?: (id: string) => string }} [opts]
 */
export function resolveAgentInspectVersion(opts = {}) {
  const kitRoot = opts.kitRoot ?? KIT_ROOT;
  /** @type {{ configured: string|null, resolved: string|null, resolvedPath: string|null, ok: boolean, failures: string[] }} */
  const out = {
    configured: null,
    resolved: null,
    resolvedPath: null,
    ok: true,
    failures: [],
  };

  try {
    const kitPkg = JSON.parse(
      readFileSync(path.join(kitRoot, "package.json"), "utf8"),
    );
    const pin = kitPkg?.dependencies?.["agent-inspect"];
    out.configured = typeof pin === "string" ? pin : null;
    if (out.configured === null) {
      out.ok = false;
      out.failures.push("kit package.json missing dependencies.agent-inspect");
    }
  } catch (error) {
    out.ok = false;
    out.failures.push(
      `unreadable kit package.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const require =
      typeof opts.requireResolve === "function"
        ? { resolve: opts.requireResolve }
        : createRequire(path.join(kitRoot, "verify.mjs"));
    const pkgPath = require.resolve("agent-inspect/package.json");
    const resolvedPkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    out.resolved = typeof resolvedPkg.version === "string" ? resolvedPkg.version : null;
    out.resolvedPath = pkgPath;
    if (out.resolved === null) {
      out.ok = false;
      out.failures.push("resolved agent-inspect package.json missing version");
    }
  } catch (error) {
    out.ok = false;
    out.failures.push(
      `failed to resolve installed agent-inspect: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    out.ok &&
    out.configured &&
    out.resolved &&
    out.configured !== out.resolved &&
    !out.configured.startsWith("^") &&
    !out.configured.startsWith("~") &&
    !out.configured.includes("||")
  ) {
    // Exact pin mismatch — still report both; mark non-passing for honesty.
    out.ok = false;
    out.failures.push(
      `configured pin ${out.configured} != resolved ${out.resolved}`,
    );
  }

  return out;
}

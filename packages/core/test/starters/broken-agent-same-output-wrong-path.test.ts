import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const starterDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../examples/starters/broken-agent-debugging",
);

describe("broken-agent-debugging same-output wrong-path", () => {
  it("proves equal final answers with divergent TraceContract results", () => {
    const script = path.join(starterDir, "prove-same-output-wrong-path.mjs");
    // Run twice: control traces use fixed run ids and must not append (#523).
    for (const pass of [1, 2] as const) {
      const result = spawnSync(process.execPath, [script], {
        cwd: starterDir,
        encoding: "utf8",
      });
      expect(result.status, `pass ${pass}: ${result.stderr || result.stdout}`).toBe(0);
      expect(result.stdout).toContain("Final output equal: yes");
      expect(result.stdout).toContain("demo-good: PASS");
      expect(result.stdout).toContain("demo-regression: FAIL");
    }
  });
});

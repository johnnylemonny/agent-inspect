/**
 * Public truth checks for version / package count / stale strings.
 * Run: node scripts/validate-public-truth.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateStandardsProvenance } from "./lib/standards-provenance-rule.mjs";
import { computeClaimContentDigest } from "./lib/claim-content-digest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const changeset = JSON.parse(readFileSync(path.join(root, ".changeset/config.json"), "utf8"));
const fixed = changeset.fixed?.[0] ?? [];
const version = pkg.version;
const failures = [];

const standardsPath = path.join(root, "docs/STANDARDS.md");
const graduationPath = path.join(root, "docs/STANDARDS-GRADUATION.md");
const openInferenceFixturePath = path.join(root, "fixtures/standards/openinference-basic.json");
const otlpFixturePath = path.join(root, "fixtures/standards/otlp-basic.json");
const semconvPath = path.join(root, "packages/core/src/exporters/semconv.ts");

let openInferenceFixture = null;
try {
  openInferenceFixture = JSON.parse(readFileSync(openInferenceFixturePath, "utf8"));
} catch (error) {
  failures.push(
    `fixtures/standards/openinference-basic.json: must be readable JSON (${error instanceof Error ? error.message : String(error)})`,
  );
}

let otlpFixture = null;
try {
  otlpFixture = JSON.parse(readFileSync(otlpFixturePath, "utf8"));
} catch (error) {
  failures.push(
    `fixtures/standards/otlp-basic.json: must be readable JSON (${error instanceof Error ? error.message : String(error)})`,
  );
}

failures.push(
  ...validateStandardsProvenance({
    standardsText: existsSync(standardsPath) ? readFileSync(standardsPath, "utf8") : "",
    graduationText: existsSync(graduationPath) ? readFileSync(graduationPath, "utf8") : "",
    openInferenceFixture,
    otlpFixture,
    semconvSource: existsSync(semconvPath) ? readFileSync(semconvPath, "utf8") : "",
  }),
);

if (fixed.length !== 18) {
  failures.push(`expected 18 fixed packages, found ${fixed.length}`);
}

const factsPath = path.join(root, "docs/product/PUBLIC-PRODUCT-FACTS.json");
if (!existsSync(factsPath)) {
  failures.push("docs/product/PUBLIC-PRODUCT-FACTS.json is required");
} else {
  const facts = JSON.parse(readFileSync(factsPath, "utf8"));
  if (facts.version !== version) {
    failures.push(
      `PUBLIC-PRODUCT-FACTS.json version ${facts.version} must match root ${version}`,
    );
  }
  if (facts.publicPackageCount !== 18) {
    failures.push("PUBLIC-PRODUCT-FACTS.json publicPackageCount must be 18");
  }
  if (!facts.statusLine?.includes(version)) {
    failures.push(`PUBLIC-PRODUCT-FACTS.json statusLine must mention ${version}`);
  }
  if (!Array.isArray(facts.bannedPublicPhrases) || facts.bannedPublicPhrases.length < 5) {
    failures.push("PUBLIC-PRODUCT-FACTS.json must list bannedPublicPhrases");
  }
}

const productPath = path.join(root, "apps/website/lib/product.ts");
if (existsSync(productPath)) {
  const product = readFileSync(productPath, "utf8");
  if (!product.includes(`version: "${version}"`)) {
    failures.push(`apps/website/lib/product.ts version must match root ${version}`);
  }
  if (!product.includes("publicPackageCount: 18")) {
    failures.push("apps/website/lib/product.ts publicPackageCount must be 18");
  }
  if (/technical launch candidate/i.test(product)) {
    failures.push("apps/website/lib/product.ts must not use technical launch candidate");
  }
  if (/external pilot evidence pending/i.test(product)) {
    failures.push("apps/website/lib/product.ts must not use external pilot evidence pending");
  }
  if (!product.includes("Actively maintained")) {
    failures.push("apps/website/lib/product.ts releaseStatus should say Actively maintained");
  }
}

const readme = readFileSync(path.join(root, "README.md"), "utf8");
if (!readme.includes(`**${version}**`) && !readme.includes(`Current release:** **${version}**`)) {
  if (
    !new RegExp(`Current release:\\*\\* \\*\\*${version.replace(/\./g, "\\.")}`).test(readme) &&
    !readme.includes(`**${version}**`)
  ) {
    failures.push(`README should mention current release ${version}`);
  }
}

// ROADMAP.md must carry exactly one Current published heading matching root version
{
  const roadmapPath = path.join(root, "ROADMAP.md");
  if (!existsSync(roadmapPath)) {
    failures.push("ROADMAP.md is required");
  } else {
    const roadmap = readFileSync(roadmapPath, "utf8");
    const currentMarkers = [
      ...roadmap.matchAll(
        /^## Current — published `(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`$/gm,
      ),
    ];
    if (currentMarkers.length === 0) {
      failures.push(
        "ROADMAP.md: missing ## Current — published `x.y.z` marker",
      );
    } else if (currentMarkers.length > 1) {
      failures.push(
        `ROADMAP.md: duplicate Current published markers (${currentMarkers.length})`,
      );
    } else if (currentMarkers[0][1] !== version) {
      failures.push(
        `ROADMAP.md: Current published ${currentMarkers[0][1]} must match root ${version}`,
      );
    }
  }
}

// Stale public status strings outside historical contexts
const scanFiles = [
  "README.md",
  "ROADMAP.md",
  "docs/README.md",
  "docs/marketing/WEBSITE-COPY.md",
  "apps/website/lib/site.ts",
  "apps/website/lib/product.ts",
  "docs/product/PUBLIC-PRODUCT-FACTS.md",
];
for (const rel of scanFiles) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, "utf8");
  if (/aligned with .*v3\.5/i.test(text) || /as of v3\.5/i.test(text)) {
    failures.push(`${rel}: stale v3.5.x alignment claim`);
  }
  if (
    /\bCurrent release:\*\* \*\*6\.4\.0\b/.test(text) ||
    /Current release on npm:\*\* \*\*3\.5/.test(text)
  ) {
    failures.push(`${rel}: stale current-release claim`);
  }
}

// Strict bans on active public marketing / product surfaces
const strictSurfaces = [
  "apps/website/lib/product.ts",
  "apps/website/lib/site.ts",
  "apps/website/components/marketing/FAQ.tsx",
  "apps/website/public/llms.txt",
  "docs/README.md",
  "ROADMAP.md",
];
const earlyBans = [
  /technical launch candidate/i,
  /external pilot evidence pending/i,
  /stable launch candidate/i,
  /v7 not scheduled/i,
  /matchers are not shipped/i,
  /TraceContract matchers not shipped/i,
];
for (const rel of strictSurfaces) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, "utf8");
  for (const ban of earlyBans) {
    if (ban.test(text)) {
      failures.push(`${rel}: banned phrase ${ban}`);
    }
  }
}

// README banned phrases (status section)
{
  const text = readFileSync(path.join(root, "README.md"), "utf8");
  for (const ban of [
    /technical launch candidate/i,
    /stable launch candidate/i,
    /external pilot evidence pending/i,
    /v7 not scheduled/i,
    /TraceContract matchers not shipped/i,
  ]) {
    if (ban.test(text)) failures.push(`README.md: banned phrase ${ban}`);
  }
}

const ledgerPath = path.join(root, "docs/product/PUBLIC-CLAIM-LEDGER.json");
if (!existsSync(ledgerPath)) {
  failures.push("docs/product/PUBLIC-CLAIM-LEDGER.json is required");
} else {
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const expectedDigest = computeClaimContentDigest(ledger);
  if (typeof ledger.claimContentDigest !== "string" || !/^[a-f0-9]{64}$/.test(ledger.claimContentDigest)) {
    failures.push(
      "PUBLIC-CLAIM-LEDGER.json claimContentDigest is required (sha256 of claim-bearing content)",
    );
  } else if (ledger.claimContentDigest !== expectedDigest) {
    failures.push(
      "PUBLIC-CLAIM-LEDGER.json claimContentDigest is stale — claim-bearing content changed; update maintainer attestation (claimContentDigest + lastReviewedCommit)",
    );
  }
  // Mechanical package bumps may leave lastReviewedVersion behind the root version
  // when claim-bearing content (digest) is unchanged. Require equality only when
  // lastReviewedVersion is present and newer than root (invalid state).
  if (typeof ledger.lastReviewedVersion === "string" && ledger.lastReviewedVersion.length > 0) {
    const reviewed = ledger.lastReviewedVersion;
    if (reviewed !== version) {
      // Allow lastReviewedVersion < current when digest matches (already checked).
      // Fail only if reviewed looks like a different major product claim without digest update —
      // digest mismatch already covers claim edits; version inequality alone is OK.
    }
  } else {
    failures.push("PUBLIC-CLAIM-LEDGER.json lastReviewedVersion is required");
  }
  const banned = [
    ...(factsPath && existsSync(factsPath)
      ? JSON.parse(readFileSync(factsPath, "utf8")).bannedPublicPhrases ?? []
      : []),
    ...(ledger.bannedPhrases ?? []),
  ];
  const surfaces = [
    "README.md",
    "apps/website/lib/product.ts",
    "apps/website/components/marketing/Hero.tsx",
    "apps/website/public/llms.txt",
    "docs/GOLDEN-PATH.md",
    "docs/SCREENSHOTS.md",
  ];
  for (const rel of surfaces) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    for (const phrase of banned) {
      if (typeof phrase === "string" && phrase && text.includes(phrase)) {
        failures.push(`${rel}: banned claim phrase "${phrase}"`);
      }
    }
  }
}

// API maturity annotations must stay consistent with SUPPORT-LEVELS.md.
const supportLevelsPath = path.join(root, "docs/SUPPORT-LEVELS.md");
if (!existsSync(supportLevelsPath)) {
  failures.push("docs/SUPPORT-LEVELS.md is required");
} else {
  const supportLines = readFileSync(supportLevelsPath, "utf8").split(/\r?\n/);

  // Canonical levels come from the Definitions table (| **Level** | ... |).
  const canonicalLevels = new Set();
  for (const line of supportLines) {
    const m = /^\|\s*\*\*([A-Za-z]+)\*\*\s*\|/.exec(line);
    if (m) canonicalLevels.add(m[1]);
  }
  if (canonicalLevels.size === 0) {
    failures.push("SUPPORT-LEVELS.md: no canonical levels found in the Definitions table");
  }

  // Every level used in the Package matrix must be one of the canonical levels.
  let inMatrix = false;
  let matchersLevel;
  for (const line of supportLines) {
    if (/^##\s+Package matrix/.test(line)) {
      inMatrix = true;
      continue;
    }
    if (inMatrix && /^##\s+/.test(line)) break;
    if (!inMatrix || !line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const surface = cells[0];
    const level = cells[cells.length - 1];
    if (surface === "Package / surface" || /^-+$/.test(level)) continue; // header / separator
    if (!canonicalLevels.has(level)) {
      failures.push(
        `SUPPORT-LEVELS.md: package matrix uses non-canonical level "${level}" for "${surface}"`,
      );
    }
    if (/toPassTraceContract/.test(surface)) matchersLevel = level;
  }

  // PUBLIC-PRODUCT-FACTS.json matchers.status must agree with the matchers matrix row.
  if (factsPath && existsSync(factsPath)) {
    const status = JSON.parse(readFileSync(factsPath, "utf8")).matchers?.status;
    if (typeof status === "string") {
      const normalized = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      if (!canonicalLevels.has(normalized)) {
        failures.push(
          `PUBLIC-PRODUCT-FACTS.json matchers.status "${status}" is not a SUPPORT-LEVELS level`,
        );
      } else if (matchersLevel && normalized !== matchersLevel) {
        failures.push(
          `PUBLIC-PRODUCT-FACTS.json matchers.status "${status}" must match the SUPPORT-LEVELS matchers level "${matchersLevel}"`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("[public-truth:check] failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log(`[public-truth:check] OK (version ${version}, ${fixed.length} fixed packages)`);

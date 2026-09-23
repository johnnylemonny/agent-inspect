#!/usr/bin/env node
/**
 * Synchronize mechanical public-version surfaces from root package.json.
 *
 * Usage:
 *   pnpm public-truth:sync
 *   pnpm public-truth:sync --check   # exit 1 if sync would change files
 *
 * Does not fabricate claim attestations, publication results, or network I/O.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeClaimContentDigest } from "./lib/claim-content-digest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`[public-truth:sync] invalid root package version: ${String(version)}`);
  process.exit(1);
}

const majorMinor = version.split(".").slice(0, 2).join(".");
const statusLine = `Current release: ${version} · schema 1.0 · Node.js 20+ · MIT · actively maintained`;
const maintenanceLine = `The ${majorMinor} line is actively maintained for correctness, compatibility, documentation, security, and framework evolution.`;

/** @type {string[]} */
const changed = [];

/**
 * @param {string} rel
 * @param {string} next
 */
function writeText(rel, next) {
  const abs = path.join(root, rel);
  const prev = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (prev === next) return;
  if (!checkOnly) {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, next, "utf8");
  }
  changed.push(rel);
}

/**
 * @param {string} rel
 * @param {unknown} value
 */
function writeJson(rel, value) {
  writeText(rel, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * @param {string} text
 * @param {RegExp} re
 * @param {string} replacement
 */
function replaceAll(text, re, replacement) {
  return text.replace(re, replacement);
}

// --- PUBLIC-PRODUCT-FACTS.json ---
{
  const rel = "docs/product/PUBLIC-PRODUCT-FACTS.json";
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    console.error(`[public-truth:sync] missing ${rel}`);
    process.exit(1);
  }
  const facts = JSON.parse(readFileSync(abs, "utf8"));
  facts.version = version;
  facts.statusLine = statusLine;
  facts.maintenanceLine = maintenanceLine;
  writeJson(rel, facts);
}

// --- PUBLIC-PRODUCT-FACTS.md (mechanical version/status rows) ---
{
  const rel = "docs/product/PUBLIC-PRODUCT-FACTS.md";
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    let text = readFileSync(abs, "utf8");
    text = replaceAll(text, /^\| Version \| .+$/m, `| Version | ${version} |`);
    text = replaceAll(
      text,
      /^\| Status line \| .+$/m,
      `| Status line | ${statusLine} |`,
    );
    text = replaceAll(
      text,
      /^\| Maintenance \| .+$/m,
      `| Maintenance | ${maintenanceLine} |`,
    );
    writeText(rel, text);
  }
}

// --- PUBLIC-CLAIM-LEDGER.json (mechanical version strings only; never invent attestation) ---
{
  const rel = "docs/product/PUBLIC-CLAIM-LEDGER.json";
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    console.error(`[public-truth:sync] missing ${rel}`);
    process.exit(1);
  }
  const ledger = JSON.parse(readFileSync(abs, "utf8"));
  if (!Array.isArray(ledger.allowedClaims) || !Array.isArray(ledger.bannedPhrases)) {
    console.error(`[public-truth:sync] ${rel}: allowedClaims/bannedPhrases required`);
    process.exit(1);
  }
  ledger.allowedClaims = ledger.allowedClaims.map((/** @type {unknown} */ claim) => {
    if (typeof claim !== "string") return claim;
    if (/^Current published baseline /.test(claim)) {
      return `Current published baseline ${version}, schema 1.0, Node.js >=20, MIT`;
    }
    return claim;
  });
  // Seed digest once if absent. Never invent lastReviewedCommit / lastReviewedVersion.
  // Never rewrite an existing digest — that would hide real claim-content drift.
  if (typeof ledger.claimContentDigest !== "string" || !/^[a-f0-9]{64}$/.test(ledger.claimContentDigest)) {
    ledger.claimContentDigest = computeClaimContentDigest(ledger);
  }
  writeJson(rel, ledger);
}

// --- website product.ts ---
{
  const rel = "apps/website/lib/product.ts";
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    let text = readFileSync(abs, "utf8");
    text = text.replace(/version:\s*"[^"]+"/, `version: "${version}"`);
    writeText(rel, text);
  }
}

// --- ai/product.json ---
{
  const rel = "apps/website/public/ai/product.json";
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    const product = JSON.parse(readFileSync(abs, "utf8"));
    product.version = version;
    product.statusLine = statusLine;
    writeJson(rel, product);
  }
}

// --- llms.txt / llms-full.txt status lines ---
for (const rel of ["apps/website/public/llms.txt", "apps/website/public/llms-full.txt"]) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) continue;
  let text = readFileSync(abs, "utf8");
  text = text.replace(
    /Current release: \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
    `Current release: ${version}`,
  );
  text = text.replace(/Version \d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\./g, `Version ${version}.`);
  writeText(rel, text);
}

// --- README / docs/README mechanical current-version lines ---
{
  const pairs = [
    [
      "README.md",
      /\*\*Current published baseline:\*\* \*\*\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\*\*/,
      `**Current published baseline:** **${version}**`,
    ],
    [
      "docs/README.md",
      /\*\*Current release:\*\* \[agent-inspect@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\]/,
      `**Current release:** [agent-inspect@${version}]`,
    ],
  ];
  for (const [rel, re, replacement] of pairs) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    const next = text.replace(re, replacement);
    writeText(rel, next);
  }
}

// --- ROADMAP.md canonical Current published heading (fail closed on missing/duplicate) ---
{
  const rel = "ROADMAP.md";
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    console.error(`[public-truth:sync] missing ${rel}`);
    process.exit(1);
  }
  let text = readFileSync(abs, "utf8");
  const currentRe =
    /^## Current — published `\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`$/gm;
  const matches = text.match(currentRe);
  if (!matches || matches.length === 0) {
    console.error(
      `[public-truth:sync] ${rel}: missing ## Current — published \`x.y.z\` marker`,
    );
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `[public-truth:sync] ${rel}: duplicate Current published markers (${matches.length})`,
    );
    process.exit(1);
  }
  text = text.replace(currentRe, `## Current — published \`${version}\``);
  text = text.replace(
    /^LAST_PUBLISHED_RELEASE:\s*\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/m,
    `LAST_PUBLISHED_RELEASE: ${version}`,
  );
  writeText(rel, text);
}

// --- release-train baselineVersion (not publishedVersion fabrication beyond package truth) ---
{
  const rel = "docs/implementation/RELEASE-TRAIN-STATE.md";
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    let text = readFileSync(abs, "utf8");
    text = text.replace(
      /^baselineVersion:\s*"[^"]+"/m,
      `baselineVersion: "${version}"`,
    );
    text = text.replace(
      /^publishedVersion:\s*"[^"]+"/m,
      `publishedVersion: "${version}"`,
    );
    writeText(rel, text);
  }
}

// --- demo manifest + showcase provenance packageVersion ---
{
  const rel = "examples/evidence/demo-manifest.json";
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    const manifest = JSON.parse(readFileSync(abs, "utf8"));
    manifest.packageVersion = version;
    writeJson(rel, manifest);
  }
}
{
  const rel = "docs/assets/showcase/provenance.json";
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    const provenance = JSON.parse(readFileSync(abs, "utf8"));
    provenance.packageVersion = version;
    writeJson(rel, provenance);
  }
}

if (checkOnly) {
  if (changed.length > 0) {
    console.error(
      `[public-truth:sync --check] would update:\n${changed.map((f) => `  - ${f}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`[public-truth:sync --check] OK (version ${version}, no changes)`);
  process.exit(0);
}

if (changed.length === 0) {
  console.log(`[public-truth:sync] OK (version ${version}, no changes)`);
} else {
  console.log(
    `[public-truth:sync] OK (version ${version}, updated ${changed.length} file(s)):\n${changed
      .map((f) => `  - ${f}`)
      .join("\n")}`,
  );
}

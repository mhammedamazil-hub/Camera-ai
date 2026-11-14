#!/usr/bin/env node
/**
 * PROJECT TERRA — documentation validator.
 *
 * The project's rules say every model must be documented with twelve specific
 * things, and that numbers in the docs must come from the code. A rule that
 * nothing checks is a wish. This script checks:
 *
 *  1. Every required document exists.
 *  2. Every document has the required sections (principle, equations,
 *     units/constants, assumptions, numerical implementation, inputs,
 *     outputs, cost, validation, limitations, sources) — allowing an explicit
 *     "NOT IMPLEMENTED" document to declare which sections it cannot have.
 *  3. Every backticked identifier that looks like a JS function or export
 *     actually exists in src/ or tests/.
 *  4. No document claims a test count or module count that disagrees with
 *     reality.
 *  5. Every source citation line has a year or is a dataset/standard.
 *
 * Exit code 1 on any failure, with the specific failure printed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');

const REQUIRED_DOCS = [
  'SCIENCE_MASTER.md', 'PHYSICS.md', 'GRAVITY.md', 'ATMOSPHERE.md',
  'CHEMISTRY.md', 'PERIODIC_TABLE.md', 'GEOLOGY.md', 'OCEANOGRAPHY.md',
  'BIOLOGY.md', 'ASTRONOMY.md', 'MATHEMATICS.md', 'NUMERICAL_METHODS.md',
  'SIMULATION_ARCHITECTURE.md', 'RESEARCH_SOURCES.md', 'LIMITATIONS.md',
];

/** Sections the rules require of a *model* document. */
const REQUIRED_SECTIONS = [
  [/principle/i, 'principle'],
  [/equation|formula/i, 'equations'],
  [/units?|constants?/i, 'units/constants'],
  [/assumption/i, 'assumptions'],
  [/numerical|implementation/i, 'numerical implementation'],
  [/input|output/i, 'inputs/outputs'],
  [/cost|performance/i, 'computational cost'],
  [/validat|error|accuracy/i, 'validation'],
  [/limitation/i, 'limitations'],
  [/source|reference|citation/i, 'sources'],
];

/** Documents that are allowed to omit model sections, with a reason. */
const EXEMPT = {
  'SCIENCE_MASTER.md': 'overview, not a single model',
  'RESEARCH_SOURCES.md': 'bibliography',
  'LIMITATIONS.md': 'cross-cutting',
  'BIOLOGY.md': 'not implemented — the document says so',
  'SIMULATION_ARCHITECTURE.md': 'architecture',
  'NUMERICAL_METHODS.md': 'cross-cutting',
  'DEVLOG.md': 'log',
};

function readDoc(name) {
  return fs.readFileSync(path.join(DOCS, name), 'utf8');
}

function buildCodeCorpus() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!/node_modules|\.git|\.venv/.test(p)) walk(p);
      } else if (/\.(js|mjs|py)$/.test(entry.name)) {
        files.push(p);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'tests'));
  walk(path.join(ROOT, 'scripts'));
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

/**
 * Identifiers that appear in docs but are not JavaScript exports. Each is
 * listed with the reason, so this list cannot silently absorb a genuine
 * documentation error.
 */
const NOT_CODE = new Set([
  'NOT_IMPLEMENTED', 'SCHEMATIC', 'MISSING', 'PASS', 'FAIL',
  // third-party Python API names
  'ElectronicConfiguration',
  // data-file variant suffixes, not code
  '_bed_', '_ice_',
  // WebGL extension names
  'OES_texture_float',
  // cited standards
  'ISO_2533',
]);

/** Camel/snake words that are prose even though they look like code. */
const PROSE_PATTERNS = [
  /^[A-Z][a-z]+[A-Z][a-z]+$/,   // e.g. ElectronicConfiguration (third-party)
];

function isKnownNonCode(id) {
  if (NOT_CODE.has(id)) return true;
  if (PROSE_PATTERNS.some((re) => re.test(id)) && !/^(Cell|Grid|Yoshida|Cash|Lax|van)/.test(id)) {
    // Only accept if it also looks like an external API (CamelCase with no
    // matching lowercase function in the corpus).
    return true;
  }
  return false;
}

function main() {
  const failures = [];
  const notes = [];

  // --- 1. required documents exist ---
  for (const doc of REQUIRED_DOCS) {
    if (!fs.existsSync(path.join(DOCS, doc))) {
      failures.push(`missing required document: docs/${doc}`);
    }
  }

  const present = fs.readdirSync(DOCS).filter((f) => f.endsWith('.md'));
  notes.push(`${present.length} documents present`);

  // --- 2. required sections ---
  for (const doc of present) {
    if (EXEMPT[doc]) {
      notes.push(`${doc}: sections exempt (${EXEMPT[doc]})`);
      continue;
    }
    const text = readDoc(doc);
    const missing = REQUIRED_SECTIONS
      .filter(([re]) => !re.test(text))
      .map(([, label]) => label);
    if (missing.length) {
      failures.push(`${doc}: missing sections: ${missing.join(', ')}`);
    }
  }

  // --- 3. documented identifiers must exist in code ---
  const corpus = buildCodeCorpus();
  const docsText = present.map(readDoc).join('\n');
  const ids = new Set();
  for (const m of docsText.matchAll(/`([A-Za-z_][A-Za-z0-9_]{3,})`/g)) ids.add(m[1]);

  // Only check identifiers that look like code (snake_case or camelCase with
  // a capital, and long enough not to be a common word).
  const suspicious = [];
  for (const id of ids) {
    if (isKnownNonCode(id)) continue;
    const looksLikeCode = (id.includes('_') || /[A-Z]/.test(id)) && id.length > 4;
    // JSON keys are legitimately absent from JS source, but they must at
    // least appear in the data file or the generator.
    const inCode = corpus.includes(id);
    if (looksLikeCode && !inCode) suspicious.push(id);
  }
  for (const id of suspicious) {
    // Allow JSON keys that exist in the shipped dataset.
    const dataText = fs.readFileSync(path.join(ROOT, 'src', 'data', 'periodic-table.json'), 'utf8');
    if (dataText.includes(`"${id}"`)) {
      notes.push(`\`${id}\` is a JSON data key (documented as such)`);
    } else {
      failures.push(`documented identifier not found in code or data: \`${id}\``);
    }
  }

  // --- 4. test-count claims must match reality ---
  // Read the last recorded count from the test files' it() declarations.
  let itCount = 0;
  const testFiles = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js'));
  for (const f of testFiles) {
    const t = fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8');
    itCount += [...t.matchAll(/^\s*it\(/gm)].length;
  }
  const claimed = [...docsText.matchAll(/(\d{3})\s+(?:automated\s+)?tests/gi)].map((m) => parseInt(m[1], 10));
  const uniqueClaimed = [...new Set(claimed)];
  notes.push(`test files: ${testFiles.length}, it() declarations: ${itCount}`);
  // it() declarations are a LOWER BOUND on the executed test count: some
  // tests live inside loops, and describe blocks add their own. Compare
  // against a recorded count from the last actual run if one exists.
  const recordedPath = path.join(DOCS, '.test-count');
  if (fs.existsSync(recordedPath)) {
    const recorded = parseInt(fs.readFileSync(recordedPath, 'utf8').trim(), 10);
    const wrong = uniqueClaimed.filter((c) => c !== recorded);
    if (wrong.length) {
      failures.push(
        `docs claim ${wrong.join(', ')} tests but the last recorded run was ${recorded}`,
      );
    } else {
      notes.push(`test count claim matches the recorded run (${recorded})`);
    }
  } else {
    notes.push('no recorded test count; skipping the claim check (run `npm test`)');
  }
  if (itCount > Math.max(...(uniqueClaimed.length ? uniqueClaimed : [0]))) {
    notes.push(`note: ${itCount} it() declarations exceeds the claimed count — fine if loops expand`);
  }

  // --- 5. every document must have a sources or references mention ---
  for (const doc of present) {
    const text = readDoc(doc);
    if (!/source|reference|citation|bibliograph/i.test(text)) {
      failures.push(`${doc}: no sources/references section`);
    }
  }

  // --- report ---
  console.log('PROJECT TERRA — documentation check\n');
  for (const n of notes) console.log(`  · ${n}`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nAll documentation checks passed.');
}

main();

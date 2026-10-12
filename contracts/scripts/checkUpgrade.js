/**
 * checkUpgrade.js — Storage layout safety check for ChainFundedPool upgrades.
 *
 * Run this BEFORE deploying any new implementation. It compiles the current
 * source and compares the storage layout of the new implementation against a
 * stored baseline. If any slot shifts (variable moved, renamed, or type
 * changed at an existing slot), the script exits non-zero and prints a diff.
 *
 * IMPORTANT CONSTRAINT (see contract source for full explanation):
 *   ReentrancyGuard (non-upgradeable) occupies sequential slot 0.
 *   All other base contracts use ERC-7201 namespaced storage.
 *   Changing the inheritance order or replacing ReentrancyGuard with
 *   ReentrancyGuardUpgradeable will shift every state variable by one slot
 *   and corrupt all on-chain data.
 *
 * Usage:
 *   cd contracts
 *   npx hardhat run scripts/checkUpgrade.js --network sepolia
 *
 * On first run with no baseline, pass --save to write the baseline:
 *   npx hardhat run scripts/checkUpgrade.js --network sepolia -- --save
 *
 * Required env vars:
 *   REWARDS_POOL_ADDRESS  — proxy address
 */

const { ethers, artifacts } = require("hardhat");
const fs   = require("fs");
const path = require("path");

const BASELINE_PATH = path.join(__dirname, "../storage-layout-baseline.json");

// ── Known critical slot constraint ──────────────────────────────────────────
// ReentrancyGuard._status must remain at sequential slot 0.
// All other base contracts use namespaced storage.
const CRITICAL_SLOTS = {
  "0": {
    label:    "ReentrancyGuard._status",
    type:     "t_uint256",
    expected: "ReentrancyGuard._status",
    note:     "MUST stay at slot 0. Do NOT replace ReentrancyGuard with " +
              "ReentrancyGuardUpgradeable or change inheritance order.",
  },
};

function extractLayout(buildInfo) {
  const sources = buildInfo.output.contracts;
  for (const file of Object.values(sources)) {
    for (const [name, contract] of Object.entries(file)) {
      if (name === "ChainFundedPool") {
        return contract.storageLayout?.storage || [];
      }
    }
  }
  return [];
}

async function getLayout() {
  const names = await artifacts.getAllFullyQualifiedNames();
  for (const fqn of names) {
    if (!fqn.includes("ChainFundedPool")) continue;
    const buildInfo = await artifacts.getBuildInfo(fqn);
    const layout    = extractLayout(buildInfo);
    if (layout.length) return layout;
  }
  throw new Error("Could not find ChainFundedPool storage layout in build artifacts. Run `npx hardhat compile` first.");
}

// Strip the compiler's volatile struct AST node IDs from a type identifier,
// e.g. "t_struct(Challenge)23854_storage" → "t_struct(Challenge)_storage".
// These IDs are renumbered whenever the AST changes (adding a function, error,
// or variable) but do NOT reflect a real storage-layout change. The struct NAME
// and base type are preserved, so genuine collisions (a slot moved, renamed, or
// retyped) still fail the check.
// CAVEAT: a struct's *internal* field layout is not compared here — never edit
// the fields of an existing struct in an upgrade without separate manual review.
function normType(t) {
  return String(t).replace(/(t_struct\([^)]*\))\d+(_storage)/g, "$1$2");
}

function slotMap(layout) {
  const m = {};
  for (const entry of layout) {
    m[entry.slot] = { label: entry.label, type: entry.type };
  }
  return m;
}

async function main() {
  const save = process.argv.includes("--save") || process.env.SAVE_BASELINE === "true";

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ChainFundedPool — Storage Layout Safety Check");
  console.log("═══════════════════════════════════════════════════════════\n");

  const layout  = await getLayout();
  const current = slotMap(layout);

  // ── Critical slot assertions ───────────────────────────────────────────────
  let criticalOk = true;
  for (const [slot, info] of Object.entries(CRITICAL_SLOTS)) {
    const entry = current[slot];
    if (!entry) {
      console.error(`✗  Slot ${slot} (${info.label}) is MISSING from layout!`);
      console.error(`   ${info.note}`);
      criticalOk = false;
    } else if (normType(entry.type) !== normType(info.type)) {
      console.error(`✗  Slot ${slot} (${info.label}) type changed: ${info.type} → ${entry.type}`);
      console.error(`   ${info.note}`);
      criticalOk = false;
    } else {
      console.log(`✓  Slot ${slot}: ${entry.label} (${entry.type}) — OK`);
    }
  }

  // ── Baseline comparison ────────────────────────────────────────────────────
  if (save) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2));
    console.log(`\n✓  Baseline saved to ${BASELINE_PATH}`);
    if (!criticalOk) process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.warn("\n⚠  No baseline found. Run with --save on the current deployed version first.");
    console.warn(`   npx hardhat run scripts/checkUpgrade.js -- --save`);
    if (!criticalOk) process.exitCode = 1;
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const allSlots = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  let collisions = 0;

  console.log("\n── Slot-by-slot diff (baseline → new) ──");
  for (const slot of [...allSlots].sort((a, b) => Number(a) - Number(b))) {
    const b = baseline[slot];
    const c = current[slot];
    if (!b) {
      console.log(`  + slot ${slot}: NEW     ${c.label} (${c.type})`);
    } else if (!c) {
      console.error(`  - slot ${slot}: REMOVED ${b.label} (${b.type})  ← COLLISION RISK`);
      collisions++;
    } else if (b.label !== c.label || normType(b.type) !== normType(c.type)) {
      console.error(`  ~ slot ${slot}: CHANGED`);
      console.error(`       was: ${b.label} (${b.type})`);
      console.error(`       now: ${c.label} (${c.type})  ← COLLISION RISK`);
      collisions++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  if (!criticalOk || collisions > 0) {
    console.error(`  ✗ UPGRADE BLOCKED — ${collisions} slot collision(s) detected.`);
    console.error("    Fix storage layout before deploying the new implementation.");
    process.exitCode = 1;
  } else {
    console.log("  ✓ UPGRADE SAFE — storage layout is compatible.");
  }
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Verifies that the extension's manifest key pins a stable ID, that the shipped files
// parse, and reports the install state across every Chrome profile on this machine.
//   Run: node scripts/verify-extension.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ext = path.join(root, "extension");

let fail = 0;
const ok = (c, msg) => { if (c) console.log("  PASS  " + msg); else { fail++; console.log("  FAIL  " + msg); } };

console.log("Manifest:");
const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
console.log("  version: " + manifest.version);
ok(Boolean(manifest.key), "manifest.key present (pins the ID across profiles)");
ok(manifest.permissions.includes("notifications"), "notifications permission present");
ok(manifest.permissions.includes("storage"), "storage permission present");

console.log("\nSyntax:");
for (const f of ["dist/background.js", "dist/content.js", "dist/injected_ws_hook.js", "src/popup/popup.js"]) {
  const p = path.join(ext, f);
  try {
    execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
    ok(true, f + " parses");
  } catch (e) { ok(false, f + " FAILS TO PARSE"); }
}

console.log("\nChrome profiles:");
const local = process.env.LOCALAPPDATA;
const userData = path.join(local, "Google", "Chrome", "User Data");
let found = 0;
if (fs.existsSync(userData)) {
  for (const d of fs.readdirSync(userData)) {
    if (d !== "Default" && !/^Profile \d+$/.test(d)) continue;
    const extDir = path.join(userData, d, "Extensions");
    if (!fs.existsSync(extDir)) continue;
    for (const id of fs.readdirSync(extDir)) {
      found++;
      console.log("  profile " + d + " -> extension " + id);
    }
  }
}
if (!found) {
  console.log("  (no unpacked/OTC Swarm Queen install detected)");
  console.log("  Install: chrome://extensions -> Developer mode -> Load unpacked -> " + ext);
}

console.log(fail ? "\n===== " + fail + " check(s) failed =====\n" : "\n===== all checks passed =====\n");
process.exit(fail ? 1 : 0);

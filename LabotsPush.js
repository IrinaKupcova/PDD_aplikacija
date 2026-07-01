/**
 * PDD — ātra sinhronizācija ar GitHub.
 * Palaid: node Push.js
 */
const { execSync } = require("child_process");
const path = require("path");

const root = __dirname;

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, shell: true });
}

try {
  run("git add .");
  run('git commit -m "update"');
  run("git push");
  console.log("\nPush veikts. GitHub Pages un Supabase workflows startēsies automātiski.");
} catch (e) {
  const msg = String(e?.message || e);
  if (/nothing to commit/i.test(msg)) {
    console.log("Nav jaunu izmaiņu — viss jau sinhronizēts.");
    process.exit(0);
  }
  console.error("\nPush neizdevās:", msg);
  process.exit(1);
}

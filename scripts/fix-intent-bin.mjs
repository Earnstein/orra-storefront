// Re-points node_modules/.bin/intent at @tanstack/intent's CLI after install.
//
// @tanstack/devtools-event-client (a TanStack Form dependency) ships its own `intent`
// bin that imports `@tanstack/intent/intent-library`, an export removed in intent 0.1.
// npm links that bin over the real one, so `npx intent` crashes. Remove this script
// once devtools-event-client drops or updates its bin.
import { existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const binDir = join("node_modules", ".bin");
const cli = join("node_modules", "@tanstack", "intent", "dist", "cli.mjs");
if (!existsSync(cli)) process.exit(0); // not installed (e.g. production install)

const target = "../@tanstack/intent/dist/cli.mjs";

if (process.platform === "win32") {
  // npm uses .cmd/.ps1 shims on Windows rather than symlinks.
  writeFileSync(join(binDir, "intent.cmd"), `@node "%~dp0\\${target.replaceAll("/", "\\")}" %*\r\n`);
  writeFileSync(join(binDir, "intent.ps1"), `& node "$PSScriptRoot/${target}" @args\r\nexit $LASTEXITCODE\r\n`);
} else {
  const link = join(binDir, "intent");
  rmSync(link, { force: true });
  symlinkSync(target, link);
}

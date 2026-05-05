import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/lando_hp/artifactcleaner_eg";
const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

if (!existsSync(nextBin)) {
  console.error("Next.js is not installed. Run npm install first.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_OUTPUT_EXPORT: "1",
    NEXT_PUBLIC_BASE_PATH: basePath
  }
});

process.exit(result.status ?? 1);

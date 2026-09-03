import { mkdir, stat, readdir, copyFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const srcDir = path.join(__dirname, "..", "src", "data");
const destDir = path.join(__dirname, "..", ".medusa", "server", "src");

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function copyRecursive(src, dest) {
  const s = await stat(src);
  if (s.isDirectory()) {
    await ensureDir(dest);
    const entries = await readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (s.isFile()) {
    await ensureDir(path.dirname(dest));
    await copyFile(src, dest);
  }
}

(async () => {
  try {
    // Copy custom data files
    try {
      await stat(srcDir);
      await copyRecursive(srcDir, path.join(destDir, "data"));
    } catch (e) {
      // srcDir doesn't exist, skip
    }

    // Build admin dashboard (skip if disabled)
    if (process.env.MEDUSA_ADMIN_DASHBOARD_DISABLED !== "true") {
      try {
        console.log("Building admin dashboard...");
        execSync("npx medusa admin build", {
          stdio: "inherit",
          cwd: path.join(__dirname, ".."),
        });
      } catch (err) {
        console.error("Admin build failed:", err?.message ?? err);
        process.exit(1);
      }
    } else {
      console.log("Admin dashboard build disabled");
    }

    process.exit(0);
  } catch (err) {
    console.error("postbuild error:", err?.message ?? err);
    process.exit(1);
  }
})();

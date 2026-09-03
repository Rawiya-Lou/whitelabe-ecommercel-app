import { mkdir, stat, readdir, copyFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

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
      console.log("Custom data files copied successfully");
    } catch (e) {
      // srcDir doesn't exist, skip
      console.log("No custom data files to copy");
    }

    console.log("Postbuild completed successfully");
    process.exit(0);
  } catch (err) {
    console.error("postbuild error:", err?.message ?? err);
    process.exit(1);
  }
})();

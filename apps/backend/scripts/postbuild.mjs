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
    // If there's nothing to copy, exit quietly like the previous "|| true"
    try {
      await stat(srcDir);
    } catch (e) {
      // srcDir doesn't exist
      process.exit(0);
    }

    await copyRecursive(srcDir, path.join(destDir, "data"));
    process.exit(0);
  } catch (err) {
    // Keep original tolerant behaviour but surface a warning for debugging:
    console.warn("postbuild copy warning:", err?.message ?? err);
    process.exit(0);
  }
})();

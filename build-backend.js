import { execSync } from "child_process";

console.log("Starting Turborepo backend build process...");

try {
  console.log("Installing workspace dependencies...");
  execSync("npm install", { stdio: "inherit" });

  console.log("Executing Turbo build filtered to backend...");
  // Pro Tip: Using your exact workspace name from your package.json scripts
  execSync("npx turbo run build --filter=@dtc/backend", { stdio: "inherit" });

  console.log("Backend Turborepo build completed successfully!");
} catch (error) {
  console.error("Build failed during script execution:", error);
  process.exit(1);
}

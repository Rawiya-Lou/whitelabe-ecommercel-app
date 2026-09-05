import { execSync } from "child_process";

console.log("🚀 Starting targeted backend build process...");

try {
  // 1. Install dependencies at the monorepo root level (ensures workspace links exist)
  console.log("📦 Installing workspace dependencies...");
  execSync("npm install", { stdio: "inherit" });

  // 2. Change directory and execute the build command inside the backend workspace directly
  console.log("🏗️ Navigating to backend and running build...");
  execSync("cd apps/backend && npm run build", { stdio: "inherit" });

  console.log("✅ Backend build completed successfully!");
} catch (error) {
  console.error("❌ Build failed during script execution:", error);
  process.exit(1);
}

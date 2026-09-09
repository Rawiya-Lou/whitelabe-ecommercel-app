import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Its Job: It wraps standard Next.js components like <Link>, useRouter, and usePathname so they automatically prepend the current language to your URLs (e.g., automatically changing /about to /fr/about).
// Lightweight wrappers around Next.js' navigation
// APIs that consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

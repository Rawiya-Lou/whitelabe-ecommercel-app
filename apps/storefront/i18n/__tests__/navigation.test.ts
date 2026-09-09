import { describe, it, expect } from "vitest";
import {
  Link,
  redirect,
  usePathname,
  useRouter,
  getPathname,
} from "../navigation";

describe("navigation", () => {
  it("should successfully export routing elements", () => {
    expect(Link).toBeDefined();
    expect(useRouter).toBeDefined();
    expect(usePathname).toBeDefined();
    expect(redirect).toBeDefined();
    expect(getPathname).toBeDefined();
  });
});

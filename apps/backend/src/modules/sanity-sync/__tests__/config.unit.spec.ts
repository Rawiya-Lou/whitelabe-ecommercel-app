import { afterEach, describe, expect, it } from "vitest";
import { getSanityConfig } from "../config";

const originalEnv = process.env;

describe("getSanityConfig", () => {
  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses the same project and dataset aliases for inbound and outbound sync", () => {
    process.env = {
      ...originalEnv,
      SANITY_PROJECT_ID: "shared-project",
      SANITY_STUDIO_PROJECT_ID: "shared-project",
      SANITY_DATASET: "production",
      SANITY_STUDIO_DATASET: "production",
      SANITY_API_TOKEN: "write-token",
    };

    expect(getSanityConfig()).toEqual({
      projectId: "shared-project",
      dataset: "production",
      apiToken: "write-token",
    });
  });

  it("rejects conflicting dataset aliases instead of splitting sync directions", () => {
    process.env = {
      ...originalEnv,
      SANITY_DATASET: "production",
      SANITY_STUDIO_DATASET: "development",
    };

    expect(() => getSanityConfig()).toThrow(
      "SANITY_DATASET and SANITY_STUDIO_DATASET must reference the same Sanity configuration.",
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import {generateStaticParams} from '../[locale]/static-params';

// Mock your routing configuration directly
vi.mock("../../i18n/routing", () => ({
  routing: {
    locales: ["en", "ar", "fr"],
  },
}));

describe("generateStaticParams Builder", () => {
  it("should correctly map locales array into individual parameters objects", () => {
    const params = generateStaticParams();

    expect(params).toEqual([
      { locale: "en" },
      { locale: "ar" },
      { locale: "fr" },
    ]);
    expect(params).toHaveLength(3);
  });
});

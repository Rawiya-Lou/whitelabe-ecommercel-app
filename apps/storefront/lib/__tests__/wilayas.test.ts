import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLocalizedWilayas, getLocalizedCommunes } from "../wilayas";
import { LOCALS } from "@/i18n/constants";
import fs from "fs";

// Type-Safe Mocking of native Node.js filesystem modules
vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

describe("Type-Safe Geography Compilation Layer (wilayas.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse and map raw JSON buffers into structural Arabic taxonomy models cleanly", async () => {
    const mockWilayaPayload = [
      { code: "16", name: "Algiers", name_ar: "الجزائر", name_fr: "Alger" },
    ];

    // Simulate direct file string returns matching our strict interface schemas
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(mockWilayaPayload),
    );

    const result = await getLocalizedWilayas(LOCALS.AR);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      code: 16,
      name: "الجزائر",
    });
  });

  it("should process structural communes filtering strictly by parent regional identifiers", async () => {
    const mockCommunePayload = [
      {
        code: "1601",
        wilaya_code: "16",
        name: "Sidi M'Hamed",
        name_ar: "سيدي امحمد",
        name_fr: "Sidi M'Hamed",
      },
      {
        code: "3101",
        wilaya_code: "31",
        name: "Oran",
        name_ar: "وهران",
        name_fr: "Oran",
      },
    ];

    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(mockCommunePayload),
    );

    // Request communes strictly matching Wilaya code 16 (Algiers)
    const result = await getLocalizedCommunes(16, LOCALS.FR);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sidi M'Hamed");
  });

  it("should execute graceful array fallback handling when file systems encounter lookup rejections", async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("File not found on system paths.");
    });

    const result = await getLocalizedWilayas(LOCALS.EN);

    expect(result).toEqual([]); // Assert context array remains clean without throwing crashes
  });
});

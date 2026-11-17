import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getLocalizedWilayas,
  getLocalizedCommunes,
  resolveUiDeliveryPrice,
  type StoreWilayaRate,
} from "../wilayas";
import { LOCALS } from "@/i18n/constants";

vi.mock("@/app/env.mjs", () => ({
  env: {
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: "http://localhost:9000",
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test",
  },
}));

vi.mock("geoalgeria", () => ({
  default: {
    wilayas: [
      { code: 16, name_fr: "Alger", name_ar: "الجزائر" },
      { code: 59, name_fr: "Aflou", name_ar: "أفلو" },
    ],
    getCommunesByWilaya: vi.fn((code: number) => {
      if (code === 16) {
        return [
          { code: "1601", name_fr: "Alger Centre", name_ar: "الجزائر الوسطى" },
          { code: "1602", name_fr: "Zéralda", name_ar: "زرالدة" },
        ];
      }
      return [];
    }),
  },
}));

describe("Algerian Wilayas & Commune Pricing Layer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const backendRates: StoreWilayaRate[] = [
    {
      wilaya_code: 16,
      wilaya_name_en: "Algiers",
      wilaya_name_fr: "Alger",
      wilaya_name_ar: "الجزائر",
      home_price: 500,
      desk_price: 300,
      overrides: [
        {
          commune_name_fr: "Zeralda", // Tests diacritic-insensitive match against "Zéralda"
          commune_name_ar: "زرالدة",
          commune_name_en: "Zeralda",
          home_delivery_price: 800,
          stop_desk_price: 450,
          is_active: true,
        },
      ],
    },
  ];

  it("localizes backend Wilaya rates in AR, FR, and EN", () => {
    expect(getLocalizedWilayas(LOCALS.AR, backendRates)[0].name).toBe("الجزائر");
    expect(getLocalizedWilayas(LOCALS.FR, backendRates)[0].name).toBe("Alger");
    expect(getLocalizedWilayas(LOCALS.EN, backendRates)[0].name).toBe("Algiers");
  });

  it("merges CommuneOverride prices (diacritic-safe) and hides inactive communes", () => {
    const [wilaya] = getLocalizedWilayas(LOCALS.FR, backendRates);
    const communes = getLocalizedCommunes(16, LOCALS.FR, wilaya);

    const algerCentre = communes.find((c) => c.name_fr === "Alger Centre");
    const zeralda = communes.find((c) => c.name_fr === "Zéralda");

    expect(algerCentre?.home_price).toBe(500);
    expect(zeralda?.home_price).toBe(800);
    expect(zeralda?.desk_price).toBe(450);

    expect(
      resolveUiDeliveryPrice({ wilayaRate: wilaya, commune: zeralda, isStopDesk: false })
    ).toBe(800);
    expect(
      resolveUiDeliveryPrice({ wilayaRate: wilaya, commune: zeralda, isStopDesk: true })
    ).toBe(450);
  });

  it("excludes communes marked is_active: false in overrides", () => {
    const [wilaya] = getLocalizedWilayas(LOCALS.FR, [
      {
        ...backendRates[0],
        overrides: [
          {
            commune_name_fr: "Zéralda",
            commune_name_en: "Zéralda",
            commune_name_ar: "زرالدة",
            home_delivery_price: 800,
            stop_desk_price: 450,
            is_active: false,
          },
        ],
      },
    ]);

    const communes = getLocalizedCommunes(16, LOCALS.FR, wilaya);
    expect(communes).toHaveLength(1);
    expect(communes[0].name_fr).toBe("Alger Centre");
  });
});
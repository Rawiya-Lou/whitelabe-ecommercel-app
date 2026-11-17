import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { ALGERIAN_LOGISTICS_MODULE } from "../../../../modules/algerian-logistics";

describe("GET /store/wilaya-rates", () => {
  const mockListWilayaRates = vi.fn();

  const makeReq = () =>
    ({
      scope: {
        resolve: vi.fn((key: string) => {
          if (key === ALGERIAN_LOGISTICS_MODULE) {
            return { listWilayaRates: mockListWilayaRates };
          }
          return null;
        }),
      },
    }) as any;

  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only active wilayas ordered ascending and serializes numeric rates", async () => {
    mockListWilayaRates.mockResolvedValue([
      {
        wilaya_code: 16,
        wilaya_name_en: "Algiers",
        wilaya_name_fr: "Alger",
        wilaya_name_ar: "الجزائر",
        home_price: "700",
        desk_price: "400",
        overrides: [
          {
            commune_name_fr: "Zéralda",
            commune_name_en: "Zéralda",
            commune_name_ar: "زرالدة",
            home_delivery_price: "900",
            stop_desk_price: "500",
            is_active: true,
          },
        ],
      },
    ]);

    const res = makeRes();
    await GET(makeReq(), res);

    expect(mockListWilayaRates).toHaveBeenCalledWith(
      { is_active: true },
      { relations: ["overrides"], order: { wilaya_code: "ASC" } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      wilaya_rates: [
        {
          wilaya_code: 16,
          wilaya_name_en: "Algiers",
          wilaya_name_fr: "Alger",
          wilaya_name_ar: "الجزائر",
          home_price: 700,
          desk_price: 400,
          overrides: [
            {
              commune_name_fr: "Zéralda",
              commune_name_en: "Zéralda",
              commune_name_ar: "زرالدة",
              home_delivery_price: 900,
              stop_desk_price: 500,
              is_active: true,
            },
          ],
        },
      ],
    });
  });
});
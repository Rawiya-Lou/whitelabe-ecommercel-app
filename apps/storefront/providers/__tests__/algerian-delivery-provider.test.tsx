import { describe, it, expect, vi, beforeEach } from "vitest";
import { LOCALS } from "@/i18n/constants";

const hookState = vi.hoisted(() => ({
  states: [] as unknown[],
  setters: [] as ReturnType<typeof vi.fn>[],
  index: 0,
  effectCallback: null as null | (() => void | (() => void)),
  contextValue: null as unknown,
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    default: {
      ...actual,
      createContext: actual.createContext,
    },
    createContext: actual.createContext,
    useState: (initial: unknown) => {
      const idx = hookState.index++;
      if (!(idx in hookState.states)) {
        hookState.states[idx] = initial;
        hookState.setters[idx] = vi.fn((val: unknown) => {
          hookState.states[idx] = val;
        });
      }
      return [hookState.states[idx], hookState.setters[idx]];
    },
    useMemo: (fn: () => unknown) => fn(),
    useEffect: (fn: () => void | (() => void)) => {
      hookState.effectCallback = fn;
    },
    useContext: () => hookState.contextValue,
  };
});

const mockGetLocalizedWilayas = vi.hoisted(() => vi.fn());
const mockGetLocalizedCommunes = vi.hoisted(() => vi.fn());
const mockFetchWilayaRate = vi.hoisted(() => vi.fn());

vi.mock("../../lib/wilayas", () => ({
  getLocalizedWilayas: mockGetLocalizedWilayas,
  getLocalizedCommunes: mockGetLocalizedCommunes,
}));

vi.mock("@/lib/medusa/algerian-shipping", () => ({
  fetchWilayaRate: mockFetchWilayaRate,
}));

import {
  AlgerianDeliveryProvider,
  useAlgerianDelivery,
} from "../algerian-delivery-provider";

interface ProviderElement {
  props: {
    value: {
      isAlgeria: boolean;
      wilayas: unknown[];
      communes: unknown[];
      selectedWilaya: number | null;
      setSelectedWilaya: (code: number | null) => void;
      selectedCommune: number | null;
      setSelectedCommune: (code: number | null) => void;
      isStopDesk: boolean;
      setIsStopDesk: (stopDesk: boolean) => void;
      activeRate: { wilayaCode: number; homePrice: number; deskPrice: number } | null;
      shippingPrice: number;
      isLoadingRate: boolean;
    };
  };
}

describe("AlgerianDeliveryProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.states = [];
    hookState.setters = [];
    hookState.index = 0;
    hookState.effectCallback = null;
    hookState.contextValue = null;
  });

  it("outputs empty arrays and zero shippingPrice when isAlgeriaRegion is false", () => {
    const element = AlgerianDeliveryProvider({
      children: null,
      locale: LOCALS.EN,
      isAlgeriaRegion: false,
    }) as unknown as ProviderElement;

    expect(mockGetLocalizedWilayas).not.toHaveBeenCalled();
    expect(mockGetLocalizedCommunes).not.toHaveBeenCalled();
    expect(element.props.value).toEqual({
      isAlgeria: false,
      wilayas: [],
      communes: [],
      selectedWilaya: 16,
      setSelectedWilaya: expect.any(Function),
      selectedCommune: null,
      setSelectedCommune: hookState.setters[1],
      isStopDesk: false,
      setIsStopDesk: hookState.setters[2],
      activeRate: null,
      shippingPrice: 0,
      isLoadingRate: false,
    });
  });

  it("loads localized wilayas/communes, sets isLoadingRate true before fetch resolves, and fetches rate", async () => {
    mockGetLocalizedWilayas.mockReturnValue([{ code: 16, name: "الجزائر" }]);
    mockGetLocalizedCommunes.mockReturnValue([{ code: 1601, name: "الجزائر الوسطى" }]);
    mockFetchWilayaRate.mockResolvedValue({
      wilayaCode: 16,
      homePrice: 700,
      deskPrice: 400,
    });

    const element = AlgerianDeliveryProvider({
      children: null,
      locale: LOCALS.AR,
      isAlgeriaRegion: true,
    }) as unknown as ProviderElement;

    expect(mockGetLocalizedWilayas).toHaveBeenCalledWith(LOCALS.AR);
    expect(mockGetLocalizedCommunes).toHaveBeenCalledWith(16, LOCALS.AR);
    expect(element.props.value.isAlgeria).toBe(true);
    expect(element.props.value.isLoadingRate).toBe(true);
    expect(element.props.value.shippingPrice).toBe(0);

    // Run effect and await rate resolution
    const cleanup = hookState.effectCallback?.();
    await vi.waitFor(() => {
      expect(mockFetchWilayaRate).toHaveBeenCalledWith(16);
      expect(hookState.setters[3]).toHaveBeenCalledWith({
        wilayaCode: 16,
        homePrice: 700,
        deskPrice: 400,
      });
    });
    if (typeof cleanup === "function") cleanup();
  });

  it("calculates home vs desk shippingPrice and resets selectedCommune when changing Wilaya", () => {
    mockGetLocalizedWilayas.mockReturnValue([{ code: 16, name: "Alger" }]);
    mockGetLocalizedCommunes.mockReturnValue([]);

    // Pre-populate useState slots: [selectedWilaya, selectedCommune, isStopDesk, activeRate]
    hookState.states = [
      16,
      1601,
      true,
      { wilayaCode: 16, homePrice: 700, deskPrice: 400 },
    ];
    hookState.setters = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];

    const element = AlgerianDeliveryProvider({
      children: null,
      locale: LOCALS.FR,
      isAlgeriaRegion: true,
    }) as unknown as ProviderElement;

    expect(element.props.value.isLoadingRate).toBe(false);
    expect(element.props.value.shippingPrice).toBe(400);

    element.props.value.setSelectedWilaya(31);
    expect(hookState.setters[0]).toHaveBeenCalledWith(31);
    expect(hookState.setters[1]).toHaveBeenCalledWith(null);
  });

  it("throws when useAlgerianDelivery is called outside AlgerianDeliveryProvider", () => {
    hookState.contextValue = null;
    expect(() => useAlgerianDelivery()).toThrow(
      "useAlgerianDelivery must be used within an AlgerianDeliveryProvider"
    );
  });
});
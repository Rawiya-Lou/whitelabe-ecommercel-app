import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlgerianDeliveryProvider } from "../algerian-delivery-provider";
import { LocalizedGeographyNode } from "@/lib/wilayas";
import { LOCALS } from "@/i18n/constants";

const { mockGetLocalizedWilayas } = vi.hoisted(() => {
  return {
    mockGetLocalizedWilayas: vi.fn<() => Promise<LocalizedGeographyNode[]>>(),
  };
});

vi.mock("../lib/wilayas", () => ({
  __esModule: true,
  getLocalizedWilayas: mockGetLocalizedWilayas,
}));

vi.mock("react", async () => {
  const actualReact = await vi.importActual<typeof import("react")>("react");
  return {
    ...actualReact,
    // Safely simulate state array hook allocations without triggering runtime dispatcher exceptions
    useState: (initialState: unknown) => {
      const stateVal =
        typeof initialState === "function" ? initialState() : initialState;
      return [stateVal, vi.fn()];
    },
    // Prevent background effect hook calculations from firing during pure descriptor evaluations
    useEffect: vi.fn(),
    // Allow useMemo to evaluate inline returns natively
    useMemo: (factory: () => unknown) => factory(),
  };
});

interface AlgerianDeliveryContextValue {
  isAlgerianContext: boolean;
  localizedWilayas: LocalizedGeographyNode[];
  isLoading: boolean;
}

interface ReactJSXDescriptorNode {
  props: {
    value: AlgerianDeliveryContextValue;
    children: unknown;
  };
}

describe("Algerian Delivery Context State Provider (Structural Node Traversal)", () => {
  const mockLocale: `${LOCALS}` = LOCALS.EN;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should output correct provider context configurations if isAlgeriaRegion is false", async () => {
    const resultElement = AlgerianDeliveryProvider({
      locale: mockLocale,
      isAlgeriaRegion: false,
      children: "test-child",
    }) as unknown as ReactJSXDescriptorNode;

    expect(resultElement.props.value).toEqual({
      isAlgerianContext: false,
      localizedWilayas: [],
      isLoading: false,
    });

    expect(mockGetLocalizedWilayas).not.toHaveBeenCalled();
  });

  it("should initialize loading true and activate algerian context flag if region context is active", async () => {
    const resultElement = AlgerianDeliveryProvider({
      locale: mockLocale,
      isAlgeriaRegion: true,
      children: "test-child",
    }) as unknown as ReactJSXDescriptorNode;

    expect(resultElement.props.value.isAlgerianContext).toBe(true);
    expect(resultElement.props.value.isLoading).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { routing } from "../routing";
import { LOCALS as locales } from "../constants";

describe("Routing Configuration", () => {
  it("should have the correct routing configuration", () => {
    const localsArr = [locales.EN, locales.FR, locales.AR];
    expect(routing.locales).toEqual(localsArr);
    expect(routing.locales).toContain(locales.EN);
    expect(routing.locales).toContain(locales.FR);
    expect(routing.locales).toContain(locales.AR);
  });
  it("should have the correct default locale", () => {
    expect(routing.defaultLocale).toBe(locales.EN);
  });
});

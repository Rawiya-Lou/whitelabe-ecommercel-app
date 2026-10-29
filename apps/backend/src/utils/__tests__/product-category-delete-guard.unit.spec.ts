import { describe, it, expect } from "vitest";
import { MedusaError } from "@medusajs/framework/utils";
import {
  assertCategoryCanBeDeleted,
  CategoryDeleteCheck,
} from "../product-category-delete-guard";

describe("assertCategoryCanBeDeleted", () => {
  describe("Allowed Deletions (No Products Attached)", () => {
    it("should allow deletion when products array is empty", () => {
      const category: CategoryDeleteCheck = {
        id: "pcat_01",
        name: "Living Room",
        products: [],
      };

      expect(() => assertCategoryCanBeDeleted(category)).not.toThrow();
    });

    it("should allow deletion when products property is undefined", () => {
      const category: CategoryDeleteCheck = {
        id: "pcat_02",
        name: "Dining Room",
        products: undefined,
      };

      expect(() => assertCategoryCanBeDeleted(category)).not.toThrow();
    });

    it("should allow deletion when products property is omitted", () => {
      const category: CategoryDeleteCheck = {
        id: "pcat_03",
        name: "Outdoor",
      };

      expect(() => assertCategoryCanBeDeleted(category)).not.toThrow();
    });
  });

  describe("Blocked Deletions (Products Attached)", () => {
    it("should throw MedusaError with NOT_ALLOWED type when category has 1 product", () => {
      const category: CategoryDeleteCheck = {
        id: "pcat_04",
        name: "Office Desks",
        products: [{ id: "prod_01" }],
      };

      expect(() => assertCategoryCanBeDeleted(category)).toThrow(MedusaError);

      try {
        assertCategoryCanBeDeleted(category);
      } catch (error) {
        expect(error).toBeInstanceOf(MedusaError);
        const medusaError = error as MedusaError;
        expect(medusaError.type).toBe(MedusaError.Types.NOT_ALLOWED);
        expect(medusaError.message).toBe(
          'Cannot delete category "Office Desks" while it contains 1 product(s). Remove or reassign those products first.',
        );
      }
    });

    it("should format the error message with the correct product count for multiple products", () => {
      const category: CategoryDeleteCheck = {
        id: "pcat_05",
        name: "Wooden Chairs",
        products: [
          { id: "prod_01" },
          { id: "prod_02" },
          { id: "prod_03" },
        ],
      };

      expect(() => assertCategoryCanBeDeleted(category)).toThrowError(
        'Cannot delete category "Wooden Chairs" while it contains 3 product(s). Remove or reassign those products first.',
      );
    });

    it("should preserve special characters in category name in the error message", () => {
      const category: CategoryDeleteCheck = {
        id: "pcat_06",
        name: 'Sale & "Clearance" (2026)',
        products: [{ id: "prod_01" }],
      };

      expect(() => assertCategoryCanBeDeleted(category)).toThrowError(
        'Cannot delete category "Sale & "Clearance" (2026)" while it contains 1 product(s). Remove or reassign those products first.',
      );
    });
  });
});
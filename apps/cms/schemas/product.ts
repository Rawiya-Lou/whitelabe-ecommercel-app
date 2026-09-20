// apps/cms/schemaTypes/product.ts
import { defineType, defineField } from "sanity";
import { BasketIcon } from "@sanity/icons/Basket"; // Visual anchor for the studio sidebar

export const product = defineType({
  name: "product",
  title: "Products Catalog",
  type: "document",
  icon: BasketIcon,
  fields: [
    defineField({
      name: "title",
      title: "Product Title",
      type: "localizedString", 
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Unique Handle / Slug",
      type: "slug",
      options: {
        source: "title.en", // Fallback slug tracking from the base English text input string
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "description",
      title: "Product Description",
      type: "localizedText", // Localized text object translation area
    }),
    defineField({
      name: "basePriceDzd",
      title: "Price in Algeria (DZD DA)",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "basePriceEur",
      title: "Price in Europe (EUR €)",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "basePriceUsd",
      title: "Price in North America (USD $)",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "stockCount",
      title: "Available Warehouse Inventory Quantity",
      type: "number",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "weightGrams",
      title: "Product Weight (Grams)",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "categories",
      title: "Associated Categories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "category" }] }],
    }),
  ],
});

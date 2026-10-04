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
      name: "pricing",
      title: "Regional Pricing Configuration",
      type: "object",
      fields: [
        defineField({
          name: "dzd",
          title: "Price in Algeria (DZD)",
          type: "number",
          validation: (Rule) => Rule.required().min(0).precision(2),
        }),
        defineField({
          name: "eur",
          title: "Price in Europe (EUR)",
          type: "number",
          validation: (Rule) => Rule.required().min(0).precision(2),
        }),
        defineField({
          name: "usd",
          title: "Price in North America (USD)",
          type: "number",
          validation: (Rule) => Rule.required().min(0).precision(2),
        }),
      ],
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
      title: "product Categories",
      type: "array",
      validation: (Rule) =>
        Rule.required()
          .min(1)
          .error("Every product must belong to a valid category."),
      of: [{ type: "reference", to: [{ type: "category" }] }],
    }),
    defineField({
      name: "images",
      title: "Product Images",
      type: "array",
      description: "Upload product files",
      of: [
        {
          type: "image",
          options: {
            hotspot: true,
          },
          fields: [
            {
              name: "alt_en",
              type: "string",
              title: "Alternative Text Description (SEO & Accessibility)",
              validation: (Rule) => Rule.required(),
            },
            {
              name: "alt_fr",
              type: "string",
              title: "Alt Text (French)",
              validation: (Rule) => Rule.max(500),
            },
            {
              name: "alt_ar",
              type: "string",
              title: "Alt Text (Arabic)",
              validation: (Rule) => Rule.max(500),
            },
          ],
        },
      ],
    }),
  ],
});

import { defineType, defineField } from "sanity";
import { BasketIcon } from "@sanity/icons/Basket"; // Visual anchor for the studio sidebar

export const product = defineType({
  name: "product",
  title: "Products Catalog",
  type: "document",
  icon: BasketIcon,
  fields: [
    // HIDDEN TRACKING FIELD: Automatically links Sanity data to Medusa's database engine
    defineField({
      name: "medusaId",
      title: "Medusa System Product ID Reference",
      type: "string",
      readOnly: true, // Prevents business owners from accidentally editing this system token
      hidden: ({ document }) => !document?.medusaId, // Only visible once Medusa writes back
    }),
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
      name: "weightGrams",
      title: "Product Weight (Grams)",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "lengthMm",
      title: "Product Length (Millimeters)",
      type: "number",
    }),

    defineField({
      name: "categories",
      title: "product Categories",
      type: "array",
      description:
        "Select all categories this product belongs to. You can add another category here or via Medusa Sync.",
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

    defineField({
      name: "seo",
      title: "Search Engine Optimization (SEO)",
      type: "object",
      description:
        "Custom metadata fields to optimize Google search indexing and social sharing appearance.",
      options: {
        collapsed: true,
        collapsible: true,
      },
      fields: [
        defineField({
          name: "metaTitle",
          title: "Meta Title",
          type: "localizedString", // Aligned with your existing multilingual system
          description:
            "Ideally between 50–60 characters. Defaults to Product Title if left blank.",
        }),
        defineField({
          name: "metaDescription",
          title: "Meta Description",
          type: "localizedText", // Matches your paragraph translation blocks
          description:
            "Ideally between 150–160 characters. Summarize the product hook for search results.",
        }),
        defineField({
          name: "openGraphImage",
          title: "Social Share Image (Open Graph)",
          type: "image",
          description:
            "Custom thumbnail used when this product link is shared on WhatsApp, Facebook, or X.",
          options: {
            hotspot: true,
          },
        }),
        defineField({
          name: "keywords",
          title: "Keywords / Search Tags",
          type: "array",
          of: [{ type: "string" }],
          description:
            "Comma-separated search phrases (e.g., 'organic', 'handmade', 'algeria').",
        }),
      ],
    }),
  ],

  preview: {
    select: { title: "title.en", subtitle: "title.fr", media: "images.0" },
    prepare(selection) {
      const { title, subtitle, media } = selection;
      return {
        title: title || "Untitled Product",
        subtitle: subtitle ? `FR: ${subtitle}` : undefined,
        media: media,
      };
    },
  },
});

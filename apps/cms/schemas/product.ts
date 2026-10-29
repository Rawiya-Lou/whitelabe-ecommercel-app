import { defineType, defineField } from "sanity";
import { BasketIcon } from "@sanity/icons/Basket";

export const product = defineType({
  name: "product",
  title: "Products Catalog",
  type: "document",
  icon: BasketIcon,
  groups: [
    { name: "general", title: "General Info", default: true },
    { name: "pricing", title: "Pricing & Stock" },
    { name: "media", title: "Media" },
    { name: "logistics", title: "Shipping & Customs" },
    { name: "marketing", title: "Marketing & PDP" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({
      name: "medusaId",
      title: "Medusa System Product ID Reference",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.medusaId,
      group: "general",
    }),

    defineField({
      name: "updatedBy",
      title: "Last Sync Origin Provider",
      type: "string",
      hidden: true,
    }),

    defineField({
      name: "title",
      title: "Product Title",
      type: "localizedString",
      group: "general",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "slug",
      title: "Unique Handle / Slug",
      type: "slug",
      options: {
        source: "title.en",
        maxLength: 96,
      },
      group: "general",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "description",
      title: "Product Description",
      type: "localizedText",
      group: "general",
    }),

    defineField({
      name: "productType",
      title: "Product Type",
      type: "string",
      description: "e.g., Perfume, Handbag, Ceramic Plate",
      group: "general",
    }),

    defineField({
      name: "categories",
      title: "Product Categories",
      type: "array",
      group: "general",
      description: "Select all categories this product belongs to.",
      validation: (Rule) => Rule.required().min(1),
      of: [
        {
          type: "reference",
          to: [{ type: "category" }],
          options: {
            disableNew: true,
          },
        },
      ],
    }),

    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      description: "e.g., New Arrival, Organic, Luxury, Traditional",
      group: "general",
    }),

    // 2. INVENTORY (Essential for Medusa)

    defineField({
      name: "manage_inventory",
      title: "Track Inventory",
      type: "boolean",
      initialValue: true,
      group: "pricing",
    }),

    defineField({
      name: "allow_backorder",
      title: "Allow Backorders",
      type: "boolean",
      initialValue: false,
      group: "pricing",
      description: "Allow customers to purchase when stock is 0",
    }),

    // 3. LOGISTICS & CUSTOMS

    defineField({
      name: "material",
      title: "Material / Composition",
      type: "localizedString",
      description: "e.g., 100% Linen, Ceramic, Pure Wool",
      group: "logistics",
    }),

    defineField({
      name: "originCountry",
      title: "Country of Origin",
      type: "string",
      description:
        "2-letter ISO code: DZ (Algeria), FR (France), IT (Italy), TR (Turkey)",
      initialValue: "DZ",
      validation: (Rule) =>
        Rule.max(2)
          .uppercase()
          .error(
            "Must be a valid 2-letter uppercase ISO country code (e.g. DZ, FR)",
          ),
      group: "logistics",
    }),

    // defineField({
    //   name: "weightGrams",
    //   title: "Product Weight (Grams)",
    //   type: "number",
    //   initialValue: 0,
    //   group: "logistics",
    // }),

    // defineField({
    //   name: "lengthMm",
    //   title: "Product Length (mm)",
    //   type: "number",
    //   group: "logistics",
    // }),

    // defineField({
    //   name: "widthMm",
    //   title: "Product Width (mm)",
    //   type: "number",
    //   group: "logistics",
    // }),

    // defineField({
    //   name: "heightMm",
    //   title: "Product Height (mm)",
    //   type: "number",
    //   group: "logistics",
    // }),

    // 4. MARKETING & PDP FEATURES

    defineField({
      name: "highlights",
      title: "Key Selling Highlights",
      type: "array",
      of: [{ type: "localizedString" }],
      description:
        "Short bullet points for PDP (e.g., 'Handcrafted in Algiers', 'Water-resistant')",
      group: "marketing",
    }),

    // 5. MEDIA

    defineField({
      name: "images",
      title: "Product Gallery",
      type: "array",
      description: "Upload product files",
      validation: (Rule) => Rule.required().min(1),
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
              title: "Alt Text (English - Required)",
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
      group: "media",
    }),

    // 6. SEO & SOCIAL SHARING (Consolidated)

    defineField({
      name: "seo",
      title: "Search Engine Optimization (SEO)",
      type: "object",
      group: "seo",
      options: {
        collapsed: false,
        collapsible: true,
      },
      fields: [
        defineField({
          name: "metaTitle",
          title: "Meta Title",
          type: "localizedString",
          description:
            "Ideally between 50–60 characters. Defaults to Product Title if blank.",
        }),
        defineField({
          name: "metaDescription",
          title: "Meta Description",
          type: "localizedText",
          description:
            "Ideally between 150–160 characters. Summarize the product hook.",
        }),
        defineField({
          name: "openGraphImage",
          title: "Social Share Image (Open Graph)",
          type: "image",
          description:
            "Custom preview when link is shared on WhatsApp, Facebook, or X.",
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
            "Search phrases (e.g., 'organic', 'handmade', 'artisan').",
        }),
      ],
    }),
  ],

  // Studio List Preview (Fallback to Arabic if English is absent)
  preview: {
    select: {
      titleEn: "title.en",
      titleFr: "title.fr",
      titleAr: "title.ar",
      media: "images.0",
    },
    prepare(selection) {
      const { titleEn, titleFr, titleAr, media } = selection;
      const primaryTitle = titleEn || titleFr || titleAr || "Untitled Product";
      const secondaryTitle =
        titleFr && titleFr !== primaryTitle ? `FR: ${titleFr}` : undefined;

      return {
        title: primaryTitle,
        subtitle: secondaryTitle,
        media: media,
      };
    },
  },
});

import { defineType, defineField } from "sanity";
import { BasketIcon } from "@sanity/icons/Basket";
import { ImageIcon } from "@sanity/icons/Image";
import { SearchIcon } from "@sanity/icons/Search";
import { PresentationIcon } from "@sanity/icons/Presentation";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";
import { TransferIcon } from "@sanity/icons/Transfer";

export const product = defineType({
  name: "product",
  title: "Products Catalog",
  type: "document",
  icon: BasketIcon,
  groups: [
    {
      name: "general",
      title: "General Info",
      default: true,
      icon: DocumentTextIcon,
    },
    { name: "media", title: "Media", icon: ImageIcon },
    { name: "logistics", title: "Shipping & Customs", icon: TransferIcon },
    { name: "marketing", title: "Marketing & PDP", icon: PresentationIcon },
    { name: "seo", title: "SEO", icon: SearchIcon },
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
      name: "syncOrigin",
      title: "Synchronization Origin",
      type: "string",
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: "correlationId",
      title: "Synchronization Correlation ID",
      type: "string",
      hidden: true,
      readOnly: true,
    }),

    defineField({
      name: "title",
      title: "Product Title",
      type: "localizedString",
      group: "general",
      validation: (Rule) =>
        Rule.required().custom((value: Record<string, unknown>) =>
          typeof value.en === "string" && value.en.trim()
            ? true
            : "An English product title is required.",
        ),
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
          weak: true,
          options: {
            disableNew: false,
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

    defineField({
      name: "material",
      title: "Material / Composition",
      type: "localizedString",
      description: "e.g., 100% Linen, Ceramic, Pure Wool",
      group: "logistics",
    }),

    defineField({
      name: "highlights",
      title: "Key Selling Highlights",
      type: "array",
      of: [{ type: "localizedString" }],
      description:
        "Short bullet points for PDP (e.g., 'Handcrafted in Algiers', 'Water-resistant')",
      group: "marketing",
    }),

    defineField({
      name: "images",
      title: "Product Gallery",
      type: "array",
      description: "Upload product files",
      of: [
        {
          type: "image",
          options: {
            hotspot: true,
          },
          fields: [
            defineField({
              name: "alt",
              title: "Alternative Text",
              type: "localizedString",
            }),
          ],
        },
      ],
      group: "media",
    }),

    defineField({
      name: "variantOptions",
      title: "Variant Option Matrix",
      type: "array",
      group: "general",
      description:
        "Defines variant dimensions and allowed values (for example, Size: S, M, L or Color: Blue, Black). These options describe what distinguishes each sellable variant; Medusa owns the actual variant, SKU, price, and inventory. Create the option values and variant combinations in Medusa first, then sync the product.",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "title", title: "Option", type: "string" }),
            defineField({
              name: "values",
              title: "Values",
              type: "array",
              of: [{ type: "string" }],
            }),
          ],
        },
      ],
    }),

    defineField({
      name: "variants",
      title: "Medusa Variants - Editorial Galleries",
      type: "array",
      group: "media",
      description:
        "Variants are created in Medusa first and appear here after synchronization with their Medusa title, SKU, and options. Do not add variant rows in Sanity. Select an existing Medusa variant row to upload its gallery; all images in the gallery are linked to that variant in Medusa.",
      options: {
        disableActions: ["add", "remove", "duplicate"],
      },
      of: [
        {
          type: "object",
          groups: [
            { name: "editorial", title: "Editorial content & gallery", default: true },
            { name: "identity", title: "Commerce details from Medusa" },
          ],
          fields: [
            defineField({
              name: "medusa_variant_id",
              title: "Medusa Variant ID",
              type: "string",
              readOnly: true,
              hidden: ({ parent }) =>
                !parent?.medusa_variant_id && !parent?.variantId,
              group: "identity",
            }),
            defineField({
              name: "sku",
              title: "SKU (from Medusa)",
              type: "string",
              readOnly: true,
              hidden: ({ parent }) =>
                !parent?.medusa_variant_id && !parent?.variantId,
              group: "identity",
            }),
            defineField({
              name: "title",
              title: "Variant title (from Medusa)",
              type: "string",
              readOnly: true,
              hidden: ({ parent }) =>
                !parent?.medusa_variant_id && !parent?.variantId,
              group: "identity",
            }),
            defineField({
              name: "options",
              title: "Options (from Medusa)",
              type: "array",
              readOnly: true,
              hidden: ({ parent }) =>
                !parent?.medusa_variant_id && !parent?.variantId,
              group: "identity",
              of: [
                {
                  type: "object",
                  fields: [
                    defineField({
                      name: "option",
                      title: "Option",
                      type: "string",
                    }),
                    defineField({
                      name: "value",
                      title: "Value",
                      type: "string",
                    }),
                  ],
                },
              ],
            }),
            defineField({
              name: "optionValues",
              title: "Option Values",
              type: "array",
              hidden: true,
              group: "identity",
              of: [
                {
                  type: "object",
                  fields: [
                    defineField({
                      name: "option",
                      title: "Option",
                      type: "string",
                    }),
                    defineField({
                      name: "value",
                      title: "Value",
                      type: "string",
                    }),
                  ],
                },
              ],
            }),
            defineField({
              name: "description",
              title: "Variant description",
              type: "localizedText",
              group: "editorial",
            }),
            defineField({
              name: "details",
              title: "Additional variant details",
              type: "localizedText",
              description:
                "Editorial PDP content for this variant, such as fit, care, or compatibility notes. This does not define a sellable option, SKU, price, or inventory value.",
              group: "editorial",
            }),
            defineField({
              name: "colorHex",
              title: "Color swatch hex (optional)",
              type: "string",
              description:
                "Optional color chip for storefronts. Upload the full variant imagery in the gallery below.",
              group: "editorial",
              validation: (Rule) =>
                Rule.regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).warning(),
            }),
            defineField({
              name: "badge",
              title: "Merchandising badge",
              type: "localizedString",
              group: "editorial",
            }),
            defineField({
              name: "images",
              title: "Variant gallery",
              type: "array",
              description:
                "Upload one or more images for this exact variant. The first gallery image can also serve as its storefront swatch; there is no separate single-image upload.",
              group: "editorial",
              of: [
                {
                  type: "image",
                  options: { hotspot: true },
                  fields: [
                    defineField({
                      name: "alt",
                      title: "Alternative Text",
                      type: "localizedString",
                    }),
                  ],
                },
              ],
            }),
          ],
          preview: {
            select: {
              title: "title",
              sku: "sku",
              options: "options",
              media: "images.0",
            },
            prepare({ title, sku, options, media }) {
              const optionLabel = Array.isArray(options)
                ? options
                    .map((option) => option?.value)
                    .filter((value): value is string => Boolean(value))
                    .join(" / ")
                : "";
              return {
                title: title || optionLabel || "Variant",
                subtitle: [optionLabel, sku].filter(Boolean).join(" | "),
                media,
              };
            },
          },
        },
      ],
    }),

    defineField({
      name: "seo",
      title: "Search Engine Optimization (SEO)",
      type: "object",
      group: "seo",
      description:
        "Custom metadata fields to optimize Google search indexing and social sharing appearance.",
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
          fields: [
            defineField({
              name: "alt",
              title: "Alternative Text",
              type: "localizedString",
            }),
          ],
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

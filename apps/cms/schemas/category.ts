import { defineType, defineField } from "sanity";
import { TagIcon } from "@sanity/icons/Tag"; // Functional visual anchor for the sidebar icon

export const category = defineType({
  name: "category",
  title: "Product Categories",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({
      name: "medusaId",
      title: "Medusa System Category ID Reference",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.medusaId, // Only shows up once linked programmatically
    }),

    defineField({
      name: "title",
      title: "Category Title",
      type: "localizedString",
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
      validation: (Rule) => Rule.required(),
    }),
     defineField({
      name: "categoryImage",
      title: "Category Thumbnail / Banner Image",
      type: "image",
      description: "Rich promotional banner asset used on collection landing grid elements across the storefront layout.",
      options: {
        hotspot: true,
      },
    }),

     defineField({
      name: "subCategories",
      title: "Sub-Categories Mapped Under This Collection",
      type: "array",
      of: [{ type: "reference", to: [{ type: "category" }] }],
      description: "Organize parent-child hierarchies visually for your storefront dropdown navigation bars.",
    }),

    defineField({
      name: "seo",
      title: "Search Engine Optimization (SEO)",
      type: "object",
      options: {
        collapsed: true,
        collapsible: true,
      },
      fields: [
        defineField({
          name: "metaTitle",
          title: "Meta Title",
          type: "localizedString", // Keeps translation tags aligned across your layout structures
          description: "Defaults to Category Title if left blank.",
        }),
        defineField({
          name: "metaDescription",
          title: "Meta Description",
          type: "localizedText",
          description:
            "Summarize this collection for Google search result clips.",
        }),
      ],
    }),

  ],

  preview: {
    select: { title: "title.en" },
    prepare({ title }) {
      return { title: title || "Untitled Category" };
    },
  },
});

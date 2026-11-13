import { defineType, defineField } from "sanity";
import { PackageIcon } from "@sanity/icons/Package";

export const featuredProducts = defineType({
  name: "featuredProducts",
  title: "Featured Products Grid",
  type: "object",
  icon: PackageIcon,
  description: "Showcase a curated selection of products or an entire category on your homepage. Choose between manual product selection or syncing an entire category from Medusa",
  groups: [
   { name: "content", title: "Content", default: true },
   { name: "settings", title: "Settings" },
  ],
  fields: [
    defineField({
      name: "heading",
      title: "Section Heading",
      type: "localizedString",
      description: "The main heading for the featured products section, e.g., 'Featured Products' or 'New Arrivals'.",
      group: "content",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "subheading",
      title: "Section Subheading",
      group: "content",
      description: "Optional subheading for additional context or promotional messaging.",
      type: "localizedString",
    }),
    defineField({
      name: "selectionMode",
      title: "Source Selection",
      type: "string",
      description: "Choose how to populate the featured products section: manually select products or sync an entire category from Medusa.",
      group: "settings",
      options: {
        list: [
          { title: "Manual Product Selection", value: "manual" },
          { title: "Entire Category (Synced from Medusa)", value: "category" },
        ],
        layout: "radio",
      },
      initialValue: "manual",
    }),
    defineField({
      name: "products",
      title: "Curated Products",
      description: "Select specific products to feature in this section. This field is only visible when 'Manual Product Selection' is chosen.",
      group: "content",
      type: "array",
      of: [{ type: "reference", to: [{ type: "product" }] }],
      hidden: ({ parent }) => parent?.selectionMode !== "manual",
    }),
    defineField({
      name: "category",
      title: "Target Category",
      type: "reference",
      description: "Select a category to automatically sync and display all its products in this section. This field is only visible when 'Entire Category' is chosen.",
        group: "content",
      to: [{ type: "category" }],
      hidden: ({ parent }) => parent?.selectionMode !== "category",
    }),
    defineField({
      name: "limit",
      title: "Max Products Displayed",
      description: "Set the maximum number of products to display in this section. This field is only visible when 'Entire Category' is chosen.",
      group: "settings",
      hidden: ({ parent }) => parent?.selectionMode !== "category",
      type: "number",
      initialValue: 8,
      validation: (Rule) => Rule.min(2).max(24),
    }),
  ],
  preview: {
    select: {
      title: "heading.en",
      mode: "selectionMode",
    },
    prepare({ title, mode }) {
      return {
        title: title || "Products Showcase",
        subtitle: `Mode: ${mode}`,
      };
    },
  },
});
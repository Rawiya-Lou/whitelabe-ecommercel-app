import { defineField, defineType } from "sanity";
import { ComponentIcon } from "@sanity/icons/Component";

export const themeSettings = defineType({
  name: "themeSettings",
  title: "Theme & Design Tokens",
  type: "document",
  icon: ComponentIcon,
  description: "Live design tokens injected directly into the storefront's CSS variables.",
  groups: [
    { name: "colors", title: "Brand Colors", default: true },
    { name: "layout", title: "Layout & Spacing" },
    { name: "typography", title: "Typography" },
  ],
  fields: [
    defineField({
      name: "primaryColor",
      title: "Primary Accent Color",
      type: "string",
      group: "colors",
      description: "Hex format (e.g. #0F766E). Applied to primary buttons and active indicators.",
      validation: (Rule) =>
        Rule.required().regex(/^#([0-9a-fA-F]{3}){1,2}$/, {
          name: "hex",
          invert: false,
        }),
    }),

    defineField({
      name: "accentColor",
      title: "Secondary / Sale Highlight Color",
      type: "string",
      group: "colors",
      description: "Hex format (e.g. #E11D48). Applied to sale badges and alerts.",
      validation: (Rule) =>
        Rule.regex(/^#([0-9a-fA-F]{3}){1,2}$/, {
          name: "hex",
          invert: false,
        }),
    }),

    defineField({
      name: "backgroundColor",
      title: "Base Page Background",
      type: "string",
      group: "colors",
      initialValue: "#FFFFFF",
      validation: (Rule) =>
        Rule.regex(/^#([0-9a-fA-F]{3}){1,2}$/, {
          name: "hex",
          invert: false,
        }),
    }),

    defineField({
      name: "borderRadius",
      title: "Global Element Roundness",
      type: "string",
      group: "layout",
      options: {
        list: [
          { title: "Sharp Edges (0px)", value: "0px" },
          { title: "Subtle (rounded-sm - 4px)", value: "0.25rem" },
          { title: "Standard Modern (rounded-md - 8px)", value: "0.5rem" },
          { title: "Curved (rounded-xl - 16px)", value: "1rem" },
          { title: "Full Pill (rounded-full - 9999px)", value: "9999px" },
        ],
      },
      initialValue: "0.5rem",
    }),

    defineField({
      name: "fontHeading",
      title: "Heading Font Family",
      type: "string",
      group: "typography",
      options: {
        list: [
          { title: "Inter (Clean Modern Sans)", value: "var(--font-inter)" },
          { title: "Cairo (Optimized Arabic/Latin Modern)", value: "var(--font-cairo)" },
          { title: "Playfair Display (Editorial Luxury Serif)", value: "var(--font-playfair)" },
        ],
      },
      initialValue: "var(--font-cairo)",
    }),
  ],
  preview: {
    prepare() {
      return {
        title: "Active Design Tokens",
        subtitle: "Global colors, border radius, and fonts",
      };
    },
  },
});
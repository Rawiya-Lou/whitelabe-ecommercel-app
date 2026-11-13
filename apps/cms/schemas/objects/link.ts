import { defineField, defineType } from "sanity";
import { LinkIcon } from "@sanity/icons/Link";

/* Navigation, banners, and buttons all require a unified link model that cleanly distinguishes internal routes from external URLs without breaking Next.js hydration */

export const link = defineType({
  name: "link",
  title: "Link",
  type: "object",
  icon: LinkIcon,
  fields: [
    defineField({
      name: "type",
      title: "Link Type",
      type: "string",
      options: {
        list: [
          { title: "Internal Page / Catalog", value: "internal" },
          { title: "External URL", value: "external" },
        ],
        layout: "radio",
      },
      initialValue: "internal",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "internalReference",
      title: "Internal Target",
      type: "reference",
      to: [{ type: "page" }, { type: "product" }, { type: "category" }],
      hidden: ({ parent }) => parent?.type !== "internal",
    }),

    defineField({
      name: "customPath",
      title: "Direct Internal Path",
      type: "string",
      description: "e.g., /cart, /checkout, or /account (overrides reference if set)",
      hidden: ({ parent }) => parent?.type !== "internal",
    }),

    defineField({
      name: "externalUrl",
      title: "External URL",
      type: "url",
      placeholder: "https://instagram.com/yourbrand",
      validation: (Rule) =>
        Rule.uri({
          scheme: ["http", "https", "mailto", "tel"],
        }),
      hidden: ({ parent }) => parent?.type !== "external",
    }),

    defineField({
      name: "openInNewTab",
      title: "Open in new window",
      type: "boolean",
      initialValue: false,
      hidden: ({ parent }) => parent?.type !== "external",
    }),
  ],
});
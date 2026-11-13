import { defineField, defineType } from "sanity";
import { MenuIcon } from "@sanity/icons/Menu";

export const navigation = defineType({
  name: "navigation",
  title: "Navigation & Menus",
  type: "document",
  icon: MenuIcon,
  groups: [
    { name: "header", title: "Header Menu", default: true },
    { name: "footer", title: "Footer Structure" },
  ],
  fields: [
    defineField({
      name: "headerNav",
      title: "Header Navigation Items",
      group: "header",
      type: "array",
      of: [
        {
          type: "object",
          name: "navItem",
          title: "Navigation Item",
          fields: [
            defineField({
              name: "label",
              title: "Display Label",
              type: "localizedString",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "link",
              title: "Link Target",
              type: "link",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "badge",
              title: "Optional Callout Badge",
              type: "localizedString",
              description: "e.g., 'New' / 'Sale' / 'Promo'",
            }),
          ],
          preview: {
            select: {
              title: "label.en",
              subtitle: "link.customPath",
            },
            prepare({ title, subtitle }) {
              return {
                title: title || "Navigation Link",
                subtitle: subtitle || "Dynamic Target",
              };
            },
          },
        },
      ],
    }),

    defineField({
      name: "footerColumns",
      title: "Footer Columns",
      group: "footer",
      type: "array",
      of: [
        {
          type: "object",
          name: "footerColumn",
          title: "Footer Column",
          fields: [
            defineField({
              name: "title",
              title: "Column Header",
              type: "localizedString",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "links",
              title: "Column Links",
              type: "array",
              of: [
                {
                  type: "object",
                  fields: [
                    defineField({ name: "label", type: "localizedString", validation: (Rule) => Rule.required() }),
                    defineField({ name: "link", type: "link", validation: (Rule) => Rule.required() }),
                  ],
                },
              ],
            }),
          ],
        },
      ],
    }),

    defineField({
      name: "socialLinks",
      title: "Social Media Accounts",
      group: "footer",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "platform",
              title: "Platform",
              type: "string",
              options: {
                list: [
                  { title: "Instagram", value: "instagram" },
                  { title: "Facebook", value: "facebook" },
                  { title: "TikTok", value: "tiktok" },
                  { title: "WhatsApp Direct", value: "whatsapp" },
                ],
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "url",
              title: "Profile / Contact Link",
              type: "url",
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
      ],
    }),
  ],
  preview: {
    prepare() {
      return {
        title: "Store Navigation",
        subtitle: "Header links, footer columns, and socials",
      };
    },
  },
});
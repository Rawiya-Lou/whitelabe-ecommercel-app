import { defineType, defineField } from "sanity";
import { TranslateIcon } from "@sanity/icons/Translate";

// 1. Strict Contract for Array Items (No "any")
export interface UIItem {
  _key?: string;
  key?: string;
  context?: string;
  value?: {
    en?: string;
    fr?: string;
    ar?: string;
    [key: string]: string | undefined;
  };
}

export const uiTranslation = defineType({
  name: "uiTranslation",
  title: "UI & Button Translations",
  type: "document",
  icon: TranslateIcon,
  fields: [
    defineField({
      name: "namespace",
      title: "Namespace / Feature Area",
      type: "string",
      options: {
        list: [
          { title: "Common (Buttons, Alerts, Statuses)", value: "common" },
          { title: "Navbar & Header", value: "navigation" },
          { title: "Footer & Legal", value: "footer" },
          { title: "Sections (Hero, Trending, Banners)", value: "sections" },
          { title: "Catalog & Product Details", value: "product" },
          { title: "Cart & Checkout Flow", value: "cart" },
          { title: "SEO & Social Sharing Meta", value: "metadata" },
          { title: "Pages & Errors (404, Confirmation)", value: "pages" },
          { title: "Account & Auth", value: "account" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "items",
      title: "UI Copy Items",
      type: "array",
      // 2. Strict Custom Validator without "any"
      validation: (Rule) =>
        Rule.custom((items: UIItem[] | undefined) => {
          if (!items || items.length === 0) return true;

          const keys = items
            .map((item) => item.key?.trim().toLowerCase())
            .filter((k): k is string => Boolean(k));

          const duplicates = keys.filter(
            (k, index) => keys.indexOf(k) !== index
          );

          if (duplicates.length > 0) {
            return `Duplicate key detected: "${duplicates[0]}". All machine keys must be unique.`;
          }

          return true;
        }),
      of: [
        {
          type: "object",
          name: "uiItem",
          title: "Translation Item",
          fields: [
            defineField({
              name: "key",
              title: "Code Key",
              type: "string",
              validation: (Rule) =>
                Rule.required().regex(/^[a-zA-Z0-9_.-]+$/, {
                  name: "validKey",
                  invert: false,
                }),
            }),
            defineField({
              name: "context",
              title: "Translator Context",
              type: "string",
            }),
            defineField({
              name: "value",
              title: "Translations",
              type: "localizedString",
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
      ],
    }),
  ],
});
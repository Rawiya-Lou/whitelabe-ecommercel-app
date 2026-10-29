import { defineType, defineField } from "sanity";
import { TranslateIcon } from "@sanity/icons/Translate";

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
      description: "Group UI strings by feature or screen.",
      options: {
        list: [
          { title: "Common & Generic (Buttons, Modals, Errors)", value: "common" },
          { title: "Navigation & Footer", value: "navigation" },
          { title: "Cart & Checkout", value: "cart" },
          { title: "Product Detail & Catalog", value: "product" },
          { title: "Customer Account & Auth", value: "account" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "items",
      title: "UI Copy Items",
      type: "array",
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
              description: "The machine identifier used in code (e.g. 'addToCart', 'subtotal').",
              validation: (Rule) =>
                Rule.required().regex(/^[a-zA-Z0-9_.-]+$/, {
                  name: "validKey",
                  invert: false,
                }).error("Keys can only contain letters, numbers, dots, dashes, and underscores."),
            }),
            defineField({
              name: "context",
              title: "Translator Context / Notes",
              type: "string",
              description: "Explain to translators where and how this text is used.",
            }),
            defineField({
              name: "value",
              title: "Translations",
              type: "localizedString",
              validation: (Rule) => Rule.required(),
            }),
          ],
          preview: {
            select: {
              title: "key",
              subtitle: "value.en",
              context: "context",
            },
            prepare({ title, subtitle, context }) {
              return {
                title: title || "Untitled Key",
                subtitle: subtitle ? `EN: "${subtitle}"` : context || "No English preview",
              };
            },
          },
        },
      ],
    }),
  ],

  preview: {
    select: {
      namespace: "namespace",
      items: "items",
    },
    prepare({ namespace, items }) {
      const count = items?.length || 0;
      return {
        title: namespace ? `${namespace.toUpperCase()} Namespace` : "Unassigned Namespace",
        subtitle: `${count} translation key(s) registered`,
      };
    },
  },
});
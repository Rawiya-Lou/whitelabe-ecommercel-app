import React from "react";
import { defineType, defineField } from "sanity";
const RtlInput = (props: any) =>
  React.createElement(
    "div",
    { dir: "rtl", style: { textAlign: "right" } },
    props.renderDefault(props),
  );

export const localizedString = defineType({
  title: "Localized String",
  name: "localizedString",
  type: "object",
  fieldsets: [
    {
      name: "translations",
      title: "Additional Languages (Translations)",
      options: { collapsible: true, collapsed: false },
    },
  ],
  fields: [
    defineField({
      title: "English (Default)",
      name: "en",
      type: "string",
      placeholder: "e.g. Solid Wood Desk",
      validation: (Rule) =>
        Rule.required().error(
          "English is the primary fallback and must be provided.",
        ),
    }),
    defineField({
      title: "French (Français)",
      name: "fr",
      type: "string",
      fieldset: "translations",
      placeholder: "e.g. Bureau en bois massif",
    }),
    defineField({
      title: "Arabic (العربية)",
      name: "ar",
      type: "string",
      fieldset: "translations",
      placeholder: "مثال: مكتب خشبي صلب",
      components: {
        input: RtlInput,
      },
    }),
  ],

  preview: {
    select: {
      en: "en",
      fr: "fr",
      ar: "ar",
    },
    prepare({ en, fr, ar }) {
      return {
        title: en || fr || ar || "Empty translation",
        subtitle:
          [fr && "FR", ar && "AR"].filter(Boolean).join(" • ") || "EN only",
      };
    },
  },
});

export const localizedText = defineType({
  title: "Localized Text",
  name: "localizedText",
  type: "object",
  fieldsets: [
    {
      name: "translations",
      title: "Additional Languages (Translations)",
      options: { collapsible: true, collapsed: false },
    },
  ],
  fields: [
    defineField({
      title: "English (Default)",
      name: "en",
      type: "text",
      rows: 3,
      placeholder: "Enter English description...",
      validation: (Rule) =>
        Rule.required().error(
          "English description is required as primary fallback.",
        ),
    }),
    defineField({
      title: "French (Français)",
      name: "fr",
      type: "text",
      rows: 3,
      fieldset: "translations",
      placeholder: "Entrez la description en français...",
    }),
    defineField({
      title: "Arabic (العربية)",
      name: "ar",
      type: "text",
      rows: 3,
      fieldset: "translations",
      placeholder: "أدخل الوصف بالعربية...",
      components: {
        input: RtlInput,
      },
    }),
  ],

  preview: {
    select: {
      en: "en",
      fr: "fr",
      ar: "ar",
    },
    prepare({ en, fr, ar }) {
      return {
        title: en || fr || ar || "Empty translation",
        subtitle:
          [fr && "FR", ar && "AR"].filter(Boolean).join(" • ") || "EN only",
      };
    },
  },
});

import { defineType, defineField } from "sanity";

export default defineType({
  name: "uiTranslation",
  title: "UI Translation",
  type: "document",
  fields: [
    defineField({
      name: "locale",
      title: "Locale Code",
      type: "string",
      options: {
        list: [
          { title: "French (FR)", value: "fr" },
          { title: "Arabic (AR)", value: "ar" },
          { title: "English (EN)", value: "en" },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "messages",
      title: "Messages JSON Object",
      type: "code",
      options: {
        language: "json",
      },
      description:
        "Nested JSON containing UI keys (e.g. Common.welcome, Common.currency)",
    }),
  ],
});

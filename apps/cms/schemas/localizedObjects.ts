import { defineType, defineField } from "sanity";

export const localizedString = defineType({
  title: "Localized String",
  name: "localizedString",
  type: "object",
  fieldsets: [
    { name: "translations", title: "Translations", options: { collapsible: true, collapsed: false } }
  ],
  fields: [
    defineField({ title: "English (EN)", name: "en", type: "string" }),
    defineField({ title: "French (FR)", name: "fr", type: "string", fieldset: "translations" }),
    defineField({ title: "Arabic (AR)", name: "ar", type: "string", fieldset: "translations", options: { direction: "vertical"  } }),
  ],
});

export const localizedText = defineType({
  title: "Localized Text",
  name: "localizedText",
  type: "object",
  fieldsets: [
    { name: "translations", title: "Translations", options: { collapsible: true, collapsed: false } }
  ],
  fields: [
    defineField({ title: "English (EN)", name: "en", type: "text" }),
    defineField({ title: "French (FR)", name: "fr", type: "text", fieldset: "translations" }),
    defineField({ title: "Arabic (AR)", name: "ar", type: "text", fieldset: "translations", options: { direction: "vertical"  } }),
  ],
});

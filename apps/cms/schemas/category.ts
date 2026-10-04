import { defineType, defineField } from "sanity";
import { TagIcon } from "@sanity/icons/Tag"; // Functional visual anchor for the sidebar icon

export const category = defineType({
  name: "category",
  title: "Product Categories",
  type: "document",
  icon: TagIcon,
  fields: [
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
  ],
  preview: {
    select: { title: "title.en" },
    prepare({ title }) {
      return { title: title || "Untitled Category" };
    },
  },
});

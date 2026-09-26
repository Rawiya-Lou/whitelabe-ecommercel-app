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
      type: "string", // Flat string used for administrative clarity
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Unique Handle / Slug",
      type: "slug",
      options: {
        source: "title",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
  ],
});

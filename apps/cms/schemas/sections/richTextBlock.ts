import { defineType, defineField } from "sanity";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";

export const richTextBlock = defineType({
  name: "richTextBlock",
  title: "Rich Editorial Narrative",
  type: "object",
  icon: DocumentTextIcon,
  description: "A rich text block for multi-paragraph content, allowing for headings, lists, links, and other formatting options.",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "settings", title: "Settings" },
  
  ],
  fields: [
    defineField({
      name: "content",
      title: "Content",
      type: "localizedText",
      group: "content",
      description: "Multi-paragraph localized brand story block.",
    }),
    defineField({
      name: "alignment",
      title: "Text Alignment",
      type: "string",
      group: "settings",
      description: "The alignment of the text within the block.",
      options: {
        list: [
          { title: "Left / Start", value: "start" },
          { title: "Center", value: "center" },
        ],
        layout: "radio",
      },
      initialValue: "start",
    }),
  ],
  preview: {
    select: {
      title: "content.en",
    },
    prepare({ title }) {
      return {
        title: title ? title.slice(0, 40) + "..." : "Editorial Block",
        subtitle: "Localized text block",
      };
    },
  },
});
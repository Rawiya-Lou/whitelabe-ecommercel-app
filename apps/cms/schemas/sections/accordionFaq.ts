import { defineType, defineField } from "sanity";
import { HelpCircleIcon } from "@sanity/icons/HelpCircle";

export const accordionFaq = defineType({
  name: "accordionFaq",
  title: "FAQ & Reassurance Accordion",
  type: "object",
  description: "A section for frequently asked questions and reassurance points, presented in an accordion format for easy navigation.",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "settings", title: "Settings" },
  ],
  icon: HelpCircleIcon,
  fields: [
    defineField({
      name: "heading",
      title: "Section Title",
      type: "localizedString",
      initialValue: {
        en: "Frequently Asked Questions",
        fr: "Questions Fréquentes",
        ar: "الأسئلة الشائعة",
      },
      group: "content",
        description: "The main heading for the FAQ section, e.g., 'Frequently Asked Questions' or 'Customer Support'.",
    }),
    defineField({
      name: "items",
      title: "FAQ Items",
      type: "array",
      group: "content",
      description: "A list of questions and answers to be displayed in the accordion. Each item should have a question and a corresponding answer.",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "question",
              title: "Question",
              type: "localizedString",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "answer",
              title: "Answer",
              type: "localizedText",
              validation: (Rule) => Rule.required(),
            }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: "heading.en",
    },
    prepare({ title }) {
      return {
        title: title || "FAQ Section",
        subtitle: "Expandable questions and answers",
      };
    },
  },
});
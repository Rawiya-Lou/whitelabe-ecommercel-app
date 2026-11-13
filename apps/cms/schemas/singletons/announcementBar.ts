import { defineField, defineType } from "sanity";
import { BellIcon } from "@sanity/icons/Bell";

export const announcementBar = defineType({
  name: "announcementBar",
  title: "Announcement Bar",
  type: "document",
  icon: BellIcon,
  fields: [
    defineField({
      name: "enabled",
      title: "Display Banner",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "message",
      title: "Banner Announcement",
      type: "localizedString",
      description: "e.g., 'Free delivery across all 58 Wilayas for orders over 10,000 DZD'",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "link",
      title: "Action Link (Optional)",
      type: "link",
    }),
    defineField({
      name: "highlight",
      title: "Use Inverted Brand Color",
      type: "boolean",
      description: "Uses the accent color instead of default navbar background.",
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: "message.en",
      enabled: "enabled",
    },
    prepare({ title, enabled }) {
      return {
        title: title || "Announcement Bar",
        subtitle: enabled ? "Active on storefront" : "Disabled",
      };
    },
  },
});
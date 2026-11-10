// apps/cms/schemas/heroSection.ts
import { defineType, defineField } from "sanity";
import { BlockElementIcon } from "@sanity/icons/BlockElement";

export const heroSection = defineType({
  name: "heroSection",
  title: "Homepage Hero Banner",
  type: "document",
  icon: BlockElementIcon,
  description: "The hero section is the first visual element on your homepage, often featuring a large banner image, headline, and call-to-action button.",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "media", title: "Media" },
  ],
  fields: [
    defineField({
      name: "badgeText",
      title: "Badge / Eyebrow Text",
      type: "localizedString",
      group: "content",
      description: "e.g., 'New Collection 2026' or 'Limited Edition'",
    }),

    defineField({
      name: "title",
      title: "Hero Headline",
      type: "localizedString",
      group: "content",
      description: "Large bold typography on the homepage.",
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "subtitle",
      title: "Hero Subtitle / Description",
      group: "content",
      type: "localizedText",
    }),

    defineField({
      name: "ctaText",
      title: "Primary Button Label",
      type: "localizedString",
      group: "content",
      description: "e.g., 'Shop The Collection' or 'Discover Now'",
    }),

    defineField({
      name: "heroImage",
      title: "Hero Banner Image",
      type: "image",
      description: "High-resolution banner (aspect ratio 4:3 or 16:9).",
      group: "media",
      options: {
        hotspot: true, // Enables visual focal-point cropping in Sanity Studio
      },
      validation: (Rule) => Rule.required(),
      fields: [
        defineField({
          name: "alt",
          title: "Image Alt Text",
          type: "localizedString",
          description: "Accessibility text for screen readers.",
          validation: (Rule) => Rule.required(),
        }),
      ],
    }),
  ],

  preview: {
    select: {
      title: "title.en",
      subtitle: "badgeText.en",
      media: "heroImage",
    },
    prepare({ title, subtitle, media }) {
      return {
        title: title || "Untitled Hero Banner",
        subtitle: subtitle || "Homepage Banner",
        media,
      };
    },
  },
});
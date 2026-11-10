import { defineField, defineType } from "sanity";
import { SearchIcon } from "@sanity/icons/Search";

export const seo = defineType({
  name: "pageSeo",
  title: "SEO & Social Sharing (OpenGraph)",
  type: "object",
  icon: SearchIcon,
  description: "Search engine and social media metadata for this page.",
  fields: [
    defineField({
      name: "metaTitle",
      title: "Social / Search Title",
      type: "localizedString",
      description:
        "Appears on Google, Facebook, WhatsApp, and Twitter share cards.",
      validation: (Rule) =>
        Rule.custom((title: Record<string, string>) => {
          if (title?.en && title.en.length > 70) {
            return "Warning: Titles over 70 characters may get truncated on Google.";
          }
          return true;
        }),
    }),
    defineField({
      name: "metaDescription",
      title: "Social / Search Description",
      type: "localizedText",
      description: "Brief summary shown on search engines and social feeds.",
    }),
    defineField({
      name: "ogImage",
      title: "Social Share Image (OpenGraph / Twitter)",
      type: "image",
      description:
        "Recommended size: 1200x630px. If left empty, global site fallback is used.",
      options: {
        hotspot: true,
      },
    }),

    // Allows clients to hide landing pages, seasonal promotions, or private wholesale
    defineField({
      name: "noIndex",
      title: "Hide from Search Engines (noindex)",
      type: "boolean",
      description:
        "Turn on to prevent Google/Bing from indexing this specific page.",
      initialValue: false,
    }),
  ],
});

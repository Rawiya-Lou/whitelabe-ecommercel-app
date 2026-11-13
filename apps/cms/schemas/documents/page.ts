import { defineField, defineType } from "sanity";
import { DocumentIcon } from "@sanity/icons/Document";

export const page = defineType({
  name: "page",
  title: "Pages",
  type: "document",
  icon: DocumentIcon,
  description: "Create and manage individual pages for your website. Each page can have a unique layout, content, and SEO settings.",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({
      name: "title",
      title: "Internal Name",
      type: "string",
      group: "content",
      description: "The internal name for this page, used for identification within the CMS. This will not be displayed on the website.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Route Slug",
      type: "slug",
      group: "content",
      description: "The URL path for this page, e.g., 'about-us' or 'contact'. This will be used to generate the page's route on the website.",
      options: { source: "title", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "sections",
      title: "Page Builder Sections",
      group: "content",
      description: "Add and arrange sections to build the content of this page. You can choose from various section types like hero banners, product grids, FAQs, and rich text blocks.",
      type: "array",
      of: [
        { type: "heroSection" },
        { type: "featuredProducts" },
        { type: "accordionFaq" },
        { type: "richTextBlock" },
      ],
    }),
    defineField({
      name: "seo",
      title: "Page SEO Overrides",
      group: "seo",
      description: "Optional SEO settings for this page. If left blank, the default site-wide SEO settings will be used.",
      type: "pageSeo",
    }),
  ],
  preview: {
    select: {
      title: "title",
      slug: "slug.current",
    },
    prepare({ title, slug }) {
      return {
        title,
        subtitle: slug ? `/${slug}` : "Missing route slug",
      };
    },
  },
});
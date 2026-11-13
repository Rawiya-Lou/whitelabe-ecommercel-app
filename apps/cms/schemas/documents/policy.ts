import { defineField, defineType } from "sanity";
import { CaseIcon } from "@sanity/icons/Case";

export const policy = defineType({
  name: "policy",
  title: "Legal & Store Policies",
  type: "document",
  description: "Create and manage legal and store policies for your website, such as privacy policies, terms of service, and return policies. Each policy can have a unique title, content, and effective date.",
  groups: [
    { name: "content", title: "Content", default: true },
    { name: "settings", title: "Settings" },
  ],
  icon: CaseIcon,
  fields: [
    defineField({
      name: "title",
      title: "Policy Title",
      type: "localizedString",
      group: "content",
      description: "The title of the policy, e.g., 'Privacy Policy', 'Terms of Service', or 'Return Policy'.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "URL Slug",
      type: "slug",
      group: "content",
      description: "The URL path for this policy, e.g., 'privacy-policy' or 'terms-of-service'.",
      options: {
        source: "title.en",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "content",
      title: "Policy Terms & Details",
      type: "localizedText",
      group: "content",
      description: "The detailed terms and conditions for the policy.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "lastUpdated",
      title: "Effective Date",
      type: "date",
      group: "settings",
      description: "The date from which the policy becomes effective.",
      options: { dateFormat: "YYYY-MM-DD" },
      initialValue: () => new Date().toISOString().split("T")[0],
    }),
  ],
  preview: {
    select: {
      title: "title.en",
      slug: "slug.current",
      date: "lastUpdated",
    },
    prepare({ title, slug, date }) {
      return {
        title: title || "Untitled Policy",
        subtitle: `/${slug} • Updated: ${date || "N/A"}`,
      };
    },
  },
});
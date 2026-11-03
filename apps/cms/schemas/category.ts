import { defineType, defineField } from "sanity";
import { TagIcon } from "@sanity/icons/Tag";
import { ImageIcon } from "@sanity/icons/Image";
import { SearchIcon } from "@sanity/icons/Search";
import { CogIcon } from "@sanity/icons/Cog";
import { DocumentTextIcon } from "@sanity/icons/DocumentText";

export const category = defineType({
  name: "category",
  title: "Category",
  type: "document",
  icon: TagIcon,
  groups: [
    {
      name: "general",
      title: "General Info",
      icon: DocumentTextIcon,
      default: true,
    },
    { name: "media", title: "Media", icon: ImageIcon },
    { name: "hierarchy", title: "Hierarchy", icon: TagIcon },
    { name: "seo", title: "SEO & Social", icon: SearchIcon },
    { name: "system", title: "System & Sync", icon: CogIcon },
  ],

  fields: [
    defineField({
      name: "title",
      title: "Category Title",
      type: "localizedString",
      group: "general",
      description:
        "Primary category name displayed across storefront menus and cards.",
      validation: (Rule) =>
        Rule.required().custom((value: Record<string, unknown>) =>
          typeof value?.en === "string" && value.en.trim()
            ? true
            : "An English category title is required.",
        ),
    }),

    defineField({
      name: "slug",
      title: "URL Slug / Handle",
      type: "slug",
      group: "general",
      description: "Unique URL identifier synced to Medusa handle.",
      options: {
        source: (doc) => {
          const titleObj = doc?.title as Record<string, string> | undefined;
          return titleObj?.en || titleObj?.fr || titleObj?.ar || "";
        },
        maxLength: 96,
        slugify: (input) =>
          input
            .toLowerCase()
            .trim()
            .replace(/_/g, "-")
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 96),
      },
      validation: (Rule) =>
        Rule.required().custom((slug) => {
          if (!slug?.current)
            return "A slug is required to generate storefront URLs.";
          if (/[_]/.test(slug.current)) {
            return "Underscores (_) are not allowed. Please use hyphens (-).";
          }
          return true;
        }),
    }),

    defineField({
      name: "description",
      title: "Category Description",
      type: "localizedText",
      group: "general",
      description:
        "Optional introductory text displayed at the top of the collection page.",
    }),

    defineField({
      name: "categoryImage",
      title: "Category Image / Banner",
      type: "image",
      group: "media",
      description:
        "Thumbnail card and banner header image for this collection.",
      options: {
        hotspot: true,
      },
      fields: [
        defineField({
          name: "alt",
          title: "Alternative Text (Accessibility & SEO)",
          type: "localizedString",
          description:
            "Describe the image for screen readers and search engines.",
        }),
      ],
    }),

    defineField({
      name: "updatedBy",
      title: "Last Sync Origin Provider",
      type: "string",
      hidden: true,
    }),
    defineField({
      name: "syncOrigin",
      title: "Synchronization Origin",
      type: "string",
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: "correlationId",
      title: "Synchronization Correlation ID",
      type: "string",
      hidden: true,
      readOnly: true,
    }),

    defineField({
      name: "subCategories",
      title: "Sub-Categories",
      type: "array",
      group: "hierarchy",
      description:
        "Child categories nested under this collection in storefront menus.",
      of: [
        {
          type: "reference",
          to: [{ type: "category" }],
          weak: true,
          options: {
            // Guard: Prevents editors from referencing this document as its own child
            filter: ({ document }) => {
              const currentId = document?._id?.replace(/^drafts\./, "");
              const draftId = `drafts.${currentId}`;
              return {
                filter: "!(_id in [$currentId, $draftId])",
                params: { currentId, draftId },
              };
            },
          },
        },
      ],
    }),

    defineField({
      name: "seo",
      title: "Search Engine Optimization (SEO)",
      type: "object",
      group: "seo",
      description:
        "Custom metadata fields to optimize Google search indexing and social sharing appearance.",
      options: {
        collapsed: false,
        collapsible: true,
      },
      fields: [
        defineField({
          name: "metaTitle",
          title: "Meta Title",
          type: "localizedString",
          description:
            "Ideally between 50–60 characters. Defaults to Product Title if blank.",
        }),
        defineField({
          name: "metaDescription",
          title: "Meta Description",
          type: "localizedText",
          description:
            "Ideally between 150–160 characters. Summarize the product hook.",
        }),
        defineField({
          name: "openGraphImage",
          title: "Social Share Image (Open Graph)",
          type: "image",
          description:
            "Custom preview when link is shared on WhatsApp, Facebook, or X.",
          options: {
            hotspot: true,
          },
          fields: [
            defineField({
              name: "alt",
              title: "Alternative Text",
              type: "localizedString",
            }),
          ],
        }),
        defineField({
          name: "keywords",
          title: "Keywords / Search Tags",
          type: "array",
          of: [{ type: "string" }],
          description:
            "Search phrases (e.g., 'organic', 'handmade', 'artisan').",
        }),
      ],
    }),

    defineField({
      name: "medusaId",
      title: "Medusa Category ID",
      type: "string",
      group: "system",
      readOnly: true,
      description: "Managed automatically by Medusa integration.",
      hidden: ({ document }) => !document?.medusaId,
    }),
  ],

  preview: {
    select: {
      titleEn: "title.en",
      titleFr: "title.fr",
      titleAr: "title.ar",
      slug: "slug.current",
      media: "categoryImage",
      subCount: "subCategories.length",
    },
    prepare({ titleEn, titleFr, titleAr, slug, media, subCount }) {
      const title = titleEn || titleFr || titleAr || "Untitled Category";
      const countSuffix = subCount ? ` • ${subCount} subcategory(s)` : "";
      return {
        title,
        subtitle: slug ? `/${slug}${countSuffix}` : "Missing slug",
        media: media || TagIcon,
      };
    },
  },
});

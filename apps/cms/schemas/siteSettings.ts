import { defineType, defineField } from "sanity";
import { CogIcon } from "@sanity/icons/Cog";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Brand & Site Settings",
  type: "document",
  icon: CogIcon,
  description:
    "Global settings for your storefront, including branding, logos, and default SEO metadata.",
  groups: [
    { name: "branding", title: "Branding & Logos", default: true },
    { name: "seo", title: "Global OpenGraph & SEO" },
    { name: "contact", title: "Contact & Support" },
  ],
  fields: [
    // BRAND IDENTITY
    defineField({
      name: "storeName",
      title: "Store / Brand Name",
      type: "string",
      group: "branding",
      description: "e.g., 'Maison Luxe' or 'Official DTC Store'",
      validation: (Rule) => Rule.required(),
    }),

    // LOGOS & BRAND ASSETS
    defineField({
      name: "logo",
      title: "Primary Logo (Light Backgrounds)",
      type: "image",
      group: "branding",
      description: "Main logo rendered in navbar and invoice headers (SVG, PNG, or WebP).",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          title: "Alternative Text",
          type: "string",
          description: "Important for accessibility and SEO.",
          validation: (Rule) => Rule.required(),
        }),
      ],
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: "logoDark",
      title: "Inverted Logo (Dark / Transparent Navbar)",
      type: "image",
      group: "branding",
      description: "Optional: Used when header sits on top of dark Hero banners.",
      options: { hotspot: true },
    }),

    defineField({
      name: "favicon",
      title: "Browser Favicon",
      type: "image",
      group: "branding",
      description: "Upload a square 32x32 or 512x512 icon for browser tabs and mobile bookmarks.",
    }),

    // GLOBAL OPENGRAPH / SEO
    defineField({
      name: "defaultTitle",
      title: "Default Meta Title",
      type: "localizedString",
      group: "seo",
      description: "Fallback title used across social media cards.",
    }),

    defineField({
      name: "defaultDescription",
      title: "Default Meta Description",
      type: "localizedText",
      group: "seo",
    }),

    defineField({
      name: "ogImage",
      title: "Default Social Share Banner (OpenGraph)",
      type: "image",
      group: "seo",
      description: "1200x630px image shown when shared on WhatsApp, Facebook, or Twitter.",
      options: { hotspot: true },
    }),
  ],

  preview: {
    select: {
      title: "storeName",
      media: "logo",
    },
    prepare({ title, media }) {
      return {
        title: title || "Site Settings",
        subtitle: "Global white-label settings",
        media,
      };
    },
  },
});
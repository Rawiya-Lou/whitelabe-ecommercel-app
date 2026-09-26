import { defineType, defineField } from "sanity";
import { TranslateIcon } from "@sanity/icons/Translate";
import { TagIcon } from "@sanity/icons/Tag";
import { BasketIcon } from "@sanity/icons/Basket";
import { ImageIcon } from "@sanity/icons/Image";

const uiTranslation = defineType({
  name: "uiTranslation",
  title: "UI Translation (next-intl)",
  type: "document",
  icon: TranslateIcon,
  fields: [
    defineField({
      name: "locale",
      title: "Locale Code",
      type: "string",
      options: { 
        list: [
          { title: "English (EN)", value: "en" },
          { title: "العربية (AR)", value: "ar" }, 
          { title: "French (FR)", value: "fr" }
        ] 
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "messages",
      title: "Messages JSON Object",
      type: "text",
      rows: 15,
      description: "Paste next-intl structure key-value pairs here.",
      validation: (Rule) => Rule.required(),
    }),
  ],
});

const localizedString = defineType({
  title: "Localized String",
  name: "localizedString",
  type: "object",
  fieldsets: [{ name: "translations", title: "Translations", options: { collapsible: true, collapsed: false } }],
  fields: [
    defineField({ title: "English (EN)", name: "en", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ title: "العربية (AR)", name: "ar", type: "string", fieldset: "translations" }),
    defineField({ title: "French (FR)", name: "fr", type: "string", fieldset: "translations" }),
  ],
});

const localizedText = defineType({
  title: "Localized Text",
  name: "localizedText",
  type: "object",
  fieldsets: [{ name: "translations", title: "Translations", options: { collapsible: true, collapsed: false } }],
  fields: [
    defineField({ title: "English (EN)", name: "en", type: "text" }),
    defineField({ title: "العربية (AR)", name: "ar", type: "text", fieldset: "translations"}),
    defineField({ title: "French (FR)", name: "fr", type: "text", fieldset: "translations" }),
  ],
});

export const category = defineType({
  name: "category",
  title: "Product Categories",
  type: "document",
  icon: TagIcon,
  fields: [
    defineField({ name: "title", title: "Category Title", type: "localizedString" }),
    defineField({ 
      name: "slug", 
      title: "Unique Handle / Slug", 
      type: "slug", 
      options: { source: "title.en", maxLength: 96 }, 
      validation: (Rule) => Rule.required() 
    }),
    // 🖼️ CATEGORY HERO IMAGE
    defineField({
      name: "image",
      title: "Category Banner / Thumbnail",
      type: "image",
      icon: ImageIcon,
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          title: "Alt Text",
          type: "string",
          description: "Crucial for SEO and international accessibility."
        })
      ]
    }),
  ],
  preview: {
    select: { title: "title.en", media: "image" },
    prepare({ title, media }) {
      return { title: title || "Untitled Category", media };
    }
  }
});

export const product = defineType({
  name: "product",
  title: "Products Catalog",
  type: "document",
  icon: BasketIcon,
  fields: [
    defineField({ name: "title", title: "Product Title", type: "localizedString" }),
    defineField({ 
      name: "slug", 
      title: "Unique Handle / Slug", 
      type: "slug", 
      options: { source: "title.en", maxLength: 96 }, 
      validation: (Rule) => Rule.required() 
    }),
    defineField({ name: "description", title: "Product Description", type: "localizedText" }),
    
    // 🖼️ PRODUCTION IMAGE GALLERY ARRAY WITH ALT META DESCRIPTIONS
    defineField({
      name: "images",
      title: "Product Media Gallery",
      type: "array",
      description: "First image acts automatically as the product thumbnail.",
      of: [
        { 
          type: "image", 
          options: { hotspot: true },
          fields: [
            defineField({
              name: "alt",
              title: "Alt Text Description",
              type: "string",
              validation: (Rule) => Rule.required()
            })
          ]
        }
      ]
    }),

    // 💳 INTERNATIONAL PAYMENT METRICS (Separated by Region currency keys)
    defineField({
      name: "pricing",
      title: "Regional Pricing Configuration",
      type: "object",
      description: "Set base pricing rows corresponding to targeted checkout processors.",
      fields: [
        defineField({ 
          name: "dzd", 
          title: "Algeria - Chargily Gateway (DZD DA)", 
          type: "number", 
          validation: (Rule) => Rule.required().min(0) 
        }),
        defineField({ 
          name: "eur", 
          title: "Europe - Stripe Gateway (EUR €)", 
          type: "number", 
          validation: (Rule) => Rule.required().min(0) 
        }),
        defineField({ 
          name: "usd", 
          title: "North America - Stripe Gateway (USD \$)", 
          type: "number", 
          validation: (Rule) => Rule.required().min(0) 
        }),
      ]
    }),

    defineField({ name: "stockCount", title: "Available Warehouse Inventory Quantity", type: "number", validation: (Rule) => Rule.required().min(0) }),
    
    // 📏 PHYSICAL SHIPPING METRICS (Required for accurate delivery service pricing engines)
    defineField({ name: "weightGrams", title: "Product Weight (Grams)", type: "number", validation: (Rule) => Rule.min(0) }),
    defineField({ name: "lengthMm", title: "Product Length (Millimeters)", type: "number", validation: (Rule) => Rule.min(0) }),
    defineField({ name: "widthMm", title: "Product Width (Millimeters)", type: "number", validation: (Rule) => Rule.min(0) }),
    defineField({ name: "heightMm", title: "Product Height (Millimeters)", type: "number", validation: (Rule) => Rule.min(0) }),
    defineField({ 
      name: "originCountry", 
      title: "Country of Origin Code", 
      type: "string", 
      description: "ISO 2-character country code (e.g., DZ, FR, US)",
      validation: (Rule) => Rule.max(2) 
    }),

    defineField({ 
      name: "categories", 
      title: "Associated Categories", 
      type: "array", 
      of: [{ type: "reference", to: [{ type: "category" }] }] 
    }),
  ],
  preview: {
    select: { title: "title.en", priceDzd: "pricing.dzd", media: "images.0" },
    prepare({ title, priceDzd, media }) {
      return {
        title: title || "Untitled Product",
        subtitle: priceDzd ? `${priceDzd} DZD` : "Price not set",
        media
      };
    }
  }
});

export const schemaTypes = [uiTranslation, localizedString, localizedText, category, product];

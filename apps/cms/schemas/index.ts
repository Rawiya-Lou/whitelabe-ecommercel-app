import { localizedString, localizedText } from "./objects/localizedObjects";
import { seo } from "./objects/pageSeo";
import { link } from "./objects/link";

// Sections
import { heroSection } from "./sections/heroSection";
import { featuredProducts } from "./sections/featuredProducts";
import { accordionFaq } from "./sections/accordionFaq";
import { richTextBlock } from "./sections/richTextBlock";

// Singletons
import { siteSettings } from "./singletons/siteSettings";
import { themeSettings } from "./singletons/themeSettings";
import { navigation } from "./singletons/navigation";
import { announcementBar } from "./singletons/announcementBar";

// Documents
import { page } from "./documents/page";
import { policy } from "./documents/policy";
import { uiTranslation } from "./documents/uiTranslation";
import { product } from "./documents/product";
import { category } from "./documents/category";

export const schemaTypes = [
  // Helpers
  localizedString,
  localizedText,
  seo,
  link,

  // Sections (Page Builder elements)
  heroSection,
  featuredProducts,
  accordionFaq,
  richTextBlock,

  // Singletons
  siteSettings,
  themeSettings,
  navigation,
  announcementBar,

  // Documents
  page,
  policy,
  product,
  category,
  uiTranslation,
];
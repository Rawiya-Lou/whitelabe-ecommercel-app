import type { DefaultDocumentNodeResolver } from "sanity/structure";
import { Iframe } from "sanity-plugin-iframe-pane";
import { EyeOpenIcon } from "@sanity/icons/EyeOpen";
import { EditIcon } from "@sanity/icons/Edit";
import type { SanityDocument } from "sanity";

const STOREFRONT_URL =
  process.env.SANITY_STUDIO_STOREFRONT_URL || process.env.STOREFRONT_URL || "http://localhost:3000";
  
const PREVIEW_SECRET = process.env.PREVIEW_SECRET || "";

interface RouteDocument extends SanityDocument {
  slug?: { current?: string };
  handle?: { current?: string } | string;
}

/**
 * Resolves the relative frontend path based on document schema type.
 */
function resolveDocPath(doc: RouteDocument): string | null {
  const { _type } = doc;

  switch (_type) {
    case "page": {
      const slug = doc.slug?.current;
      return slug === "home" || slug === "index" ? "/" : `/${slug}`;
    }
    case "product": {
      // Handles both string handles and { current: string } objects
      const handle =
        typeof doc.handle === "string" ? doc.handle : doc.handle?.current;
      return handle ? `/products/${handle}` : null;
    }
    case "policy": {
      const slug = doc.slug?.current;
      return slug ? `/policies/${slug}` : null;
    }
    case "siteSettings":
    case "themeSettings":
    case "announcementBar":
    case "navigation":
      // Settings affect global layout, so preview the homepage
      return "/";
    default:
      return null;
  }
}

export const defaultDocumentNode: DefaultDocumentNodeResolver = (
  S,
  { schemaType }
) => {
  // Only mount the live preview tab on documents that have frontend URLs
  const previewableTypes = [
    "page",
    "product",
    "policy",
    "siteSettings",
    "themeSettings",
    "announcementBar",
  ];

  if (!previewableTypes.includes(schemaType)) {
    return S.document().views([
      S.view.form().icon(EditIcon).title("Content"),
    ]);
  }

  return S.document().views([
    // Default form editor
    S.view.form().icon(EditIcon).title("Content"),

    // Split-screen live preview tab
    S.view
      .component(Iframe)
      .options({
        url: (doc: RouteDocument) => {
          const path = resolveDocPath(doc);
          if (!path) return STOREFRONT_URL;

          // Connects to Next.js App Router Draft Mode handler
          const url = new URL("/api/draft", STOREFRONT_URL);
          url.searchParams.set("secret", PREVIEW_SECRET);
          url.searchParams.set("slug", path);

          return url.toString();
        },
        reload: {
          button: true, // Shows a manual refresh button in the pane header
        },
        defaultSize: "desktop", // Default preview layout: 'mobile' | 'desktop'
      })
      .icon(EyeOpenIcon)
      .title("Live Preview"),
  ]);
};
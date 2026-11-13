import type { StructureResolver, StructureBuilder, StructureResolverContext } from "sanity/structure";
import { CogIcon } from "@sanity/icons/Cog";
import { ControlsIcon } from "@sanity/icons/Controls";
import { PackageIcon } from "@sanity/icons/Package";
import { TagIcon } from "@sanity/icons/Tag";
import { DocumentIcon } from "@sanity/icons/Document";
import { TranslateIcon } from "@sanity/icons/Translate";
import { CaseIcon } from "@sanity/icons/Case";
import { MenuIcon } from "@sanity/icons/Menu";
import { BellIcon } from "@sanity/icons/Bell";
import { defaultDocumentNode } from "./defaultDocumentNode";

const SINGLETON_TYPES = new Set([
  "siteSettings",
  "themeSettings",
  "navigation",
  "announcementBar",
]);

/**
 * Type-safe singleton helper that attaches views (Tabs) without null errors
 */
const createSingletonListItem = (
  S: StructureBuilder,
  context: StructureResolverContext,
  schemaType: string,
  title: string,
  icon: React.ComponentType
) => {
  const node = defaultDocumentNode(S, { schemaType, ...context }) ?? S.document();
  return S.listItem()
    .title(title)
    .icon(icon)
    .child(
      node
        .schemaType(schemaType)
        .documentId(schemaType)
        .title(title)
    );
};

export const structure: StructureResolver = (S, context) =>
  S.list()
    .title("Storefront Management")
    .items([
      S.listItem()
        .title("Store Setup")
        .icon(ControlsIcon)
        .child(
          S.list()
            .title("Settings & Identity")
            .items([
              createSingletonListItem(S, context, "siteSettings", "Brand & Identity", CogIcon),
              createSingletonListItem(S, context, "themeSettings", "Theme & Design Tokens", ControlsIcon),
              createSingletonListItem(S, context, "navigation", "Header & Footer Menus", MenuIcon),
              createSingletonListItem(S, context, "announcementBar", "Top Announcement Bar", BellIcon),
            ])
        ),

      S.divider(),

      S.listItem()
        .title("Landing Pages")
        .icon(DocumentIcon)
        .schemaType("page")
        .child(S.documentTypeList("page").title("Pages")),

      S.listItem()
        .title("Legal & Policies")
        .icon(CaseIcon)
        .schemaType("policy")
        .child(S.documentTypeList("policy").title("Store Policies")),

      S.divider(),

      S.listItem()
        .title("Catalog Enrichment")
        .icon(PackageIcon)
        .child(
          S.list()
            .title("Medusa Entities")
            .items([
              S.listItem()
                .title("Products")
                .icon(PackageIcon)
                .schemaType("product")
                .child(S.documentTypeList("product").title("Medusa Products")),
              S.listItem()
                .title("Categories")
                .icon(TagIcon)
                .schemaType("category")
                .child(S.documentTypeList("category").title("Medusa Categories")),
            ])
        ),

      S.divider(),

      S.listItem()
        .title("UI Translations")
        .icon(TranslateIcon)
        .schemaType("uiTranslation")
        .child(S.documentTypeList("uiTranslation").title("Translation Dictionaries")),

      // Catch-all filter to prevent unassigned items or singletons from leaking
      ...S.documentTypeListItems().filter(
        (listItem) =>
          !SINGLETON_TYPES.has(listItem.getId() ?? "") &&
          !["page", "policy", "product", "category", "uiTranslation"].includes(
            listItem.getId() ?? ""
          )
      ),
    ]);
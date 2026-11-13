# Content Studio (`apps/cms`)

Enterprise-grade headless visual content management system (CMS) powering the white-label e-commerce platform. Built with **Sanity Studio v6**, **React 19**, and strict **TypeScript**, this service acts as the **editorial, visual branding, and localization source of truth**, operating alongside the **Medusa v2** transactional backend and the **Next.js 16** edge storefront.

---

## Tech Stack & Dependencies

- **Platform Engine:** [Sanity Studio v6](https://www.sanity.io/) (Vite-powered Single Page Application)
- **Framework & Runtime:** [React 19](https://react.dev/) + React DOM 19
- **Type Safety:** TypeScript 5.x (Strict mode, zero `any` assertions)
- **Asset Management:** `@sanity/code-input`, `@sanity/icons`, `sanity-plugin-media`
- **Preview Tooling:** `sanity-plugin-iframe-pane` (Cross-origin draft preview)
- **Deployment Target:** Vercel (Standalone SPA with HTML5 push-state rewrites)

---


## System Design & Architectural Role

Headless commerce architectures often suffer from boundary confusion between the commerce engine and the visual CMS. This workspace strictly adheres to the **Clear Boundary Contract**, ensuring zero overlapping authority between operational transactions, editorial content, and frontend rendering.

```text
┌──────────────────────────────────────────────────────────────────┐
│                   MEDUSA V2 (Commerce Engine)                    │
│  • Transactional Truth: SKUs, Inventory, Base Prices             │
│  • Logistics Truth: 58-Wilaya Rates, Stop-Desk vs. Home Delivery │
│  • Order Processing: BullMQ Workflows, Payment Gateways & COD    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 │ Bi-directional Webhooks
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                  SANITY STUDIO (Editorial CMS)                   │
│  • Visual Truth: Brand Tokens, Dynamic Theme, Logos, Assets      │
│  • Editorial Truth: Lifestyle Galleries, Narratives, PDP FAQs    │
│  • Localization Truth: 3-Way BiDi UI Translation Matrix (AR/FR)  │
│  • Composition Truth: Modular Landing Page Builder Blocks        │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 │ GROQ / Live Preview / Draft Mode
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│               NEXT.JS 16 STOREFRONT (Edge Renderer)              │
│  • Consumes CSS theme variables on server-side RootLayout        │
│  • Deep-merges live Sanity dictionaries with fallback JSON       │
│  • Renders localized Arabic (RTL) / French / English views       │
└──────────────────────────────────────────────────────────────────┘
## Directory Structure

```text
apps/cms/
├── plugins/                             # Custom Studio Badges & Tool Extensions
│   └── lockedBadge.ts                   # Visual indicator for Document Edit Protection
├── structure/                           # Desk Structure & Studio Layout Resolvers
│   ├── index.ts                         # Custom Studio Sidebar Hierarchy & Singleton Pinning
│   └── defaultDocumentNode.ts           # Side-by-side Live Preview Pane Resolver
├── schemas/
│   ├── index.ts                         # Master Schema Type Registry
│   ├── singletons/                      # Unique, Non-Repeatable Global Configuration Documents
│   │   ├── siteSettings.ts              # Brand Identity, Logos (Light/Dark), Favicon, Global SEO
│   │   ├── themeSettings.ts             # CSS Design Tokens (Hex colors, Border Radius, Fonts)
│   │   ├── navigation.ts                # Header Mega-Menu, Footer Columns, Social Links
│   │   └── announcementBar.ts           # Sitewide Notification Banner (58-Wilaya Logistics)
│   ├── documents/                       # Standalone Publishable Documents
│   │   ├── product.ts                   # Medusa v2 Sync Document + Editorial PDP Enrichment
│   │   ├── category.ts                  # Medusa v2 Synced Category Hierarchy & Banners
│   │   ├── page.ts                      # Dynamic Landing Pages with Modular Page Builder
│   │   ├── policy.ts                    # Legal, Terms of Service, and Algerian COD Policies
│   │   └── uiTranslation.ts             # 7-Namespace Deep-Merged Microcopy Dictionaries
│   ├── sections/                        # Inline Reusable Blocks for the Page Builder
│   │   ├── heroSection.ts               # Localized Hero Banner with Focal Hotspots
│   │   ├── featuredProducts.ts          # Curated Manual or Category-Driven Product Grids
│   │   ├── accordionFaq.ts              # Expandable Accordion for Delivery & Payment FAQs
│   │   └── richTextBlock.ts             # Structured Editorial Narrative Blocks
│   └── objects/                         # Reusable Field Types & Helpers
│       ├── localizedObjects.ts          # BiDi String & Text Objects with RTL Arabic Input
│       ├── pageSeo.ts                   # Search Engine & Social Media Sharing Metadata
│       └── link.ts                      # Universal Internal Reference / External URL Resolver
├── .env.local                           # Local Studio Credentials & Environment Variables
├── package.json                         # CMS App Dependencies & Scripts
├── sanity.cli.ts                        # Sanity CLI Configuration & TypeGen Settings
├── sanity.config.ts                     # Main Studio Configuration, Security Actions, & Plugins
├── seed-ui.ts                           # Automated Master Provisioning & Localization Script
├── tsconfig.json                        # Strict TypeScript Compiler Options
└── vercel.json                          # Production SPA Routing Rewrites

```

## Detailed File & Schema Breakdown

### 1. Root Configuration Files

* **`sanity.config.ts`**: The application entry point.
  * **Desk Structure Registration:** Injects custom layout resolvers (`structure` and `defaultDocumentNode`).
  * **Singleton Armor (`document.actions`):** Strips destructive actions (`delete`, `duplicate`, `unpublish`) from high-stakes singletons like `siteSettings` and `themeSettings`.
  * **Template Filter (`document.newDocumentOptions`):** Removes singletons from the global `+ New Document` navbar dropdown.
  * **Type-Safe Validation Guard:** Validates catalog documents to prevent draft pointer leakage in category references before publishing.
* **`sanity.cli.ts`**: Defines project identity (`projectId`, `dataset`) for deployment and configures automated TypeGen output paths (`sanity.types.ts`).
* **`vercel.json`**: Configures client-side SPA routing. Redirects all wildcard subpaths (`/(.*)`) back to `/index.html`, eliminating `404: NOT_FOUND` errors when refreshing deep studio routes (e.g., `/structure/product`).
* **`seed-ui.ts`**: Idempotent master provisioning script. Seeds the dataset with:
  * 7 namespaces of localized UI microcopy (`metadata`, `navigation`, `footer`, `product`, `cart`, `account`, `common`).
  * Default `siteSettings`, `themeSettings`, and `announcementBar`.
  * Sample Medusa-linked product and category stubs.
  * Standard Algerian logistics policies (Home Delivery vs. 58-Wilaya Stop-Desk pick-up).

---

### 2. Studio Layout & Structure (`structure/`)

* **`structure/index.ts`**: Overrides Sanity's default alphabetical document list with a structured domain taxonomy:
  * **White-Label Setup (Folder):** Houses pinned singleton documents.
  * **Editorial Content:** Houses Landing Pages and Legal Policies.
  * **Medusa Catalog (Enriched):** Houses Products and Categories with read-only badges.
  * **Localization:** Houses Translation Dictionaries.
  * **Catch-all Filter:** Automatically hides singletons from leaking into the generic root document view.
* **`structure/defaultDocumentNode.ts`**: Resolves document editing views. For previewable types (`page`, `product`, `policy`, `siteSettings`), it mounts a split-screen **Live Preview Pane** via `sanity-plugin-iframe-pane`. Resolves internal URLs and establishes a preview handshake with Next.js App Router Draft Mode using `SANITY_STUDIO_PREVIEW_SECRET`.

---

### 3. Custom Plugins & Badges (`plugins/`)

* **`plugins/lockedBadge.ts`**: Reads the `isLocked` document property and displays an immediate visual state indicator in the Studio header:
  * **LOCKED** (Danger): Indicates fields are set to read-only to prevent accidental production modifications.
  * **UNLOCKED** (Success): Indicates the document is intentionally unlocked for editing.

---

### 4. Schemas: Singletons (`schemas/singletons/`)

* **`siteSettings.ts`**: Manages global brand identity. Stores brand name, primary logo (light backgrounds), dark/inverted logo (transparent headers), square favicon, and fallback OpenGraph cards. Protected by the `isLocked` safety switch.
* **`themeSettings.ts`**: Dynamic, zero-code white-label design token system:
  * **Hex Colors:** Primary Brand, Secondary Accent (Sale badges), Base Page Background.
  * **Border Radius:** UI corner rounding scale (`0px` Sharp to `9999px` Full Pill).
  * **Typography:** Font bindings for Latin and Arabic typography (Cairo, Inter, Playfair).
  * *Tokens are injected dynamically as `:root` CSS variables on the Next.js server-rendered layout.*
* **`navigation.ts`**: Manages navigation structures including localized labels, internal document links, promotional callouts, and multi-column footer layouts.
* **`announcementBar.ts`**: Controls top notification bars (e.g., regional delivery announcements). Includes visibility toggles, localized copy, target URLs, and background color inversion controls.

---

### 5. Schemas: Core Documents (`schemas/documents/`)

* **`product.ts`**: Editorial companion to Medusa v2 products.
  * **Locked Fields (Read-Only):** `medusaId`, `slug` (handle), and raw variant options are managed exclusively by Medusa sync webhooks to prevent broken cart workflows.
  * **Editorial Fields:** Enriched lifestyle galleries, PDP craftsmanship highlights, material compositions, and per-variant color swatches (`colorHex`).
* **`category.ts`**: Mirrors Medusa categories while adding editorial banners, localized marketing descriptions, and SEO overrides. Includes a validation rule preventing circular parent-child references.
* **`page.ts`**: Modular landing page engine. Enables marketing teams to construct arbitrary routes (`/`, `/about`, `/promotions`) by stacking modular layout blocks.
* **`policy.ts`**: Structured legal content: Terms of Service, Privacy Policy, and Algeria-specific Cash-on-Delivery (COD) and 58-Wilaya return conditions.
* **`uiTranslation.ts`**: Database-backed microcopy matrix spanning 7 functional namespaces. Validated via a custom uniqueness rule ensuring no duplicate keys exist within any single namespace.

---

### 6. Schemas: Page Builder Sections (`schemas/sections/`)

All section schemas are strictly typed as `type: "object"` (never `document`) so they can be embedded directly inside `page.ts`:

* **`heroSection.ts`**: Localized hero banner with category tag, responsive layout controls, call-to-action buttons, and focal-point image hotspots.
* **`featuredProducts.ts`**: Curates product displays either through manual reference selection or dynamic category queries with display limits.
* **`accordionFaq.ts`**: Localized FAQ accordion for handling common customer queries (e.g., payment verification, wilaya delivery timeframes).
* **`richTextBlock.ts`**: Portable Text narrative section with typography controls and alignment options.

---

### 7. Schemas: Shared Objects (`schemas/objects/`)

* **`localizedObjects.ts`**: Internationalization backbone supporting English (`en`), French (`fr`), and Arabic (`ar`):
  * **`localizedString`**: Single-line text entries displayed in a 2-column fieldset.
  * **`localizedText`**: Multi-line textarea entries.
  * **RTL Enforcement:** Injects a custom `RtlInput` component that dynamically applies `dir="rtl"` and right-aligned text rendering when editing Arabic fields.
* **`pageSeo.ts`**: Standardized metadata object providing localized `metaTitle` (with a 70-character threshold warning), `metaDescription`, OpenGraph social images, and a `noIndex` search indexing switch.
* **`link.ts`**: Polymorphic link helper supporting internal document references (`page`, `product`, `category`), explicit path overrides (`/cart`, `/checkout`), or external URLs with `target="_blank"` handling.




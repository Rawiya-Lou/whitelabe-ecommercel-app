# Sanity CMS to Medusa v2 Catalog Synchronization Engine

This document specifies the technical architecture, dynamic data normalization patterns, type definitions, and structural file configurations for the real-time catalog synchronization system bridging **Sanity Studio CMS** (`apps/cms`) and **Medusa v2** (`apps/backend`).

---

## Architectural Overview

Instead of processing heavy synchronization logic directly inside a blocking API Route, the synchronization pipeline offloads tasks to a custom **Medusa v2 Workflow**. This provides:

- **Transactional Integrity:** Automatic atomic rollbacks across module databases if subsequent steps fail.
- **Non-Blocking Execution:** Frees up API threads to handle incoming storefront traffic while heavy data transfers run cleanly.
- **Strict Type Safety:** Completely eliminates `any` types by enforcing exact payload contract structures between your CMS and backend modules.

## 1. System Topology & Multi-Regional Matrix

The architecture facilitates a seamless content-to-commerce pipeline supporting multi-lingual storefront strings via `next-intl` (English, French, and Arabic) and cross-module automated multi-currency catalog mapping targeting distinct payment gateways across three global regions:

| Targeted Region     | Transaction Currency | Configured Gateway Router | Framework Field Target                  |
| :------------------ | :------------------- | :------------------------ | :-------------------------------------- |
| **Algeria (Local)** | DZD (DA)             | **Chargily Gateway**      | `pricing.dzd` → `Math.round(val * 100)` |
| **Europe**          | EUR (€)              | **Stripe API**            | `pricing.eur` → `Math.round(val * 100)` |
| **North America**   | USD (\$)             | **Stripe API**            | `pricing.usd` → `Math.round(val * 100)` |

---

## 2. Inbound Serialization Layer

### Sanity Studio Content Schemas (`apps/cms`)

The CMS schema structures localized entities alongside deep, nested objects containing pricing details, asset gallery matrices, and logistical tracking metadata:

```typescript
// Field mappings extracted from Sanity schema
(defineField({ name: "title", type: "localizedString" }), // en, fr, ar
  defineField({ name: "slug", type: "slug", options: { source: "title.en" } }),
  defineField({
    name: "images",
    type: "array",
    of: [
      {
        type: "image",
        options: { hotspot: true },
        fields: [{ name: "alt", type: "string" }],
      },
    ],
  }),
  defineField({
    name: "pricing",
    type: "object",
    fields: [
      { name: "dzd", type: "number" },
      { name: "eur", type: "number" },
      { name: "usd", type: "number" },
    ],
  }));
```

### Webhook Route Controller (`apps/backend/src/api/store/sanity-sync/route.ts`)

The endpoint listens on the Storefront API zone (`POST /store/sanity-sync`). It verifies access credentials via a custom `x-sanity-sync-token` header, normalizes polymorphic data input configurations, translates raw asset hex reference blocks into public Sanity CDN paths, and schedules execution down the core directed acyclic graph (DAG) workflow tree.

- **Sanity CDN URL Expansion Pattern:**
  `https://sanity.io/${projectId}/{dataset}/{id}-{dimensions}.{extension}`

---

## 3. Workflow Orchestration DAG Tree (`src/workflows/sanity-sync`)

The execution path runs on top of the `@medusajs/framework/workflows-sdk` engine. It handles complex conditional branches idempotently, implementing strict compensation handlers to ensure structural database consistency across cross-module failure cascades.

## File Structure & Component Purposes

Below is the directory map of the sync engine followed by an explanation of what each file does and why it exists.

```text
src/
├── api/
│   └── store/
│       └── sanity-sync/
│           └── route.ts
└── workflows/
    └── sanity-sync/
        ├── index.ts
        ├── types.ts
        ├── steps/
        │   ├── get-system-defaults.ts
        │   ├── inspect-existing-product.ts
        │   ├── link-variant-to-inventory.ts
        │   ├── sync-product-categories.ts
        │   └── update-inventory-levels.ts
        └── utils/
            └── mappers.ts



```

# Sanity CMS Catalog Synchronization Engine

An enterprise-grade, bidirectional, idempotent catalog synchronization pipeline built for **Medusa v2**. This workflow securely automates the dynamic ingestion, schema transformation, multi-currency price routing, and inventory tracking allocation of catalog assets modified inside **Sanity Studio (CMS)**.

## 🏗️ Architectural Pattern

The architecture follows a strict **Separation of Concerns (SoC)** and a **Push-Based Event-Driven Design**. Rather than running direct database mutations or heavy logical sorting loops inside a single orchestrator, operations are decoupled into standalone **Steps** (Action Nodes) and **Utils** (Pure Data Transformers). This guarantees transactional safety, multi-tenant isolation, and explicit support for **Medusa Workflow Rollbacks (Compensations)**.

---

## Directory Map & File Specifications

### Master Orchestrator

#### `index.ts` (Master Graph Blueprint)

Acts as the central Directed Acyclic Graph (DAG) blueprint compiling your ingestion branches. It orchestrates the logical flow of execution data across multiple channels based on incoming operation payloads:

- **Lane 1 (Batch Synchronization):** Handles high-volume historical sheet dumps by chunking payloads through the batch service.
- **Lane 2 (Secure Cascade Deletion):** Safeguards relational constraints by intercepting catalog deletions.
- **Lane 3 (Single Record Ingestion/Upsert):** The core engine routing matrix. By running lightweight inventory provisioning steps (`createFreshInventoryStep` and `linkVariantToInventoryStep`) flat up front after database lookups, it repairs broken state schemas on the fly. It then splits securely using `when()` gates into Branch C1 (Pure Updates via `updateProductsWorkflow`) or Branch C2 (Pure Creation via `createProductsWorkflow`), fully preventing race conditions and unique key collisions.

---

### Action Steps (`/steps`)

#### `system-defaults.ts`

Dynamically resolves fallback infrastructure resource indicators (`sales_channel_id`, `shipping_profile_id`, `stock_location_id`) directly from your active database. This decouples environment configurations entirely, allowing your synchronization engine to stay agnostic across staging, testing, and production environments.

#### `inspect-existing-product.ts`

Queries the database graph simultaneously by product handle slug and variant SKU before any modification occurs. It provides the **intelligence layer** of the engine, determining whether a record is missing (routing to creation) or pre-existing (routing to update), while natively detecting and self-healing orphaned variant rows from historically aborted transactions.

#### `sync-product-categories.ts`

Implements **Just-In-Time (JIT) category generation**. If an incoming product payload contains a fresh category token, this step builds out the category hierarchy structure inside Medusa's core tables before writing the product. This completely prevents foreign-key relational query crashes.

#### `create-fresh-inventory.ts`

Communicates directly with the low-level Medusa `IInventoryService` to provision clear warehouse stock allocation tracking records by SKU. It bypasses internal core workflow inventory hooks to prevent automatic validation errors and handles both initial assignments and idempotent upsert re-allocations natively.

#### `link-variant-to-inventory.ts`

Uses Medusa v2's `Remote Link` engine to establish polymorphic database cross-module reference maps between distinct product variants and inventory ledger items. It also handles setting explicit variant SKU values by executing strict positional parameters against the core `IProductModuleService`.

#### `update-inventory-levels.ts`

Idempotently balances warehouse quantity configurations whenever changes occur within your CMS panel. Includes defensive checks to evaluate if a location index is active, and provides a rollback step that restores previous quantity matrices in the event of downstream transaction drops.

#### `delete-catalog-item.ts`

Processes secure database structural cascade sweeps. If a product is removed, it automatically drops variant data, dismisses remote module links, and clears out corresponding inventory tracks. If a category is targeted, it acts as a **relationship guard**, blocking the deletion if active products are still mapped to it to prevent storefront data fragmentation.

#### `batch-sync-step.ts`

Invokes bulk database creation operations, wrapping multiple products inside isolated transactional loops during bulk catalog import phases.

---

### Data Transformers (`/utils`)

#### `mappers.ts`

Translates localized data blocks (English, French, Arabic) into explicit localized maps (`{ en, fr, ar }`). It also acts as the financial processor, parsing standard string prices into minor-unit integers (cents) across three multi-currency lanes:

- **DZD (Algerian Dinars):** Passed safely for your localized **Chargily Gateway**.
- **EUR & USD:** Passed cleanly for your international **Stripe API** checkout tunnels.

#### `batch-service.ts`

Splices incoming data payloads into controlled chunk matrices, keeping your PostgreSQL (Neon) connection pool safe from transaction timeouts or memory limits during bulk sync loops.

---

## Security Handshake Overview

Requests reaching the ingestion lane are evaluated against an active security configuration block before triggering workflows:

1. **Storefront Guard Bypass:** Handled securely via `api/middlewares.ts`. It flags the custom route `/store/sanity-sync`, injecting placeholder storefront keys internally so administrative data can safely hit `/store/*` paths without breaking public storefront rules.
2. **Token Security Validation:** Evaluates incoming header values against `process.env.SANITY_SYNC_SECRET_TOKEN` to block unauthorized requests while maintaining a `development-override-token` fallback parameter for secure, offline testing scripts.

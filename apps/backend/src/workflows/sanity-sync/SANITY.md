# Sanity CMS to Medusa v2 Catalog Synchronization Engine

This document outlines the architecture, data-mapping strategy, and step-by-step pipeline engineered to synchronize products and categories from Sanity CMS to Medusa v2.

---

## Architectural Overview
Instead of processing heavy synchronization logic directly inside a blocking API Route, the synchronization pipeline offloads tasks to a custom **Medusa v2 Workflow**. This provides:
* **Transactional Integrity:** Automatic atomic rollbacks across module databases if subsequent steps fail.
* **Non-Blocking Execution:** Frees up API threads to handle incoming storefront traffic while heavy data transfers run cleanly.
* **Strict Type Safety:** Completely eliminates `any` types by enforcing exact payload contract structures between your CMS and backend modules.

---
# Sanity CMS to Medusa v2 Sync Architecture Specification - Part 1

This document specifies the technical architecture, dynamic data normalization patterns, type definitions, and structural file configurations for the real-time catalog synchronization system bridging **Sanity Studio CMS** (`apps/cms`) and **Medusa v2** (`apps/backend`).

---

## 1. System Topology & Multi-Regional Matrix

The architecture facilitates a seamless content-to-commerce pipeline supporting multi-lingual storefront strings via `next-intl` (English, French, and Arabic) and cross-module automated multi-currency catalog mapping targeting distinct payment gateways across three global regions:

| Targeted Region | Transaction Currency | Configured Gateway Router | Framework Field Target |
| :--- | :--- | :--- | :--- |
| **Algeria (Local)** | DZD (DA) | **Chargily Gateway** | `pricing.dzd` → `Math.round(val * 100)` |
| **Europe** | EUR (€) | **Stripe API** | `pricing.eur` → `Math.round(val * 100)` |
| **North America** | USD (\$) | **Stripe API** | `pricing.usd` → `Math.round(val * 100)` |

---

## 2. Inbound Serialization Layer

###  Sanity Studio Content Schemas (`apps/cms`)
The CMS schema structures localized entities alongside deep, nested objects containing pricing details, asset gallery matrices, and logistical tracking metadata:

```typescript
// Field mappings extracted from Sanity schema
defineField({ name: "title", type: "localizedString" }), // en, fr, ar
defineField({ name: "slug", type: "slug", options: { source: "title.en" } }),
defineField({
  name: "images",
  type: "array",
  of: [{ type: "image", options: { hotspot: true }, fields: [{ name: "alt", type: "string" }] }]
}),
defineField({
  name: "pricing",
  type: "object",
  fields: [
    { name: "dzd", type: "number" },
    { name: "eur", type: "number" },
    { name: "usd", type: "number" }
  ]
});
```

### Webhook Route Controller (`apps/backend/src/api/store/sanity-sync/route.ts`)
The endpoint listens on the Storefront API zone (`POST /store/sanity-sync`). It verifies access credentials via a custom `x-sanity-sync-token` header, normalizes polymorphic data input configurations, translates raw asset hex reference blocks into public Sanity CDN paths, and schedules execution down the core directed acyclic graph (DAG) workflow tree.

- **Sanity CDN URL Expansion Pattern:**
  `https://sanity.io{projectId}/{dataset}/{id}-{dimensions}.{extension}`

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

### 1. `src/api/store/sanity-sync/route.ts`
* **Purpose:** The entry point for the Sanity webhook. It intercepts the HTTP POST request, verifies the cryptographic authentication token (`x-sanity-sync-token`) for security, and passes the request body over to the workflow.
* **Why it matters:** It acts as a lightweight gatekeeper. It keeps your API layer extremely thin by handling no business logic directly, ensuring your server remains responsive under high webhook traffic.

### 2. `src/workflows/sanity-sync/types.ts`
* **Purpose:** Houses the explicit TypeScript interfaces (`SanityProductPayload`, `SanityCategoryPayload`, etc.) that mirror the structural data format coming from Sanity.
* **Why it matters:** This is your compiler's source of truth. By explicitly mapping the shape of the data, it completely eliminates the use of unstable `any` objects, guaranteeing strict type safety and catching schema mistakes during development instead of runtime.

### 3. `src/workflows/sanity-sync/utils/mappers.ts`
* **Purpose:** Contains pure, stateless data transformation utilities (like `mapSanityToMedusaProduct`) that convert raw Sanity payloads into formatted Medusa Core input schemas (handling minor unit currency conversions like dollars to cents).
* **Why it matters:** Isolating data mapping into an uncorrupted helper file makes your code easy to maintain. Because these functions are "pure" (they don't touch the database), you can easily write isolated unit tests for them.

### 4. `src/workflows/sanity-sync/steps/get-system-defaults.ts`
* **Purpose:** Queries the Medusa database concurrently using the Query Graph engine to pull active system infrastructures: the default Sales Channel, Shipping Profile, and warehouse Stock Location.
* **Why it matters:** Avoids brittle hardcoding. The sync engine resolves these fallback target configurations dynamically, meaning the code works smoothly out of the box when moving across local, staging, and production environments.

### 5. `src/workflows/sanity-sync/steps/sync-product-categories.ts`
* **Purpose:** Checks Medusa for incoming category slugs. If a category exists, it grabs the ID; if it's missing, it triggers Medusa's internal generation workflow to create it on the fly. It returns an array of verified UUIDs.
* **Why it matters:** Implements Just-In-Time (JIT) data generation. It guarantees that when a product is created or updated, its associated categories exist in the database first, eliminating foreign key relational database conflicts.

### 6. `src/workflows/sanity-sync/steps/inspect-existing-product.ts`
* **Purpose:** A pre-execution step that queries both the Product and Inventory Module databases simultaneously using the unique Sanity slug and SKU.
* **Why it matters:** Gives the workflow orchestrator clear visibility into the system state before making any database modifications. It tells the master workflow exactly whether to route data down the "Update" track or the "Create" track.

### 7. `src/workflows/sanity-sync/steps/update-inventory-levels.ts`
* **Purpose:** Programmatically changes product stock count allocations within the Inventory Module layer when handling existing item updates.
* **Why it matters:** Features atomic rollback safeguards. It saves the previous stock count context in memory; if a subsequent process in the sync chain crashes, it fires a compensation block to restore your stock count back to its original value.

### 8. `src/workflows/sanity-sync/steps/link-variant-to-inventory.ts`
* **Purpose:** Accesses the foundational cross-module linking layer to bind a newly created Product Variant UUID to its corresponding Inventory Item UUID.
* **Why it matters:** Medusa v2 keeps catalog structures completely separated from physical warehouse limitations. Without this explicit Remote Link bridging step, checkout engines will not be able to cross-reference stock availability during customer purchases.

### 9. `src/workflows/sanity-sync/index.ts`
* **Purpose:** The master orchestrator. It uses `createWorkflow` along with conditional helpers (`when`, `transform`) to manage the execution order of all the individual steps based on the inspection branch results.
* **Why it matters:** This acts as the brain of your pipeline. It stitches together isolation utilities, native Medusa core flows, and your custom tasks into a single transaction wrapper that ensures reliable catalog behavior.

---

## Step-by-Step Execution Lifecycle

1. **Gatekeep:** Webhook hits `route.ts` → Token gets verified.
2. **Dispatch:** Payload enters `sanitySyncProductWorkflow`.
3. **Resolve Environment:** Core default channels are queried via `getSystemDefaultsStep`.
4. **Align Collections:** Categories are mapped or created via `syncProductCategoriesStep`.
5. **Inspect State:** Unique handles/SKUs are checked via `inspectExistingProductStep`.
6. **Branch Run:**
   * **Branch A (Exists):** Updates product copy and safely recalibrates quantities via `updateInventoryLevelsStep`.
   * **Branch B (New):** Generates product variants, spins up an inventory item, maps them using `linkVariantToInventoryStep`, and initializes stock counts.


# Sanity CMS to Medusa v2 Sync Architecture Specification 

-# Sanity CMS to Medusa v2 Catalog Synchronization Engine - Part 2

---

## 4. Core Step Specifications & Idempotency Rules

### 1. `getSystemDefaultsStep`
Queries the Medusa database concurrently using the Query Graph engine to pull active system infrastructures: the default Sales Channel, Shipping Profile, and warehouse Stock Location. It acts as a defensive guard to prevent foreign key compilation crashes down the line.

### 2. `inspectExistingProductStep`
A pre-execution step that queries both the Product and Inventory Module databases simultaneously using the unique Sanity slug and SKU. It tells the master workflow exactly whether to route data down the "Update" track or the "Create" track.

### 3. `syncProductCategoriesStep`
Checks Medusa for incoming category slugs. If a category exists, it grabs the ID; if it's missing, it triggers Medusa's internal generation workflow to create it on the fly. It implements Just-In-Time (JIT) data generation and uses a unique `.config({ name: "..." })` identity tracker to run both single-item and batch updates safely.

### 4. `updateInventoryLevelsStep`
Programmatically changes product stock count allocations within the Inventory Module layer when handling existing item updates. It features atomic rollback safeguards; if a subsequent process in the sync chain crashes, it fires a compensation block to restore your stock count back to its original value.

### 5. `linkVariantToInventoryStep`
Establishes the link between variants and inventory ledger rows using Medusa's central link engine.
- **Idempotency Safeguard:** Checks if a level row index exists before writing to the database using `listInventoryLevels`. If a record is found, it updates the quantity inline via `updateInventoryLevels` instead of trying to write a duplicate row and throwing a unique constraint conflict error.

### 6. `batchSyncStep`
A high-throughput lane designed to handle heavy ingestion requests. It processes large chunks of items in controlled concurrent blocks to prevent transaction timeouts or API throttling.

### 7. `deleteCatalogItemStep`
A polymorphic cleanup step that handles both product and category deletions.
- **Defensive Guardrail:** Inspects relationship constraints before deleting a category. If active products are still mapped to it, the step aborts the operation to prevent catalog fragmentation.

---

## 5. End-to-End (E2E) Terminal Test Suite

Execute these test payloads sequentially inside a **PowerShell terminal window** to verify your setup. Ensure your local server (`pnpm dev` on port `9000`) and a public secure tunnel (`lt --port 9000`) are actively running.

### Test 1: JIT Category & Multi-Image Product Creation
```powershell
$headers = @{ "x-sanity-sync-token" = "your_secure_local_development_secret_token"; "Content-Type" = "application/json" }
$body = @{
    operation = "create"; documentType = "product"
    productData = @{
        _id = "test-prod-premium-200"
        title = @{ en = "Premium Aluminum Workspace Stand"; fr = "Support de Bureau en Aluminium"; ar = "حامل مكتب ألمنيوم فاخر" }
        description = @{ en = "Ergonomic workspace stand tuned for pro developers." }
        slug = @{ current = "premium-aluminum-workspace-stand" }
        pricing = @{ dzd = 18500; eur = 120; usd = 135 }
        stockCount = 15; weightGrams = 2400; lengthMm = 450; widthMm = 220; heightMm = 120; originCountry = "DZ"
        categories = @( @{ _type = "reference"; _ref = "cat-workspace-accessories" } )
        images = @( @{ _type = "image"; asset = @{ _type = "reference"; _ref = "image-standfront-1920x1080-png" }; alt = "Clean studio aesthetic workspace stand" } )
        manage_inventory = $true; allow_backorder = $false
    }
} | ConvertTo-Json -Depth 10 -Compress
Invoke-RestMethod -Uri "http://localhost:9000/store/sanity-sync" -Method Post -Headers $headers -Body $body
```
*Expected Output:* `{"success":true,"message":"Sync execution complete"}`

### Test 2: Idempotent Single-Item Quantities Update (Upsert)
```powershell
$headers = @{ "x-sanity-sync-token" = "your_secure_local_development_secret_token"; "Content-Type" = "application/json" }
$body = @{
    operation = "create"; documentType = "product"
    productData = @{
        _id = "test-prod-premium-200"
        title = @{ en = "Premium Aluminum Workspace Stand (v2 Upgraded edition)" }
        slug = @{ current = "premium-aluminum-workspace-stand" }
        pricing = @{ dzd = 19500; eur = 125; usd = 140 }
        stockCount = 75 # Incremented from 15 to 75
        categories = @( @{ _type = "reference"; _ref = "cat-workspace-accessories" } )
        images = @( @{ _type = "image"; asset = @{ _type = "reference"; _ref = "image-standfront-1920x1080-png" } } )
        manage_inventory = $true; allow_backorder = $false
    }
} | ConvertTo-Json -Depth 10 -Compress
Invoke-RestMethod -Uri "http://localhost:9000/store/sanity-sync" -Method Post -Headers $headers -Body $body
```
*Expected Output Logs:* `[Sanity Sync] Inventory level already exists... Syncing quantities instead.`

### Test 3: Relationship Constraint Guard (Expected Error Branch)
```powershell
$headers = @{ "x-sanity-sync-token" = "your_secure_local_development_secret_token"; "Content-Type" = "application/json" }
$body = @{ operation = "delete"; documentType = "category"; productData = @{ slug = "cat-workspace-accessories" } } | ConvertTo-Json -Depth 5 -Compress
Invoke-RestMethod -Uri "http://localhost:9000/store/sanity-sync" -Method Post -Headers $headers -Body $body
```
*Expected Output:* `500 Server Error` with message: `Aborting category deletion: Category [cat-workspace-accessories] has products associated with it.`

### Test 4: Full Cascade Deletion and Inventory Link Cleanup
```powershell
$headers = @{ "x-sanity-sync-token" = "your_secure_local_development_secret_token"; "Content-Type" = "application/json" }
$body = @{ operation = "delete"; documentType = "product"; productData = @{ slug = "premium-aluminum-workspace-stand" } } | ConvertTo-Json -Depth 5 -Compress
Invoke-RestMethod -Uri "http://localhost:9000/store/sanity-sync" -Method Post -Headers $headers -Body $body
```
*Expected Output:* `{"success":true,"operation":"deleted",...}`

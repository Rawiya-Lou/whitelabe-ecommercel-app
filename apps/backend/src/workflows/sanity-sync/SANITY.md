# Sanity CMS to Medusa v2 Catalog Synchronization Engine

This document outlines the architecture, data-mapping strategy, and step-by-step pipeline engineered to synchronize products and categories from Sanity CMS to Medusa v2.

---

## Architectural Overview
Instead of processing heavy synchronization logic directly inside a blocking API Route, the synchronization pipeline offloads tasks to a custom **Medusa v2 Workflow**. This provides:
* **Transactional Integrity:** Automatic atomic rollbacks across module databases if subsequent steps fail.
* **Non-Blocking Execution:** Frees up API threads to handle incoming storefront traffic while heavy data transfers run cleanly.
* **Strict Type Safety:** Completely eliminates `any` types by enforcing exact payload contract structures between your CMS and backend modules.

---

## Step-by-Step Implementation Pipeline

### 1. Lightweight Gatekeeping & Verification (`route.ts`)
* **What we did:** Simplified the POST endpoint to act as a secure gateway. It validates incoming requests against a cryptographic token (`x-sanity-sync-token`).
* **Why:** Keeps infrastructure secure and immediately dispatches verified payloads to the workflow engine, keeping edge-routing processes lightning fast.

### 2. Isolated Infrastructure Resolution Step
* **What we did:** Created a custom system default resolution step to query internal core channels (Sales Channels, Shipping Profiles, Warehouse Stock Locations).
* **Why:** Avoids brittle, hardcoded system UUID variables. The sync engine automatically adapts when database targets change between staging and production environments.

### 3. Just-In-Time (JIT) Category Synchronization
* **What we did:** Designed an isolated step to cross-reference Sanity category slugs against the database. Missing channels are spun up natively via Medusa core category workflows before the product is processed.
* **Why:** Ensures that complex hierarchy collections link up seamlessly without breaking foreign key restrictions or failing during dynamic creation passes.

### 4. Dual-Branch DB State Inspection
* **What we did:** Crafted a pre-execution verification step to pull inventory records and product models concurrently based on unique SKUs and handles.
* **Why:** Gives the system precise operational visibility, allowing the workflow orchestrator to dynamically toggle between updating data or spawning fresh models.

### 5. Compensable Data Modification & Level Updates
* **What we did:** When a product match is discovered, its metadata updates concurrently with its inventory matrix numbers using custom actions.
* **Why:** Uses safe, programmatic rollbacks. If the stock synchronization locks up, the database reverts the physical quantities to their previous exact figures automatically.

### 6. Composable Cross-Module Provisioning & Link Allocation
* **What we did:** For pristine catalog data, the branch handles sequential creation of the core product model, provisions an explicit `Inventory Item`, locks down a multi-tenant association mapping using Medusa's **Remote Link** utility, and spins up initial quantities.
* **Why:** Medusa v2 decouples catalogs and physical inventory warehouse limits. Using the Remote Link manager ensures storefront checkout engines accurately gauge available product stock.

# Sanity CMS to Medusa v2 Catalog Synchronization Engine

This document outlines the architecture, data-mapping strategy, and step-by-step pipeline engineered to synchronize products and categories from Sanity CMS to Medusa v2.

---

## Architectural Overview
Instead of processing heavy synchronization logic directly inside a blocking API Route, the synchronization pipeline offloads tasks to a custom **Medusa v2 Workflow**. This provides:
* **Transactional Integrity:** Automatic atomic rollbacks across module databases if subsequent steps fail.
* **Non-Blocking Execution:** Frees up API threads to handle incoming storefront traffic while heavy data transfers run cleanly.
* **Strict Type Safety:** Completely eliminates `any` types by enforcing exact payload contract structures between your CMS and backend modules.

---

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

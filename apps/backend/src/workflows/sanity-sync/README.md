# Medusa v2 and Sanity synchronization

This README describes the synchronization implementation currently in this
repository. It covers both directions, the workflow boundaries, file
responsibilities, safeguards, and the tests used to verify the behavior.

## What owns what

The integration is bidirectional, but it does not make both systems
authoritative for every field:

| Data | Authority and behavior |
| --- | --- |
| Product and category editorial content | Sanity provides the localized editorial model. Product/category copy fields are synchronized in both directions; on each event, the changed source values are mapped to the other system. |
| Product title, subtitle, description, material | The product title maps to English and the Medusa subtitle maps to French. Translation metadata and existing Sanity values are fallbacks for locales not supplied by the current Medusa record. This is field mapping, not conflict-free concurrent editing: there is no version merge policy for simultaneous edits in both systems. |
| Product categories | Medusa's product-category associations are projected as weak references on the Sanity product. Category documents are independently synchronized. |
| Product tags | Sanity tag strings are resolved to Medusa tag records on inbound create/update. Medusa tag values are sent back to Sanity on outbound product sync. |
| Variant identity, SKU, title, and options | Medusa owns the sellable variant matrix. The outbound variant merge updates these structural fields while preserving Sanity editorial fields and images. |
| Variant editorial galleries | Sanity stores the gallery. On inbound sync, gallery assets are included in the Medusa product image collection and linked to their matching Medusa variants. The first gallery image is used as the Medusa variant thumbnail. |
| Inventory and fulfillment | Medusa owns stock levels, inventory records, and fulfillment state. Inbound product sync ensures inventory items and links exist; ordinary product sync initializes missing stock levels to zero. |
| Material on inventory items | The product-to-inventory step and inventory-to-product event workflow synchronize material. Inventory edits update the product's English material and then follow the Medusa product event path to Sanity. |
| Prices | Commerce pricing remains a Medusa responsibility. The current Sanity product mapper does not create price records. |

This is not a distributed database transaction. Medusa workflow steps can
compensate Medusa-side changes, but a Sanity HTTP mutation is an external side
effect and cannot participate in a PostgreSQL transaction.

## Architecture at a glance

```text
Sanity publish / webhook
  -> POST /sanity-sync
  -> authenticate, normalize, deduplicate, lock, and resolve document
  -> category workflow OR product workflow
  -> Medusa product/category, tags, inventory, and media relations

Medusa product/category/inventory events
  -> subscribers
  -> outbound workflows
  -> Sanity HTTP API through SanityModuleService
```

The design uses an event-driven adapter at each boundary and Medusa
Workflows SDK steps for synchronization operations. The route and subscribers
are thin dispatchers; mapping, service calls, and compensation live in workflow
steps or the Sanity module service.

## Design patterns

- **Adapter / anti-corruption layer:** the webhook route and
  `utils/mappers.ts` translate Sanity's document/projection shape into the
  Medusa workflow contract. Outbound steps translate Medusa DTOs into Sanity
  mutations. Neither system's storage model is exposed directly to the other.
- **Event-driven publish/subscribe:** Sanity publication invokes the HTTP
  route; Medusa domain events invoke subscribers. Producers do not call the
  opposite system from product/category module internals.
- **Workflow orchestration and saga-style compensation:** the
  `@medusajs/framework/workflows-sdk` composes named steps and branch
  dependencies. Steps that alter Medusa data can return a `StepResponse`
  compensation snapshot. This is saga-style recovery, not a distributed ACID
  transaction across Medusa and Sanity.
- **Idempotent consumer / replay protection:** webhook event claims,
  fingerprints, tag lookup-before-create, category/product lookup, and
  variant reconciliation make retries safer and avoid duplicate records.
- **Merge-preserving update:** outbound variant synchronization updates the
  Medusa-owned structural fields on matching Sanity variant rows while copying
  existing editorial fields through unchanged.
- **Lease-based coordination:** token-owned expiring Redis leases limit
  simultaneous work. Short-lived markers suppress expected echo events; they
  are not a durable queue or event log.

## Sanity to Medusa: inbound path

### 1. Webhook entry and request guards

`src/api/sanity-sync/route.ts` implements `POST /sanity-sync`. Before running a
workflow, it:

1. Requires the raw request body.
2. Authenticates either `x-sanity-sync-token` using a constant-time comparison
   or `sanity-webhook-signature` using HMAC-SHA256 over the exact raw body.
3. Rejects unpublished `drafts.*` documents or a drafts perspective with HTTP
   202; draft content is not written to Medusa.
4. Identifies duplicate webhook deliveries using an event lease based on
   document ID, operation, revision, and payload fingerprint.
5. Takes a document-scoped lease to avoid concurrent inbound work on the same
   catalog document.
6. Ignores a matching short-lived `sanity-echo:<documentId>` marker. This
   acknowledges Sanity webhooks generated by outbound Medusa mutations.
7. Normalizes category/product operation, references, localized data, and
   image asset URLs before dispatch.

The `finally` block releases document leases. The event lease retains a
successfully processed delivery until its TTL expires. There is no separate
per-document fingerprint short-circuit, so a valid new delivery with repeated
content is not rejected as unchanged.

### 2. Category ingestion

For category documents, the route validates the slug and resolves localized
title/description values, then invokes `sanitySyncCategoryWorkflow`. The
`syncCategoryFromSanityStep` finds the Medusa category by Sanity ID, with a
handle fallback; it creates or updates the category and merges translation
metadata so absent locale values are not discarded. It returns a compensation
snapshot for a failed workflow.

Category deletes are resolved by Sanity ID or handle. Deletion is rejected
with HTTP 400 if Medusa reports assigned products. The delete workflow also
checks the relationship guard before deleting.

### 3. Product ingestion

The route maps a published Sanity product into a typed sync payload. It
resolves categories, maps localized strings and metadata, expands Sanity image
asset references into CDN URLs, and matches the document to Medusa by direct
Medusa ID, `metadata.sanity_id`, then product handle. Products without a
resolvable Medusa category are rejected.

`sanitySyncProductWorkflow` in `index.ts` selects the operation lane:

- **Create/update:** resolve product tags and categories, inspect existing
  product state, then branch to Medusa's `createProductsWorkflow` or
  `updateProductsWorkflow`.
- **Delete:** delegate to `deleteCatalogItemStep`.
- **Batch:** resolve categories and delegate chunks to `batchSyncStep`.

The create and update branches both resolve tag names to real Medusa tag IDs
before associating tags. This prevents invalid or undefined tag associations.
The mapper creates option definitions and variants from the inbound contract;
variants are matched on update by Medusa ID, stored Sanity variant ID, SKU, or
option matrix. Unmatched Sanity variant rows are not treated as new Medusa
variants.

After product creation/update, the workflow:

- Calls `syncVariantImagesFromSanityStep` to reconcile variant/image links.
- Calls `ensureProductInventoryStep` to find or create inventory items by SKU,
  add missing product/inventory links, create a missing stock-location level,
  and synchronize material. Newly created links, levels, and inventory items
  can be rolled back if this step fails.
- Omits Algeria's `DZ` origin code rather than storing it as a product or
  inventory origin value.

### 4. Inbound media and variant details

`mapSanityToMedusaProduct` combines product-level and variant gallery images
into the Medusa product image list. Variant image metadata records each
variant's requested URLs. The media step resolves those URLs to Medusa image
IDs, then adds or removes variant-image relationships against the previously
observed links. It errors if a requested variant image is missing from the
product image collection instead of silently reporting success.

Sanity variant rows are editorial extensions of Medusa variants. Their
localized description, details, badge, color swatch value, and image gallery
do not create sellable options or SKUs.

## Medusa to Sanity: outbound path

### Product events

`sync-product-categories-to-sanity.ts` subscribes to product create/update/
delete and category create/update/delete/attach/detach events.

For a product create/update, `syncProductToSanityWorkflow` runs:

1. `syncProductMaterialToInventoryStep` propagates the product's English
   material to inventory items found by variant SKU.
2. `syncProductToSanityStep` queries the current Medusa product and patches
   Sanity with product ID, localized title/description/material, tags, and
   category references.
3. `syncVariantsToSanityStep` reads Medusa variant identity/options and asks
   `SanityModuleService.syncProductVariants` to merge the structural variant
   matrix into the existing Sanity document.

The product step preserves existing French and Arabic text when Medusa has no
replacement for those locales. It compares synchronized fields before
mutating, so an identical structure is skipped. Variant merging reuses
existing Sanity rows by Medusa ID or fallback identity, preserving editorial
content and galleries, and prunes rows for variants removed in Medusa.

Product deletes invoke `deleteProductFromSanityWorkflow`. Category attach and
detach events resync the affected product, allowing the Sanity product's
category references to reflect the current Medusa associations.

### Category events

Category create/update events invoke `syncCategoryToSanityWorkflow`, which
patches the Sanity category's Medusa ID, slug, localized title/description,
and weak subcategory references. Category deletes invoke
`deleteCategoryFromSanityWorkflow`.

### Inventory material edits

`sync-inventory-material-to-product.ts` listens for inventory-item create and
update events and invokes `syncInventoryMaterialToProductWorkflow`. The step
follows the product-variant/inventory-item remote link to the affected product,
then updates product material and its English translation metadata if needed.
That product update can then flow through the normal Medusa product subscriber
to Sanity. Other locale translations are retained.

## Loop prevention, replay handling, and locks

The two systems can emit events in response to each other's writes, so the
integration uses multiple guards:

- **Inbound request lease and fingerprint:** the webhook route claims a
  revision/payload-specific event lease and a document-scoped work lease. It
  does not persist a payload-only fingerprint that can suppress later updates.
- **Medusa-origin echo marker:** outbound Sanity mutations mark
  `sanity-echo:<sanityDocumentId>`. The next webhook for that document consumes
  the marker and returns successfully without starting an inbound workflow.
- **Sanity-origin Medusa event marker:** before an inbound product workflow
  updates an existing Medusa product, the route marks
  `sanity-inbound-product:<medusaProductId>`. The Medusa product subscriber
  consumes the marker and avoids echoing that event back to Sanity.
- **Origin fields and correlation IDs:** outbound Sanity documents include
  `updatedBy`, `syncOrigin`, `is_sync_origin`, and `correlationId` for
  diagnostics and webhook projection. The short-lived echo lease remains the
  authoritative loop guard; a persistent origin field alone is not sufficient
  to classify future editorial changes as echoes.
- **Redis leases:** `src/utils/sync-lock.ts` uses Redis `SET NX EX`, renewal,
  and token-checked release in production. It uses process-local expiring
  values in development/test and fails closed if production Redis is missing
  or unavailable.

Markers are short-lived and event-based; they are not a durable event log.
Ensure the Sanity webhook projection includes the document ID. The origin
fields are helpful metadata, while the short-lived echo marker is the active
loop guard.

## File guide

Paths in this section are relative to `apps/backend`, except the CMS schema
paths.

### Webhook and event entry points

| File | Responsibility |
| --- | --- |
| `src/api/sanity-sync/route.ts` | Inbound HTTP authentication, draft/replay/lock guards, payload normalization, Sanity ID/category/product resolution, operation dispatch, HTTP response, lease cleanup. |
| `src/api/sanity-sync/__tests__/route.spec.ts` | Route tests for authentication, idempotency, batches, loop guards, drafts, category handling, and Sanity webhook payload shapes. |
| `src/subscribers/sanity-sync/sync-product-categories-to-sanity.ts` | Dispatches Medusa product and category events to outbound workflows; routes category membership changes to product resync and consumes inbound-product markers. |
| `src/subscribers/sanity-sync/sync-inventory-material-to-product.ts` | Converts inventory-item events into the inventory-to-product material workflow. |

### Workflow definitions

| File | Responsibility |
| --- | --- |
| `src/workflows/sanity-sync/index.ts` | Main inbound product workflow and its batch, deletion, create, and update branches. |
| `src/workflows/sanity-sync/category-workflow.ts` | Inbound Sanity-to-Medusa category workflow. |
| `src/workflows/sanity-sync/forward-sync-workflows.ts` | Outbound product workflow ordering material propagation, product patch, and variant merge; also defines product deletion workflow. |
| `src/workflows/sanity-sync/category-forward-workflow.ts` | Outbound category sync and deletion workflow definitions. |
| `src/workflows/sanity-sync/inventory-material-workflow.ts` | Inventory-item-to-product workflow definition. |
| `src/workflows/sanity-sync/types.ts` | Payload contracts and DTOs shared by routes, workflows, and mappers. |

### Workflow steps

| File | Responsibility |
| --- | --- |
| `steps/system-defaults.ts` | Finds the default sales channel, shipping profile, and stock location for inbound creation. |
| `steps/inspect-existing-product.ts` | Looks up product by handle and fallback SKU, returning existing product/variant/inventory/media context. |
| `steps/sync-product-categories.ts` | Resolves or creates Medusa category rows from inbound category payloads. |
| `steps/resolve-product-tags.ts` | Finds existing tags, creates missing tags, handles concurrent creation, and returns validated IDs. |
| `steps/ensure-product-inventory.ts` | Ensures SKU inventory items, remote links, material, and missing stock levels; includes compensation. |
| `steps/sync-variant-images-from-sanity.ts` | Reconciles Sanity gallery URLs with Medusa variant-image relationships; includes compensation. |
| `steps/sync-category-from-sanity.ts` | Creates or updates a Medusa category from Sanity and records compensation data. |
| `steps/sync-product-to-sanity-step.ts` | Writes Medusa-owned product fields, tags, and category references into Sanity. |
| `steps/sync-variants-to-sanity-step.ts` | Queries Medusa variant structure and invokes the Sanity variant merge. |
| `steps/sync-category-to-sanity-step.ts` | Writes Medusa category title, description, slug, and hierarchy to Sanity. |
| `steps/sync-inventory-material-to-product-step.ts` | Follows inventory remote links and updates linked product material/translations. |
| `steps/sync-product-material-to-inventory-step.ts` | Copies product material to existing inventory items found by variant SKU. |
| `steps/delete-catalog-item.ts` | Performs inbound product/category deletion and checks the category-assignment guard. |
| `steps/delete-product-from-sanity-step.ts` | Deletes a product's Sanity document on Medusa product deletion. |
| `steps/delete-category-from-sanity-step.ts` | Deletes a category's Sanity document on Medusa category deletion. |
| `steps/batch-sync-step.ts` | Delegates inbound batches to the batch service and logs result metrics. |
| `steps/create-fresh-inventory.ts` | Standalone inventory creation helper retained in the codebase; not called by the current `index.ts` single-product flow. |
| `steps/link-variant-to-inventory.ts` | Standalone variant/inventory linking helper retained in the codebase; not called by the current `index.ts` single-product flow. |
| `steps/update-inventory-levels.ts` | Standalone inventory-level update helper retained in the codebase; not called by the current `index.ts` single-product flow. |

### Mapping, services, schemas, and supporting safeguards

| File | Responsibility |
| --- | --- |
| `utils/mappers.ts` | Converts Sanity product shape/locales/assets/options into the Medusa product-create shape. |
| `utils/batch-service.ts` | Processes products in bounded chunks for batch ingestion, including product, inventory, remote-link, and stock-level operations. |
| `modules/sanity-sync/index.ts` | Registers the custom Sanity module with Medusa. |
| `modules/sanity-sync/service.ts` | Makes authenticated Sanity HTTP query/mutation calls with bounded retries; merges and compares variant rows while preserving editorial fields. |
| `modules/sanity-sync/types.ts` | Types the Sanity variant documents and Medusa variant projection used during merge. |
| `modules/sanity-sync/__tests__/service.unit.spec.ts` | Tests editorial preservation, variant pruning and matching, unchanged writes, and retry behavior. |
| `src/utils/sync-lock.ts` | Shared Redis/process-local lease and marker implementation. |
| `src/utils/product-category-delete-guard.ts` | Prevents category deletion while products remain assigned. |
| `src/workflows/sanity-sync/SANITY.md` | Earlier architecture notes. This README describes the current code paths; verify older examples against source before relying on them. |
| `apps/cms/schemas/product.ts` | Sanity product schema, localized fields, tags, gallery, variant editorial galleries, SEO, and sync metadata. |
| `apps/cms/schemas/category.ts` | Sanity category schema, hierarchy, localized fields, SEO, and sync metadata. |
| `apps/cms/schemas/localizedObjects.ts` | Reusable English/French/Arabic string and text types, including RTL Arabic input. |
| `apps/cms/schemas/index.ts` | Registers CMS schema types. |

## Test guide

The tests are split by boundary and responsibility:

| Test file | What it covers |
| --- | --- |
| `src/api/sanity-sync/__tests__/route.spec.ts` | Webhook auth, body signature, idempotency, draft deferral, echo handling, category resolution, batch dispatch, and payload normalization. |
| `src/workflows/sanity-sync/__tests__/index.unit.spec.ts` | Inbound workflow lanes: batch, delete, create, update, localized mapping, tags, and variant media dispatch. |
| `src/workflows/sanity-sync/utils/__tests__/mappers.unit.spec.ts` | Sanity-to-Medusa conversion, locale fallbacks, malformed optional values, images, origin country, and inventory defaults. |
| `src/workflows/sanity-sync/steps/__tests__/resolve-product-tags.unit.spec.ts` | Existing-tag reuse, concurrent duplicate creation, and real creation failures. |
| `src/modules/sanity-sync/__tests__/service.unit.spec.ts` | Variant merge/preservation/pruning and transient HTTP retry behavior. |
| `src/workflows/sanity-sync/__tests__/sanity-sync.e2e.spec.ts` | End-to-end webhook lifecycle, draft/auth guards, category/product operations, and concurrency against the configured test environment. |
| `src/utils/__tests__/sync-lock.unit.spec.ts` | Local and Redis lease behavior, TTL, renewal, ownership, readiness, and production fail-closed behavior. |
| `src/utils/__tests__/product-category-delete-guard.unit.spec.ts` | Category deletion guard behavior. |
| `src/utils/__tests__/sanity-deletion.unit.spec.ts` | Sanity-side deletion workflow behavior. |

Run backend checks from the repository root:

```powershell
npm run typecheck --workspace=@dtc/backend
npm run test:unit --workspace=@dtc/backend
```

The route test is named `route.spec.ts`, not `route.unit.spec.ts`, so it is
outside the default unit-test filename glob. Run it explicitly:

```powershell
npm exec --workspace=@dtc/backend -- vitest run --config ./vitest.config.mts src/api/sanity-sync/__tests__/route.spec.ts
```

Run the end-to-end suite with its configured test type:

```powershell
npm run test:sync:e2e --workspace=@dtc/backend
```

Integration/e2e validation may require a reachable PostgreSQL and correctly
configured test credentials. Do not point destructive test setup at a live
catalog database.

## Operational notes and limits

- Configure the Sanity webhook to call `POST /sanity-sync` with either the
  configured token header or a raw-body HMAC-SHA256 signature. Configure
  `SANITY_PROJECT_ID`, dataset, Sanity API token, signing secret, and production
  `REDIS_URL` in the backend environment.
- Publish Sanity documents to sync them. A draft acknowledgment is not a
  Medusa write.
- Sanity mutations and Medusa database changes are separate systems. Workflow
  compensation protects supported Medusa steps, but it cannot provide
  two-phase commit across the Sanity API and Medusa database.
- The single-product workflow provisions missing inventory records and a
  zero-quantity level. It does not import a Sanity price matrix; pricing,
  customer-group rules, and fulfillment remain commerce-side concerns.
- Batch ingestion has a separate implementation in `utils/batch-service.ts`;
  do not assume every single-product behavior (including tag handling) is
  identical in the batch path without checking its current mapping.
- For debugging, correlate the webhook response and backend logs with the
  Sanity document ID, Medusa product/category ID, operation, and
  `correlationId`. Verify webhook projections include the fields the route
  needs, and verify the product document stores the matching
  `metadata.sanity_id`.
- The subscriber's missing-target-ID warning branch currently resolves its
  logger using a misspelled container key. Normal events with IDs do not take
  that branch, but fix the key before relying on graceful handling of malformed
  or incomplete Medusa events.

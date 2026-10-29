import type { Logger } from "@medusajs/framework/types";

interface SanityMutationResponse {
  error?: { description?: string; message?: string };
}

interface DeleteSanityDocumentOptions {
  documentId: string;
  logger: Logger;
  context: string;
}

const cleanDocumentId = (documentId: string): string =>
  documentId.startsWith("drafts.")
    ? documentId.slice("drafts.".length)
    : documentId;

export async function deleteSanityDocument({
  documentId,
  logger,
  context,
}: DeleteSanityDocumentOptions): Promise<void> {
  const token = process.env.SANITY_API_TOKEN;
  const projectId =
    process.env.SANITY_PROJECT_ID ||
    process.env.SANITY_STUDIO_PROJECT_ID ||
    "4vzx52ot";
  const dataset =
    process.env.SANITY_DATASET ||
    process.env.SANITY_STUDIO_DATASET ||
    "development";

  if (!token) {
    logger.warn(
      `[Sanity Delete Sync] Skipping ${context}: SANITY_API_TOKEN is not configured.`,
    );
    return;
  }

  const cleanId = cleanDocumentId(documentId);
  const mutationUrl = `https://${projectId}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(dataset)}`;

  try {
    const response = await fetch(mutationUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mutations: [
          { delete: { id: cleanId } },
          { delete: { id: `drafts.${cleanId}` } },
        ],
      }),
    });

    if (!response.ok) {
      let responseError: SanityMutationResponse = {};
      try {
        responseError = (await response.json()) as SanityMutationResponse;
      } catch {
        // Non-JSON response
      }

      const errorMessage =
        responseError.error?.description ||
        responseError.error?.message ||
        `HTTP ${response.status}`;

      // In Sanity, HTTP 409 means the product cannot be deleted because
      // another document (e.g., category or lookbook) still references it.
      if (response.status === 409) {
        logger.warn(
          `[Sanity Delete Sync Warn] Product [${cleanId}] has incoming references in Sanity: ${errorMessage}. Unlink references in Sanity Studio to purge completely.`,
        );
        return;
      }

      logger.warn(
        `[Sanity Delete Sync Warn] Content Lake rejected reverse delete for [${cleanId}]: ${errorMessage}. Proceeding safely.`,
      );
      return;
    }

    logger.info(
      `[Sanity Delete Sync] Successfully deleted Sanity document [${cleanId}] and any staging drafts (${context}).`,
    );
  } catch (error: unknown) {
    logger.error(
      `[Sanity Delete Sync] Network or unexpected failure deleting Sanity document [${cleanId}] (${context}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

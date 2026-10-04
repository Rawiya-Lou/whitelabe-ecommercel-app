import { MedusaError } from "@medusajs/framework/utils";
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
        // The HTTP status remains actionable if Sanity returned a non-JSON body.
      }
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        responseError.error?.description ||
          responseError.error?.message ||
          `Sanity mutation failed with HTTP ${response.status}.`,
      );
    }

    logger.info(
      `[Sanity Delete Sync] Deleted Sanity document [${cleanId}] (${context}).`,
    );
  } catch (error: unknown) {
    logger.error(
      `[Sanity Delete Sync] Failed to delete Sanity document [${cleanId}] (${context}): ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

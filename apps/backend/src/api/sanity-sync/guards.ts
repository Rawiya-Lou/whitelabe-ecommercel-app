import { MedusaRequest } from "@medusajs/framework/http";

interface GuardPayloadInput {
  _id?: string;
  _type?: string;
  _perspectives?: string[];
  productData?: {
    _id?: string;
    _perspectives?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}

// 1. YOUR API URL BUILDER HELPER CONTEXT
export const getSanityApiUrl = (
  projectId: string,
  dataset: string,
  groqQuery: string,
  perspectiveMode: "published" | "drafts" | string = "published"
): string => {
  try {
    const apiVersion = "v2026-10-08";
    const encodedQuery = encodeURIComponent(groqQuery);
    const cleanPerspective = encodeURIComponent(perspectiveMode);

    return `https://${projectId}.api.sanity.io/${apiVersion}/data/query/${dataset}?query=${encodedQuery}&perspective=${cleanPerspective}`;
  } catch (error) {
    return `https://${projectId}.api.sanity.io/v2026-10-08/data/query/${dataset}?query=&perspective=published`;
  }
};

// 2. EXPANDED CONCURRENT PERSPECTIVE VERIFIER GUARD
export async function shouldBlockStagingPayload(
  req: MedusaRequest, 
  payload: GuardPayloadInput, 
  documentId: string,
  cleanId: string
): Promise<{ block: boolean; reason?: string }> {
  
  // A: HTTP Headers Authentication Verification Check
  const syncToken = req.headers["x-sanity-sync-token"] as string | undefined;
  const publishableKey = req.headers["x-publishable-api-key"] as string | undefined;

  const expectedSyncToken = process.env.SANITY_SYNC_SECRET_TOKEN ;
  const expectedPublishableKey = process.env.PUBLISH_KEY || "pk_ea79ea0e54d16e2c6faf4b4bfb9049d3ad3b9a10fd7cc866d566f518f972999a";

  if (!syncToken || syncToken !== expectedSyncToken || !publishableKey || publishableKey !== expectedPublishableKey) {
    return { block: true, reason: "AUTHENTICATION_FAILURE" };
  }

  // B: Parse the incoming request URL perspective layer parameter
  const urlPerspective = req.query.perspective as string | undefined;

  // C: Fast-track drop rules for explicit drafts typing actions
  const isDraftId = documentId.startsWith("drafts.");
  const rawIdFromPayload = payload._id || payload.productData?._id || "";
  const isRawIdDraft = rawIdFromPayload.startsWith("drafts.");

  if (urlPerspective === "drafts" || isDraftId || isRawIdDraft) {
    return { block: true, reason: "UNPUBLISHED_STAGING_CONTEXT" };
  }

  // Highlight-Start
  // D: LIVE SANITY API PERSPECTIVE EDGE ROAD VALIDATOR
  // If the payload has a non-prefixed ID but lacks clear data flags, call the query helper directly
  try {
    const projectId = process.env.SANITY_PROJECT_ID || "4vzx52ot"; // Replace with your default project ID fallback
    const dataset = process.env.SANITY_DATASET || "development";

    // Request the CDN to verify if a clean copy exists on the live "published" branch 
    const groqQuery = `*[_id == "${cleanId}" && !(_id in drafts)]._id`;
    const targetValidationUrl = getSanityApiUrl(projectId, dataset, groqQuery, "published");

    const sanityResponse = await fetch(targetValidationUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SANITY_API_TOKEN && {
          Authorization: `Bearer ${process.env.SANITY_API_TOKEN}`
        })
      },
      signal: AbortSignal.timeout(3000) // 3-second safeguard timeout
    });

    if (!sanityResponse.ok) {
      // If Sanity blocks the request or throws an access code error, abort the transaction
      return { block: true, reason: "UNPUBLISHED_STAGING_CONTEXT" };
    }

    const queryData = await sanityResponse.json();
    const publishedDocumentExists = queryData.result && queryData.result.length > 0;

    // If Sanity replies with an empty matching array payload, block the ingestion pipeline
    if (!publishedDocumentExists) {
      return { block: true, reason: "UNPUBLISHED_STAGING_CONTEXT" };
    }
  } catch (edgeError) {
    // If the network call breaks down, safe-abort to protect inventory database tables
    return { block: true, reason: "UNPUBLISHED_STAGING_CONTEXT" };
  }
  // Highlight-End

  return { block: false };
}

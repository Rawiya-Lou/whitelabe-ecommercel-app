import {MedusaError} from "@medusajs/framework/utils";
const resolveSetting = (
  canonicalName: string,
  studioName: string,
): string | undefined => {
  const canonicalValue = process.env[canonicalName]?.trim();
  const studioValue = process.env[studioName]?.trim();

  if (
    canonicalValue &&
    studioValue &&
    canonicalValue !== studioValue
  ) {
    throw new MedusaError (
      MedusaError.Types.INVALID_DATA,
      `${canonicalName} and ${studioName} must reference the same Sanity configuration.`,
    );
  }

  return canonicalValue || studioValue || undefined;
};

export function getSanityConfig() {
  return {
    projectId: resolveSetting(
      "SANITY_PROJECT_ID",
      "SANITY_STUDIO_PROJECT_ID",
    ),
    dataset: resolveSetting("SANITY_DATASET", "SANITY_STUDIO_DATASET"),
    apiToken: process.env.SANITY_API_TOKEN?.trim() || undefined,
  };
}

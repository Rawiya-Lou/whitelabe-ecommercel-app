export function getBackendPublicUrl(): string | undefined {
  const configuredUrl =
    process.env.BACKEND_URL ||
    process.env.MEDUSA_BACKEND_URL ||
    process.env.RENDER_EXTERNAL_URL;

  return configuredUrl?.trim().replace(/\/+$/, "") || undefined;
}

export function getSanityImageFallbackUrl(): string {
  const configuredFallback = process.env.SANITY_IMAGE_FALLBACK_URL?.trim();
  if (configuredFallback) {
    return configuredFallback;
  }

  const backendUrl = getBackendPublicUrl() || "http://localhost:9000";

  return `${backendUrl}/static/placeholder.png`;
}

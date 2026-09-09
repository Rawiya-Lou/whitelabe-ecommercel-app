import createImageUrlBuilder from '@sanity/image-url';
import { env } from '../app/env.mjs';

const builder = createImageUrlBuilder({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID || '4vzx52ot',
  dataset: env.NEXT_PUBLIC_SANITY_DATASET || 'production',
});

// Strictly typed helper to generate image URLs from Sanity image source objects
export function urlFor(source: Parameters<typeof builder.image>[0]) {
  return builder.image(source);
}
import { createImageUrlBuilder } from '@sanity/image-url'; 
import { env } from '@/app/env.mjs';


const builder = createImageUrlBuilder({
  projectId: env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? '',
  dataset: env.NEXT_PUBLIC_SANITY_DATASET || 'production',
});


export function urlFor(source: Parameters<typeof builder.image>[0]) {
  if (!source) {
    return builder.image({
      asset: { _ref: "image-placeholder-png", _type: "reference" }
    });
  }
  
  return builder.image(source);
}

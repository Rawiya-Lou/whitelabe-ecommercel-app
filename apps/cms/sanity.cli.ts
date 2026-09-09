import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || '4vzx52ot',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  studioHost: 'dtc-storefront-cms',
});
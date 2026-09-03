import { describe, it, expect } from "vitest";
import {env} from '../env.mjs'

describe('Next.js to Medusa Backend Link Verification', () => {
  it('should successfully reach the Medusa v2 store endpoint using public keys', async () => {
   const backendUrl = env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
    const publishableKey = env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;

    // Fire a direct native fetch request replicating a real storefront component
    const response = await fetch(`${backendUrl}/store/products`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': publishableKey, // Appends your required V2 security token
      },
    });

    const data = await response.json();
    if (response.status !== 200) {
    console.error('Medusa API Error:', { status: response.status, data });
  }

    // The test passes if Medusa accepts the request and returns a valid product payload list
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('products');
    expect(Array.isArray(data.products)).toBe(true);
  });
});

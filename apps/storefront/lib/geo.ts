import { headers } from 'next/headers';

export interface GeoContext {
  country: string;
  isAlgeria: boolean;
  currency: 'dzd' | 'eur' | 'usd';
  enableWilayaShipping: boolean;
}

export async function getGeoContext(): Promise<GeoContext> {
  const headerList = await headers();
  const country = headerList.get('x-user-country') || 'DZ';
  const isAlgeria = country === 'DZ';

  return {
    country,
    isAlgeria,
    currency: isAlgeria ? 'dzd' : 'eur',
    enableWilayaShipping: isAlgeria,
  };
}
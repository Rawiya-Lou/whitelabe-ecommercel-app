import { getGeoContext } from '@/lib/geo';
import { getTranslations } from 'next-intl/server';

export async function RegionalBanner() {
  const geo = await getGeoContext();
  const t = await getTranslations('Common');

  if (!geo.isAlgeria) {
    return null;
  }

  return (
    <div className="bg-emerald-900 text-emerald-100 text-sm py-2 px-4 text-center font-medium">
      <p>
        🇩🇿 {t('welcome')} — {t('currency')} (DZD) | {t('wilayaNotice')}
      </p>
    </div>
  );
}
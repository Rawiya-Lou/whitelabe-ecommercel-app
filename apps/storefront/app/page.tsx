import { redirect } from 'next/navigation';
import { routing } from '@/i18n/routing';

export default function RootPage() {
  // Automatically redirect `/` to default locale (e.g., `/en` or `/ar`)
  redirect(`/${routing.defaultLocale}`);
}
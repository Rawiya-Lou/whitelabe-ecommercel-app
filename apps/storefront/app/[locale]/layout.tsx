import React from "react";
import { notFound } from "next/navigation";
import { getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { routing } from "@/i18n/routing";
import { LOCALS } from "@/i18n/constants";
import { getLocaleDirection } from "@/utils/locale";
import { MedusaStoreProvider } from "@/providers/store-provider";

export { generateMetadata } from "./metadata";
export { generateStaticParams } from "./static-params";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;

  // Validate locale segment
  if (!routing.locales.includes(locale as LOCALS)) {
    notFound();
  }

  const direction = getLocaleDirection(locale);
  const messages = await getMessages();

  return (
    <html 
      lang={locale} 
      dir={direction} 
      className="scroll-smooth"
      suppressHydrationWarning
    >
      <body 
        className={`${
          locale === "ar" ? "font-arabic" : "font-sans"
        } antialiased bg-white text-neutral-900 selection:bg-neutral-900 selection:text-white`}
      >
        {/* Provides translation keys to interactive Client Components (Cart Drawer, Modals) */}
        <NextIntlClientProvider messages={messages} locale={locale}>
          <MedusaStoreProvider locale={locale as `${LOCALS}`}>
            <div className="min-h-screen flex flex-col">
              {children}
            </div>
          </MedusaStoreProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
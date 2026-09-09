import React from "react";
import { getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { LOCALS } from "../../i18n/constants";
import Script from "next/script"; 
import { headers } from "next/headers"; 
export { generateMetadata } from "./metadata";
export { generateStaticParams } from "./static-params";

interface LayoutProps {
  children: React.ReactNode,
  params: Promise<{ locale: string }>,
};

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as LOCALS)) {
    notFound();
  }
  const isRtl = locale === LOCALS.AR;
  let messages = {};
  
  try {
    messages = await getMessages();
  } catch (err) {
    console.error("CRITICAL ERROR inside getMessages():", err);
    throw err;
  }

  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") || undefined;
  const ClientProviderShell = NextIntlClientProvider as unknown as React.ComponentType<{
    children: React.ReactNode;
    messages: Record<string, unknown>;
    locale: string;
  }>;
  return (
    <html lang={locale} dir={isRtl ? "rtl" : "ltr"}>
      <body>
        <ClientProviderShell messages={messages} locale={locale}>
          {children}
        </ClientProviderShell>
        
        <Script
          src="https://js.stripe.com/v3/"
          strategy="afterInteractive"
          nonce={nonce}
        />
      </body>
    </html>
  );
}

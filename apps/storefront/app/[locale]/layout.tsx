import "../globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { LOCALS } from "../../i18n/request";
import { routing } from "../../i18n/routing";
import { getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { headers } from "next/headers";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

interface LocalizedLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale?: string }>;
}

export default async function LocalizedLayout({
  children,
  params,
}: LocalizedLayoutProps) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as LOCALS)) {
    notFound();
  }
  const headerList = await headers();
  const nonce = headerList.get("x-nonce") || undefined;
  const messages = await getMessages();
  const isRtl = locale === "ar";
  return (
    <html
      lang={locale}
      dir={isRtl ? "rtl" : "ltr"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head></head>
      <body dir={isRtl ? "rtl" : "ltr"} className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
        </NextIntlClientProvider>

        {/* Third-Party Script with Mandatory Cryptographic Nonce */}
        <Script
          src="https://js.stripe.com/v3/"
          strategy="afterInteractive"
          nonce={nonce}
        />
      </body>
    </html>
  );
}

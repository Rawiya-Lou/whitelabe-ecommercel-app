// app/[locale]/checkout/layout.tsx
import Script from "next/script";
import { headers } from "next/headers";

export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") || undefined;
  const country = requestHeaders.get("x-user-country");

  return (
    <div className="checkout-container">
      {children}

      {/* Load Stripe ONLY during checkout, and ONLY for non-Algerian traffic if desired */}
      {country !== "DZ" && (
        <Script
          src="https://js.stripe.com/v3/"
          strategy="lazyOnload"
          nonce={nonce}
        />
      )}
    </div>
  );
}
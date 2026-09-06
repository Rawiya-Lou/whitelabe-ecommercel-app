import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whitelabel ecommerce storefront",
  description: "Whitelabel ecommerce storefront website",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  return children;
}

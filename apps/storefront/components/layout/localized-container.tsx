import React from "react";
import { getLocaleDirection } from "@/utils/locale";
import { LOCALS } from "@/i18n/constants";

interface LocalizedContainerProps {
  children: React.ReactNode;
  locale: `${LOCALS}`;
  className?: string;
  as?: "div" | "section" | "article" | "main" | "header" | "footer";
}

/**
 * Production-ready layout primitive responding natively to bidirectional (RTL/LTR) formatting controls.
 * Bypasses explicit text alignment hardcoding by trusting native HTML layout properties.
 */
export function LocalizedContainer({
  children,
  locale,
  className = "",
  as: Component = "div",
}: LocalizedContainerProps) {
  const direction = getLocaleDirection(locale);

  return (
    <Component
      dir={direction}
      lang={locale}
      className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-300 ${
        direction === "rtl" 
          ? "text-right font-sans-arabic" // Binds localized typographic font properties
          : "text-left font-sans"
      } ${className}`}
    >
      {children}
    </Component>
  );
}

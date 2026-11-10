"use client";

import React, { useState, useTransition } from "react";
import { useMedusaStoreContext } from "@/providers/medusa-store-context";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LOCALS } from "@/i18n/constants";

function setCountryCookie(countryCode: string) {
  if (typeof document !== "undefined") {
    document.cookie = `_medusa_country=${countryCode.toUpperCase()}; path=/; max-age=${
      60 * 60 * 24 * 365
    }; SameSite=Lax`;
  }
}

export function RegionLanguageSwitcher() {
  const { region, regions, locale } = useMedusaStoreContext();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const [isOpen, setIsOpen] = useState(false);

  // 1. Handle Language Switch (maintains current page URL)
  const handleLanguageChange = (newLocale: LOCALS) => {
    startTransition(() => {
      router.replace(pathname, { locale: newLocale });
      setIsOpen(false);
    });
  };

  // 2. Handle Country / Currency Switch
  const handleCountryChange = (countryCode: string) => {
    setCountryCookie(countryCode);

    startTransition(() => {
      router.refresh();
      setIsOpen(false);
    });
  };

  const currentCountry = region?.countries?.[0]?.iso_2?.toUpperCase() || "US";

  return (
    <div className="relative inline-block text-start">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-neutral-300 hover:border-neutral-900 transition-colors bg-white shadow-sm"
      >
        <span className="uppercase font-bold">{currentCountry}</span>
        <span>•</span>
        <span>{region?.currency_code?.toUpperCase()}</span>
        <span>•</span>
        <span className="uppercase">{locale}</span>
      </button>

      {/* Modal / Dropdown using canonical `inset-e-0` */}
      {isOpen && (
        <div className="absolute inset-e-0 mt-2 w-72 p-5 bg-white rounded-2xl shadow-2xl border border-neutral-100 z-50 flex flex-col gap-5">
          <div className="flex justify-between items-center border-b pb-3">
            <h4 className="font-bold text-sm text-neutral-900">
              {t("language")} & {t("currency")}
            </h4>
            <button
              onClick={() => setIsOpen(false)}
              className="text-neutral-400 hover:text-neutral-900 text-sm font-bold"
            >
              ✕
            </button>
          </div>

          {/* Language Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {t("language")}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { code: "en", label: "English" },
                { code: "fr", label: "Français" },
                { code: "ar", label: "العربية" },
              ].map((lang) => (
                <button
                  key={lang.code}
                  disabled={isPending}
                  onClick={() => handleLanguageChange(lang.code as LOCALS)}
                  className={`py-2 px-1 text-xs font-semibold rounded-lg border text-center transition-all ${
                    locale === lang.code
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Country / Currency Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Country & Currency
            </label>
            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {regions.map((r) => {
                const country = r.countries?.[0];
                if (!country) return null;
                const isSelected = r.id === region?.id;

                return (
                  <button
                    key={r.id}
                    disabled={isPending}
                    onClick={() => handleCountryChange(country.iso_2)}
                    className={`flex items-center justify-between p-2.5 rounded-lg text-xs font-medium border text-start transition-all ${
                      isSelected
                        ? "border-neutral-900 bg-neutral-50 font-bold text-neutral-900"
                        : "border-transparent hover:bg-neutral-50 text-neutral-600"
                    }`}
                  >
                    <span>{country.display_name || country.iso_2.toUpperCase()}</span>
                    <span className="font-mono text-neutral-400">
                      {r.currency_code.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
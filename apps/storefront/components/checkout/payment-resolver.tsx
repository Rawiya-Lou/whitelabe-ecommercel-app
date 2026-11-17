"use client";

import React from "react";
import { useMedusaStoreContext } from "@/providers/medusa-store-context";
import { useTranslations } from "next-intl";

/*
Role: Automatically renders Chargily (Edahabia/CIB) or Stripe (Cards/Apple Pay) based on what Medusa returned for the cart's region.
*/

/*
And from apps/storefront during checkout submission, pass the selected Wilaya & Commune directly when attaching the shipping method to the cart:

await medusaClient.store.cart.addShippingMethod(cartId, {
  option_id: selectedOptionId, // "Home Delivery" or "Stop-Desk" option ID
  data: {
    wilaya_code: selectedWilayaCode,
    commune_name_fr: selectedCommune.name_fr,
    delivery_mode: isStopDesk ? "desk" : "home",
  },
});

*/

interface PaymentResolverProps {
  paymentProviders: Array<{ id: string }>;
  selectedProviderId: string;
  onSelectProvider: (id: string) => void;
}

export function PaymentResolver({
  paymentProviders,
  selectedProviderId,
  onSelectProvider,
}: PaymentResolverProps) {
  const t = useTranslations("checkout");
  const { isAlgeria } = useMedusaStoreContext();

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-bold text-neutral-900">{t("paymentMethod")}</h3>

      <div className="grid grid-cols-1 gap-3">
        {paymentProviders.map((provider) => {
          const isSelected = selectedProviderId === provider.id;

          // 1. Algerian Chargily Payment (Edahabia & CIB)
          if (provider.id.includes("chargily")) {
            return (
              <label
                key={provider.id}
                onClick={() => onSelectProvider(provider.id)}
                className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  isSelected ? "border-blue-600 bg-blue-50/50" : "border-neutral-200"
                }`}
              >
                <div>
                  <p className="font-semibold text-neutral-900">
                    {isAlgeria ? "البطاقة الذهبية / CIB (Chargily Pay)" : "Local Algerian Card"}
                  </p>
                  <p className="text-xs text-neutral-500">Paiement sécurisé via Edahabia & CIB</p>
                </div>
                <input type="radio" checked={isSelected} readOnly />
              </label>
            );
          }

          // 2. Global Stripe (Visa, Mastercard, Apple Pay, Amex)
          if (provider.id.includes("stripe")) {
            return (
              <label
                key={provider.id}
                onClick={() => onSelectProvider(provider.id)}
                className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  isSelected ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
                }`}
              >
                <div>
                  <p className="font-semibold text-neutral-900">Credit / Debit Card</p>
                  <p className="text-xs text-neutral-500">Visa, Mastercard, American Express, Apple Pay</p>
                </div>
                <input type="radio" checked={isSelected} readOnly />
              </label>
            );
          }

          // 3. Cash on Delivery (Manual Provider)
          if (provider.id.includes("manual")) {
            return (
              <label
                key={provider.id}
                onClick={() => onSelectProvider(provider.id)}
                className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  isSelected ? "border-green-600 bg-green-50/50" : "border-neutral-200"
                }`}
              >
                <div>
                  <p className="font-semibold text-neutral-900">Cash on Delivery</p>
                  <p className="text-xs text-neutral-500">Pay when you receive your package</p>
                </div>
                <input type="radio" checked={isSelected} readOnly />
              </label>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
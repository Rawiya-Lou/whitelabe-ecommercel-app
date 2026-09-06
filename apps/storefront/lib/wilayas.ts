export interface Wilaya {
  code: number;
  nameEn: string;
  nameFr: string;
  nameAr: string;
  homeDeliveryFee: number;
  deskDeliveryFee: number;
}

export const ALGERIAN_WILAYAS: Wilaya[] = [
  { code: 1, nameEn: "Adrar", nameFr: "Adrar", nameAr: "أدرار", homeDeliveryFee: 1000, deskDeliveryFee: 600 },
  { code: 14, nameEn: "Tissemsilt", nameFr: "Tissemsilt", nameAr: "تيسمسيلت", homeDeliveryFee: 700, deskDeliveryFee: 400 },
  { code: 16, nameEn: "Algiers", nameFr: "Alger", nameAr: "الجزائر", homeDeliveryFee: 500, deskDeliveryFee: 300 },
  { code: 31, nameEn: "Oran", nameFr: "Oran", nameAr: "وهران", homeDeliveryFee: 600, deskDeliveryFee: 350 },
  // Additional wilayas added dynamically or imported from Medusa regional settings
];
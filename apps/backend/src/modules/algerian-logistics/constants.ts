export function normalizeLocationKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const WILAYA_ENGLISH_NAMES: Record<number, string> = {
  1: "Adrar",
  2: "Chlef",
  3: "Laghouat",
  4: "Oum El Bouaghi",
  5: "Batna",
  6: "Béjaïa",
  7: "Biskra",
  8: "Béchar",
  9: "Blida",
  10: "Bouira",
  11: "Tamanrasset",
  12: "Tébessa",
  13: "Tlemcen",
  14: "Tiaret",
  15: "Tizi Ouzou",
  16: "Algiers",
  17: "Djelfa",
  18: "Jijel",
  19: "Sétif",
  20: "Saïda",
  21: "Skikda",
  22: "Sidi Bel Abbès",
  23: "Annaba",
  24: "Guelma",
  25: "Constantine",
  26: "Médéa",
  27: "Mostaganem",
  28: "M'Sila",
  29: "Mascara",
  30: "Ouargla",
  31: "Oran",
  32: "El Bayadh",
  33: "Illizi",
  34: "Bordj Bou Arréridj",
  35: "Boumerdès",
  36: "El Tarf",
  37: "Tindouf",
  38: "Tissemsilt",
  39: "El Oued",
  40: "Khenchela",
  41: "Souk Ahras",
  42: "Tipaza",
  43: "Mila",
  44: "Aïn Defla",
  45: "Naâma",
  46: "Aïn Témouchent",
  47: "Ghardaïa",
  48: "Relizane",
  49: "Timimoun",
  50: "Bordj Badji Mokhtar",
  51: "Ouled Djellal",
  52: "Béni Abbès",
  53: "In Salah",
  54: "In Guezzam",
  55: "Touggourt",
  56: "Djanet",
  57: "El M'Ghair",
  58: "El Meniaa",
  59: "Aflou",
  60: "Barika",
  61: "El Kantara",
  62: "Bir El Ater",
  63: "El Aricha",
  64: "Ksar Chellala",
  65: "Aïn Oussara",
  66: "Messaad",
  67: "Ksar El Boukhari",
  68: "Bou Saâda",
  69: "El Abiodh Sidi Cheikh",
};

// Official mother wilaya codes for 2026 wilayas (59-69) until all couriers migrate
export const MOTHER_WILAYA_CODES: Record<number, number> = {
  59: 3,  // Aflou <- Laghouat
  60: 5,  // Barika <- Batna
  61: 7,  // El Kantara <- Biskra
  62: 12, // Bir El Ater <- Tébessa
  63: 13, // El Aricha <- Tlemcen
  64: 14, // Ksar Chellala <- Tiaret
  65: 17, // Aïn Oussara <- Djelfa
  66: 17, // Messaad <- Djelfa
  67: 26, // Ksar El Boukhari <- Médéa
  68: 28, // Bou Saâda <- M'Sila
  69: 32, // El Abiodh Sidi Cheikh <- El Bayadh
};
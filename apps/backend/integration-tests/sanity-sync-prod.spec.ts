import { describe, it, expect, beforeAll } from "vitest";
import { loadEnv, MedusaError } from "@medusajs/framework/utils";
import path from "path";
import fs from "fs";

loadEnv(process.env.NODE_ENV || "production", process.cwd());

const PROJECT_ID =
  process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
const DATASET = "production";
const SANITY_TOKEN = process.env.SANITY_API_TOKEN;
const MEDUSA_URL = (
  process.env.BACKEND_URL ||
  process.env.MEDUSA_BACKEND_URL ||
  ""
).replace(/\/+$/, "");
const SECRET_TOKEN = process.env.SANITY_SYNC_SECRET_TOKEN || "";

// Global cached asset for 100% reliable fallbacks
let cachedFallbackAsset: { id: string; url: string };

async function waitForRenderWakeup(maxWaitMs = 90000): Promise<void> {
  console.log(
    `⏳ Pinging Render backend (${MEDUSA_URL}) to wake from sleep...`,
  );
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${MEDUSA_URL}/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || res.status < 500) {
        console.log("🟢 Render backend is awake and ready!");
        return;
      }
    } catch {
      process.stdout.write(".");
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Render backend failed to wake up within 90 seconds.");
}


async function uploadRemoteImageToSanity(
  imageUrl: string,
  fileName: string,
): Promise<{ id: string; url: string }> {
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();

    const uploadUrl = `https://${PROJECT_ID}.api.sanity.io/v2021-06-07/assets/images/${encodeURIComponent(
      DATASET,
    )}?filename=${encodeURIComponent(fileName)}`;

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SANITY_TOKEN}`,
        "Content-Type": "image/jpeg",
      },
      body: new Uint8Array(arrayBuffer),
    });

    const data = await uploadRes.json();
    if (data?.document?._id) {
      return { id: data.document._id, url: data.document.url };
    }
    throw new Error("Invalid Sanity upload response");
  } catch (err: any) {
    console.warn(`  ⚠️ Using cached fallback image for "${fileName}"`);
    return cachedFallbackAsset;
  }
}

function createOpenGraphImage(primaryAssetId: string) {
  if (!primaryAssetId) return undefined;
  return {
    _type: "image",
    hotspot: { x: 0.5, y: 0.5, height: 1.0, width: 1.0 },
    asset: {
      _type: "reference",
      _ref: primaryAssetId,
    },
  };
}

async function mutateSanity(mutations: object[]): Promise<any> {
  const url = `https://${PROJECT_ID}.api.sanity.io/v2021-06-07/data/mutate/${encodeURIComponent(
    DATASET,
  )}?returnDocuments=true`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SANITY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mutations }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Sanity Mutation Error (${response.status}): ${JSON.stringify(body, null, 2)}`,
    );
  }
  return body;
}

async function postWebhookToMedusa(
  payload: Record<string, any>,
  operation: "create" | "update" | "delete",
  docId: string
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${MEDUSA_URL}/sanity-sync`, {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: {
      "Content-Type": "application/json",
      "x-sanity-sync-token": SECRET_TOKEN,
      "sanity-operation": operation,
      "sanity-document-id": docId,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  // IF ALREADY CREATED BY LIVE SANITY WEBHOOK, IT'S A SUCCESS:
  const errorText = JSON.stringify(body);
  if (operation === "create" && errorText.includes("already exists")) {
    console.log(`  ✔ Already synced automatically via Live Sanity Webhook!`);
    return { status: 200, body: { success: true, alreadySynced: true } };
  }

  if (response.status >= 300) {
    console.error(`✖ Medusa Rejected ${docId}:`, JSON.stringify(body, null, 2));
  }

  return { status: response.status, body };
}


const seed = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;


const CATEGORIES_SPEC = [
  {
    id: `cat-shirts-${seed}`,
    medusaId: `medusa_cat_shirts_${seed}`,
    slug: `shirts-and-blouses-${seed}`,
    banner:
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=75",
    isParent: false,
    title: {
      en: "Shirts & Blouses",
      fr: "Chemises & Blouses",
      ar: "قمصان وبلوزات",
    },
    description: {
      en: "Everyday poplin button-downs and Oxford shirts.",
      fr: "Chemises en popeline casual et oxford.",
      ar: "قمصان وبلوزات قطنية مريحة.",
    },
    alt: { en: "Shirts Banner", fr: "Bannière Chemises", ar: "شعار القمصان" },
    metaTitle: {
      en: "Shirts & Blouses | Everyday Wear",
      fr: "Chemises & Blouses",
      ar: "قمصان وبلوزات كاجوال",
    },
    metaDescription: {
      en: "Classic everyday casual shirts.",
      fr: "Chemises du quotidien.",
      ar: "أفضل القمصان اليومية.",
    },
  },
  {
    id: `cat-dresses-${seed}`,
    medusaId: `medusa_cat_dresses_${seed}`,
    slug: `dresses-and-jumpsuits-${seed}`,
    banner:
      "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=75",
    isParent: false,
    title: {
      en: "Dresses & Jumpsuits",
      fr: "Robes & Combinaisons",
      ar: "فساتين وجمبسوت",
    },
    description: {
      en: "Casual wrap dresses and ribbed knits.",
      fr: "Robes portefeuille fleuries et mailles.",
      ar: "فساتين صيفية مريحة.",
    },
    alt: { en: "Dresses Banner", fr: "Bannière Robes", ar: "شعار الفساتين" },
    metaTitle: {
      en: "Dresses & Jumpsuits",
      fr: "Robes & Combinaisons",
      ar: "فساتين وجمبسوت",
    },
    metaDescription: {
      en: "Comfortable dresses for everyday wear.",
      fr: "Robes pour tous les jours.",
      ar: "فساتين يومية أنيقة.",
    },
  },
  {
    id: `cat-tshirts-${seed}`,
    medusaId: `medusa_cat_tshirts_${seed}`,
    slug: `tshirts-and-tops-${seed}`,
    banner:
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=75",
    isParent: false,
    title: {
      en: "T-Shirts & Tops",
      fr: "T-Shirts & Hauts",
      ar: "تيشيرتات وتوبات",
    },
    description: {
      en: "Heavyweight boxy tees and ribbed basics.",
      fr: "T-shirts basiques en coton épais.",
      ar: "تيشيرتات قطنية مريحة.",
    },
    alt: { en: "Tops Banner", fr: "Bannière Hauts", ar: "شعار التيشيرتات" },
    metaTitle: {
      en: "T-Shirts & Tops",
      fr: "T-Shirts & Hauts",
      ar: "تيشيرتات وتوبات",
    },
    metaDescription: {
      en: "Everyday staple t-shirts.",
      fr: "T-shirts essentiels du quotidien.",
      ar: "تيشيرتات أساسية.",
    },
  },
  {
    id: `cat-pants-${seed}`,
    medusaId: `medusa_cat_pants_${seed}`,
    slug: `jeans-and-trousers-${seed}`,
    banner:
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=75",
    isParent: false,
    title: {
      en: "Jeans & Trousers",
      fr: "Jeans & Pantalons",
      ar: "بناطيل وجينزات",
    },
    description: {
      en: "Straight-leg denim and wide-leg chinos.",
      fr: "Jeans droits et pantalons chino.",
      ar: "جينزات كلاسيكية وبناطيل قماشية.",
    },
    alt: { en: "Pants Banner", fr: "Bannière Pantalons", ar: "شعار البناطيل" },
    metaTitle: {
      en: "Jeans & Trousers",
      fr: "Jeans & Pantalons",
      ar: "بناطيل وجينزات",
    },
    metaDescription: {
      en: "Everyday trousers and denim.",
      fr: "Pantalons pour tous les jours.",
      ar: "بناطيل يومية مريحة.",
    },
  },
  {
    id: `cat-everyday-parent-${seed}`,
    medusaId: `medusa_cat_parent_${seed}`,
    slug: `everyday-wardrobe-${seed}`,
    banner:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=600&q=75",
    isParent: true,
    children: [
      `cat-shirts-${seed}`,
      `cat-dresses-${seed}`,
      `cat-tshirts-${seed}`,
      `cat-pants-${seed}`,
    ],
    title: {
      en: "Everyday Wardrobe Collection",
      fr: "Collection Vestiaire Quotidien",
      ar: "المجموعة الكاملة للملابس اليومية",
    },
    description: {
      en: "Complete casual line for everyday wear.",
      fr: "Ligne complète de prêt-à-porter contemporain.",
      ar: "التشكيلة الشاملة للأزياء اليومية.",
    },
    alt: {
      en: "Everyday Main Banner",
      fr: "Bannière Principale",
      ar: "شعار التشكيلة الشاملة",
    },
    metaTitle: {
      en: "Everyday Wardrobe",
      fr: "Vestiaire Quotidien",
      ar: "الملابس اليومية",
    },
    metaDescription: {
      en: "Casual street fashion line.",
      fr: "Mode contemporaine du quotidien.",
      ar: "أزياء يومية عصرية.",
    },
  },
];


const PRODUCTS_SPEC = [
  {
    slug: `classic-regular-oxford-shirt-${seed}`,
    type: "Shirts",
    categoryKey: 0,
    tags: ["Basics", "Workwear", "Casual", "Cotton"],
    title: {
      en: "Classic Regular-Fit Oxford Shirt",
      fr: "Chemise Oxford Coupe Standard Blanche",
      ar: "قميص أكسفورد أبيض كلاسيكي مريح",
    },
    desc: {
      en: "Everyday button-down shirt in durable washed Oxford cotton.",
      fr: "Chemise boutonnée décontractée en coton Oxford lavé.",
      ar: "قميص كلاسيكي يومي بأزرار من قطن الأكسفورد المتين.",
    },
    material: {
      en: "100% Washed Cotton",
      fr: "100% Coton Lavé",
      ar: "100% قطن مغسول",
    },
    highlights: [
      {
        en: "Soft-washed breathable Oxford weave",
        fr: "Tissage Oxford lavé doux et respirant",
        ar: "نسيج أكسفورد ناعم وجيد التهوية",
      },
      {
        en: "Button-down collar keeping shape",
        fr: "Col boutonné garantissant une tenue nette",
        ar: "ياقة بأزرار تحافظ على شكلها",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Men's White Oxford Shirt",
        fr: "Chemise Oxford Blanche",
        ar: "قميص أكسفورد رجالي",
      },
      metaDescription: {
        en: "Regular-fit cotton Oxford shirt.",
        fr: "Chemise Oxford blanche en coton.",
        ar: "قميص أكسفورد أبيض قطني.",
      },
      keywords: ["oxford shirt", "white shirt", "casual"],
    },
  },
  {
    slug: `oversized-striped-poplin-shirt-${seed}`,
    type: "Shirts",
    categoryKey: 0,
    tags: ["Striped", "Oversized", "Everyday"],
    title: {
      en: "Oversized Striped Poplin Shirt",
      fr: "Chemise Oversize Rayée en Popeline",
      ar: "قميص مخطط واسع من قماش البوبلين",
    },
    desc: {
      en: "Relaxed boyfriend-style striped poplin shirt with spread collar.",
      fr: "Chemise ample à fines rayures en popeline légère.",
      ar: "قميص مخطط كاجوال بأكتاف منسدلة.",
    },
    material: {
      en: "100% Poplin Cotton",
      fr: "100% Popeline de Coton",
      ar: "100% قطن بوبلين",
    },
    highlights: [
      {
        en: "Lightweight poplin texture",
        fr: "Texture popeline légère",
        ar: "نسيج بوبلين خفيف",
      },
      {
        en: "Longer back hem for easy layering",
        fr: "Pan arrière plus long",
        ar: "حافة خلفية أطول",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1582533561751-ef6f6ab93a2e?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Oversized Striped Shirt",
        fr: "Chemise Oversize Rayée",
        ar: "قميص مخطط واسع",
      },
      metaDescription: {
        en: "Relaxed striped poplin shirt.",
        fr: "Chemise rayée décontractée.",
        ar: "قميص بوبلين مخطط.",
      },
      keywords: ["striped shirt", "poplin", "casual"],
    },
  },
  {
    slug: `floral-print-wrap-midi-dress-${seed}`,
    type: "Dresses",
    categoryKey: 1,
    tags: ["Floral", "Summer Dress", "Casual"],
    title: {
      en: "Floral Print Wrap Midi Dress",
      fr: "Robe Portefeuille Midi Imprimé Fleuri",
      ar: "فستان ميدي مورّد بقصة لف صيفية",
    },
    desc: {
      en: "Flowy V-neck wrap dress featuring flutter sleeves.",
      fr: "Robe portefeuille fluide avec manches volantées.",
      ar: "فستان صيفي ميدي ناعم بنقشة زهور.",
    },
    material: {
      en: "100% Soft Viscose",
      fr: "100% Viscose Fluide",
      ar: "100% فيسكوز ناعم",
    },
    highlights: [
      {
        en: "Flattering adjustable wrap closure",
        fr: "Coupe portefeuille ajustable",
        ar: "تصميم لف جانبي مريح",
      },
      {
        en: "Breathable featherlight viscose",
        fr: "Viscose légère et respirante",
        ar: "قماش فيسكوز خفيف",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Floral Wrap Midi Dress",
        fr: "Robe Portefeuille Fleurie",
        ar: "فستان ميدي مورد",
      },
      metaDescription: {
        en: "Botanical print wrap dress.",
        fr: "Robe midi portefeuille imprimée.",
        ar: "فستان صيفي ميدي مورد.",
      },
      keywords: ["wrap dress", "floral dress", "summer dress"],
    },
  },
  {
    slug: `sleeveless-ribbed-knit-midi-dress-${seed}`,
    type: "Dresses",
    categoryKey: 1,
    tags: ["Knit Dress", "Minimal", "Bodycon"],
    title: {
      en: "Sleeveless Ribbed Knit Midi Dress",
      fr: "Robe Midi Côtelée Sans Manches",
      ar: "فستان ميدي تريكو مضلع بدون أكمام",
    },
    desc: {
      en: "Form-fitting sleeveless dress in stretchy ribbed-knit cotton.",
      fr: "Robe près du corps en maille côtelée extensible.",
      ar: "فستان ميدي مريح من نسيج مضلع قابل للتمدد.",
    },
    material: {
      en: "95% Cotton, 5% Elastane",
      fr: "95% Coton, 5% Élasthanne",
      ar: "95% قطن، 5% إيلاستين",
    },
    highlights: [
      {
        en: "4-way stretch fabric for contouring comfort",
        fr: "Tissu extensible grand confort",
        ar: "قماش مرن ومريح",
      },
      {
        en: "Side walking slit for easy movement",
        fr: "Fente latérale facilitant la démarche",
        ar: "فتحة جانبية لسهولة الحركة",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1509783236416-c9ad59bae472?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Ribbed Knit Midi Dress",
        fr: "Robe Côtelée Midi",
        ar: "فستان تريكو مضلع",
      },
      metaDescription: {
        en: "Fitted sleeveless ribbed cotton dress.",
        fr: "Robe midi sans manches en maille.",
        ar: "فستان ميدي نسائي مضلع.",
      },
      keywords: ["ribbed dress", "bodycon", "sleeveless dress"],
    },
  },
  {
    slug: `heavyweight-oversized-cotton-tshirt-${seed}`,
    type: "T-Shirts",
    categoryKey: 2,
    tags: ["Basics", "Streetwear", "Heavy Cotton"],
    title: {
      en: "Heavyweight Boxy Cotton T-Shirt",
      fr: "T-Shirt Boxy en Coton Épais 240g",
      ar: "تيشيرت قطن ثقيل بقصة بوكسي عصرية",
    },
    desc: {
      en: "Substantial 240 GSM combed cotton tee with structured silhouette.",
      fr: "T-shirt épais 240 g/m² en coton peigné durable.",
      ar: "تيشيرت أساسي من القطن السميك بقصة واسعة مريحة.",
    },
    material: {
      en: "100% Combed Heavy Cotton",
      fr: "100% Coton Peigné Épais",
      ar: "100% قطن ممشط ثقيل",
    },
    highlights: [
      {
        en: "Dense opaque fabric that never turns see-through",
        fr: "Tissu opaque très dense",
        ar: "قماش سميك وعاتم غير شفاف",
      },
      {
        en: "Pre-shrunk against washing shrinkage",
        fr: "Coton prélavé anti-rétrécissement",
        ar: "معالج ضد الانكماش",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Heavyweight Boxy T-Shirt",
        fr: "T-Shirt Boxy Épais",
        ar: "تيشيرت قطن ثقيل",
      },
      metaDescription: {
        en: "Durable 240 GSM heavy cotton tee.",
        fr: "T-shirt épais de qualité supérieure.",
        ar: "تيشيرت قطن عالي الجودة.",
      },
      keywords: ["heavyweight t-shirt", "boxy tee", "streetwear"],
    },
  },
  {
    slug: `cropped-ribbed-cotton-tank-${seed}`,
    type: "Tops",
    categoryKey: 2,
    tags: ["Tops", "Summer", "Basics"],
    title: {
      en: "Cropped Ribbed Cotton Tank Top",
      fr: "Débardeur Court Côtelé en Coton",
      ar: "توب قصير بدون أكمام من القطن المضلع",
    },
    desc: {
      en: "Sleeveless cropped tank top in soft ribbed jersey.",
      fr: "Débardeur court sans manches en jersey côtelé doux.",
      ar: "توب صيفي قصير بدون أكمام بقصة مضلعة.",
    },
    material: {
      en: "95% Cotton, 5% Spandex",
      fr: "95% Coton, 5% Élasthanne",
      ar: "95% قطن، 5% سباندكس",
    },
    highlights: [
      {
        en: "Wide bra-friendly shoulder straps",
        fr: "Bretelles larges pratiques",
        ar: "أحزمة كتف عريضة ومريحة",
      },
      {
        en: "Soft breathable organic cotton blend",
        fr: "Coton doux et aéré",
        ar: "مزيج قطن طبيعي مريح",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Cropped Ribbed Tank Top",
        fr: "Débardeur Court Côtelé",
        ar: "توب كروب صيفي مضلع",
      },
      metaDescription: {
        en: "Breathable cropped tank top.",
        fr: "Débardeur court en coton doux.",
        ar: "توب صيفي قصير مريح.",
      },
      keywords: ["crop top", "ribbed tank", "basics"],
    },
  },
  {
    slug: `vintage-wash-straight-fit-jeans-${seed}`,
    type: "Jeans",
    categoryKey: 3,
    tags: ["Jeans", "Denim", "Vintage Wash"],
    title: {
      en: "Vintage Wash Straight-Leg Jeans",
      fr: "Jean Droit Délavé Vintage",
      ar: "بنطال جينز أزرق بقصة مستقيمة كلاسيكية",
    },
    desc: {
      en: "Classic 5-pocket jeans made from authentic rigid denim.",
      fr: "Jean classique à 5 poches en denim résistant.",
      ar: "جينز كلاسيكي بخمسة جيوب من الدنيم المتين.",
    },
    material: {
      en: "100% Cotton Denim",
      fr: "100% Denim de Coton",
      ar: "100% دنيم قطني أصلي",
    },
    highlights: [
      {
        en: "Authentic non-stretch sturdy denim",
        fr: "Denim authentique très robuste",
        ar: "دنيم قطني أصلي متين",
      },
      {
        en: "Reinforced copper rivets at stress points",
        fr: "Rivets en cuivre renforcés",
        ar: "مسامير نحاسية قوية لتدعيم الجيوب",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Straight-Leg Denim Jeans",
        fr: "Jean Droit Vintage",
        ar: "جينز مستقيم كلاسيكي",
      },
      metaDescription: {
        en: "Classic vintage wash denim jeans.",
        fr: "Jean 5 poches coupe droite.",
        ar: "جينز كلاسيكي مستقيم أزرق.",
      },
      keywords: ["straight jeans", "denim", "vintage wash"],
    },
  },
  {
    slug: `wide-leg-pleated-casual-chinos-${seed}`,
    type: "Pants",
    categoryKey: 3,
    tags: ["Chinos", "Trousers", "Casual Chic"],
    title: {
      en: "High-Waist Wide-Leg Pleated Chinos",
      fr: "Pantalon Chino Large Taille Haute à Pinces",
      ar: "بنطال شينو واسع بخصر مرتفع وثنيات أمامية",
    },
    desc: {
      en: "Tailored yet relaxed high-rise cotton twill trousers.",
      fr: "Pantalon taille haute fluide en sergé de coton avec pinces.",
      ar: "بنطال قماشي واسع ومرتفع الخصر مع ثنيات أمامية.",
    },
    material: {
      en: "100% Soft Cotton Twill",
      fr: "100% Sergé de Coton",
      ar: "100% نسيج قطني ناعم",
    },
    highlights: [
      {
        en: "Comfortable high-rise silhouette with pleats",
        fr: "Taille haute confortable à pinces",
        ar: "خصر مرتفع مريح وثنيات أنيقة",
      },
      {
        en: "Deep functional front pockets",
        fr: "Poches italiennes profondes",
        ar: "جيوب جانبية عميقة",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1479064555552-3ef4979f8908?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Wide-Leg Pleated Chinos",
        fr: "Pantalon Chino Large",
        ar: "بنطال شينو واسع",
      },
      metaDescription: {
        en: "High-rise cotton twill pleated trousers.",
        fr: "Pantalon ample à pinces en coton.",
        ar: "بنطال قماشي واسع بثنيات.",
      },
      keywords: ["chinos", "wide leg trousers", "pleated pants"],
    },
  },
  {
    slug: `essential-cotton-fleece-hoodie-${seed}`,
    type: "Hoodies",
    categoryKey: 0,
    tags: ["Hoodie", "Streetwear", "Fleece"],
    title: {
      en: "Essential Cotton Fleece Pullover Hoodie",
      fr: "Sweat à Capuche Molleton Épais Noir",
      ar: "هودي أسود كاجوال من الصوف القطني الدافئ",
    },
    desc: {
      en: "Relaxed-fit hoodie made of warm brushed fleece.",
      fr: "Sweat à capuche confortable en molleton gratté doux.",
      ar: "هودي كاجوال مصنوع من صوف قطني دافئ ومريح.",
    },
    material: {
      en: "80% Cotton, 20% Polyester",
      fr: "80% Coton, 20% Polyester",
      ar: "80% قطن، 20% بوليستر",
    },
    highlights: [
      {
        en: "Plush brushed fleece interior for warmth",
        fr: "Intérieur en molleton gratté chaud",
        ar: "بطانة داخلية من الصوف الناعم",
      },
      {
        en: "Spacious front kangaroo pocket",
        fr: "Poche kangourou spacieuse",
        ar: "جيب كنغر أمامي فسيح",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1529946825183-536c6317f60e?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Essential Black Fleece Hoodie",
        fr: "Sweat à Capuche Noir",
        ar: "هودي أسود كاجوال",
      },
      metaDescription: {
        en: "Everyday fleece pullover hoodie.",
        fr: "Sweat à capuche chaud et confortable.",
        ar: "هودي أسود عملي ودافئ.",
      },
      keywords: ["hoodie", "black hoodie", "fleece"],
    },
  },
  {
    slug: `classic-french-terry-crewneck-sweater-${seed}`,
    type: "Sweatshirts",
    categoryKey: 0,
    tags: ["Sweatshirt", "Crewneck", "French Terry"],
    title: {
      en: "Classic French Terry Crewneck Sweatshirt",
      fr: "Sweat-Shirt Col Rond en Molleton French Terry",
      ar: "سويت شيرت رمادي كلاسيكي بياقة مستديرة",
    },
    desc: {
      en: "Timeless heather grey crewneck sweatshirt in loopback cotton.",
      fr: "Sweat basique en molleton non brossé French Terry gris chiné.",
      ar: "سويت شيرت عملي ومريح من قطن الفرينش تيري الرمادي.",
    },
    material: {
      en: "100% French Terry Cotton",
      fr: "100% Coton French Terry",
      ar: "100% قطن فرينش تيري",
    },
    highlights: [
      {
        en: "Breathable unbrushed loopback cotton interior",
        fr: "Intérieur bouclé respirant",
        ar: "نسيج داخلي قطني مريح",
      },
      {
        en: "Classic ribbed V-insert at collar",
        fr: "Insert en V vintage au col",
        ar: "تفصيلة V كلاسيكية عند الياقة",
      },
    ],
    photos: [
      {
        url: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=600&q=75",
        en: "Front View",
        fr: "Vue de face",
        ar: "منظر أمامي",
      },
      {
        url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=75",
        en: "Detail",
        fr: "Détail",
        ar: "تفاصيل",
      },
      {
        url: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=600&q=75",
        en: "Fit",
        fr: "Porté",
        ar: "صورة المودل",
      },
    ],
    seo: {
      metaTitle: {
        en: "Grey French Terry Crewneck",
        fr: "Sweat Col Rond Gris",
        ar: "سويت شيرت رمادي",
      },
      metaDescription: {
        en: "350 GSM loopback cotton sweatshirt.",
        fr: "Sweat-shirt intemporel en coton French Terry.",
        ar: "سويت شيرت رمادي مريح.",
      },
      keywords: ["crewneck", "sweatshirt", "french terry"],
    },
  },
];

describe("Production Everyday Clothing Catalog (All Schema Fields)", () => {
beforeAll(async () => {
    expect(PROJECT_ID, "SANITY_PROJECT_ID required").toBeTruthy();
    expect(SANITY_TOKEN, "SANITY_API_TOKEN required").toBeTruthy();
    expect(MEDUSA_URL, "MEDUSA_BACKEND_URL required").toBeTruthy();

    // 1. Wake up Render backend
    await waitForRenderWakeup(90000);

    // 2. Locate and upload your static/placeholder.png to Sanity
    const possiblePaths = [
      path.join(process.cwd(), "static", "placeholder.png"),
      path.join(__dirname, "..", "static", "placeholder.png"),
      path.join(process.cwd(), "apps", "backend", "static", "placeholder.png"),
    ];

    const localPlaceholderPath = possiblePaths.find((p) => fs.existsSync(p));

    let fileBuffer: Buffer;
    if (localPlaceholderPath) {
      console.log(` Using local fallback image: ${localPlaceholderPath}`);
      fileBuffer = fs.readFileSync(localPlaceholderPath);
    } else {
      console.warn("⚠️ static/placeholder.png not found, using memory buffer");
      fileBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64"
      );
    }

    const uploadUrl = `https://${PROJECT_ID}.api.sanity.io/v2021-06-07/assets/images/${encodeURIComponent(
      DATASET
    )}?filename=store-placeholder.png`;

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SANITY_TOKEN}`,
        "Content-Type": "image/png",
      },
      body: new Uint8Array(fileBuffer),
    });

    const data = await res.json();
    cachedFallbackAsset = { id: data.document._id, url: data.document.url };
    console.log(`✔ Placeholder uploaded to Sanity CDN (ID: ${cachedFallbackAsset.id})`);
  }, 120000);

  it("Phase 1: Seeds 5 Categories with All Schema Fields & Hierarchy", async () => {
    console.log("\n PHASE 1: Seeding 5 Categories into Sanity & Medusa...");

    for (const cat of CATEGORIES_SPEC) {
      const bannerAsset = await uploadRemoteImageToSanity(
        cat.banner,
        `${cat.slug}-banner.jpg`,
      );

      const categoryDoc: Record<string, any> = {
        _id: cat.id,
        _type: "category",
        medusaId: cat.medusaId,
        title: {
          _type: "localizedString",
          en: cat.title.en,
          fr: cat.title.fr,
          ar: cat.title.ar,
        },
        slug: { _type: "slug", current: cat.slug },
        description: {
          _type: "localizedText",
          en: cat.description.en,
          fr: cat.description.fr,
          ar: cat.description.ar,
        },
        categoryImage: {
          _type: "image",
          hotspot: { x: 0.5, y: 0.5, height: 1.0, width: 1.0 },
          asset: { _type: "reference", _ref: bannerAsset.id },
          alt: {
            _type: "localizedString",
            en: cat.alt.en,
            fr: cat.alt.fr,
            ar: cat.alt.ar,
          },
        },
        seo: {
          _type: "object",
          metaTitle: {
            _type: "localizedString",
            en: cat.metaTitle.en,
            fr: cat.metaTitle.fr,
            ar: cat.metaTitle.ar,
          },
          metaDescription: {
            _type: "localizedText",
            en: cat.metaDescription.en,
            fr: cat.metaDescription.fr,
            ar: cat.metaDescription.ar,
          },
        },
      };

      if (cat.isParent && cat.children) {
        categoryDoc.subCategories = cat.children.map((childId) => ({
          _type: "reference",
          _ref: childId,
          _key: `sub_${childId}`,
        }));
      }

      await mutateSanity([{ createOrReplace: categoryDoc }]);

      const syncRes = await postWebhookToMedusa(
        {
          _type: "category",
          documentType: "category",
          _id: cat.id,
          title: categoryDoc.title,
          slug: cat.slug,
          medusaId: cat.medusaId,
          _perspectives: "published",
        },
        "create",
        cat.id,
      );

      expect(syncRes.status).toBeLessThan(300);
      console.log(`  ✔ Category: "${cat.title.en}" created.`);
    }
  }, 180000);

  async function seedFullProductBatch(startIndex: number, endIndex: number) {
    for (let i = startIndex; i < endIndex; i++) {
      const prod = PRODUCTS_SPEC[i];
      const assignedCategory = CATEGORIES_SPEC[prod.categoryKey];
      const prodDocId = `prod-everyday-${i + 1}-${seed}`;
      const medusaProdId = `medusa_prod_${i + 1}_${seed}`;

      console.log(`  ⏳ [${i + 1}/10] Seeding "${prod.title.en}"...`);

      const [imgFront, imgDetail, imgModel] = await Promise.all([
        uploadRemoteImageToSanity(prod.photos[0].url, `${prod.slug}-front.jpg`),
        uploadRemoteImageToSanity(
          prod.photos[1].url,
          `${prod.slug}-detail.jpg`,
        ),
        uploadRemoteImageToSanity(prod.photos[2].url, `${prod.slug}-model.jpg`),
      ]);

      const productDoc: Record<string, any> = {
        _id: prodDocId,
        _type: "product",
        medusaId: medusaProdId,
        updatedBy: "medusa-sanity-sync-engine",
        title: {
          _type: "localizedString",
          en: prod.title.en,
          fr: prod.title.fr,
          ar: prod.title.ar,
        },
        slug: { _type: "slug", current: prod.slug },
        description: {
          _type: "localizedText",
          en: prod.desc.en,
          fr: prod.desc.fr,
          ar: prod.desc.ar,
        },
        productType: prod.type,
        categories: [
          {
            _type: "reference",
            _ref: assignedCategory.id,
            _key: `cat_${assignedCategory.id}`,
          },
        ],
        tags: prod.tags,
        material: {
          _type: "localizedString",
          en: prod.material.en,
          fr: prod.material.fr,
          ar: prod.material.ar,
        },
        highlights: prod.highlights.map((item, idx) => ({
          _key: `hl_${idx}_${seed}`,
          _type: "localizedString",
          en: item.en,
          fr: item.fr,
          ar: item.ar,
        })),
        images: [
          {
            _type: "image",
            _key: `img_1_${seed}`,
            hotspot: { x: 0.5, y: 0.5, height: 1.0, width: 1.0 },
            asset: { _type: "reference", _ref: imgFront.id },
            url: imgFront.url,
            alt_en: prod.photos[0].en,
            alt_fr: prod.photos[0].fr,
            alt_ar: prod.photos[0].ar,
          },
          {
            _type: "image",
            _key: `img_2_${seed}`,
            hotspot: { x: 0.5, y: 0.5, height: 1.0, width: 1.0 },
            asset: { _type: "reference", _ref: imgDetail.id },
            url: imgDetail.url,
            alt_en: prod.photos[1].en,
            alt_fr: prod.photos[1].fr,
            alt_ar: prod.photos[1].ar,
          },
          {
            _type: "image",
            _key: `img_3_${seed}`,
            hotspot: { x: 0.5, y: 0.5, height: 1.0, width: 1.0 },
            asset: { _type: "reference", _ref: imgModel.id },
            url: imgModel.url,
            alt_en: prod.photos[2].en,
            alt_fr: prod.photos[2].fr,
            alt_ar: prod.photos[2].ar,
          },
        ],
        seo: {
          _type: "object",
          metaTitle: {
            _type: "localizedString",
            en: prod.seo.metaTitle.en,
            fr: prod.seo.metaTitle.fr,
            ar: prod.seo.metaTitle.ar,
          },
          metaDescription: {
            _type: "localizedText",
            en: prod.seo.metaDescription.en,
            fr: prod.seo.metaDescription.fr,
            ar: prod.seo.metaDescription.ar,
          },
          openGraphImage: createOpenGraphImage(imgFront.id),
          keywords: prod.seo.keywords,
        },
      };

      await mutateSanity([{ createOrReplace: productDoc }]);

      const medusaPayload = {
        _type: "product",
        documentType: "product",
        _id: prodDocId,
        productData: {
          ...productDoc,
          metadata: {
            sanity_id: prodDocId,
            medusaId: productDoc.medusaId,
            updatedBy: productDoc.updatedBy,
            productType: productDoc.productType,
            tags: productDoc.tags,
            material: productDoc.material,
            highlights: productDoc.highlights,
            seo: productDoc.seo,
            translations: {
              en: {
                title: productDoc.title.en,
                description: productDoc.description.en,
                material: productDoc.material.en,
              },
              fr: {
                title: productDoc.title.fr,
                description: productDoc.description.fr,
                material: productDoc.material.fr,
              },
              ar: {
                title: productDoc.title.ar,
                description: productDoc.description.ar,
                material: productDoc.material.ar,
              },
            },
          },
        },
        _perspectives: "published",
      };

      const prodSyncRes = await postWebhookToMedusa(
        medusaPayload,
        "create",
        prodDocId,
      );
      expect(prodSyncRes.status).toBeLessThan(300);

      console.log(`  ✔ Synced Product [${i + 1}/10]: "${prod.title.en}"`);
    }
  }

  it("Phase 2: Seeds Products 1 to 5 (Full Schema Fields)", async () => {
    console.log("\n PHASE 2: Seeding Products 1 to 5...");
    await seedFullProductBatch(0, 5);
  }, 180000);

  it("Phase 3: Seeds Products 6 to 10 (Full Schema Fields)", async () => {
    console.log("\n PHASE 3: Seeding Products 6 to 10...");
    await seedFullProductBatch(5, 10);
  }, 180000);
});

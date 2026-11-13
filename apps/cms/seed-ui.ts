// apps/cms/seed-ui.ts
import { createClient } from "@sanity/client";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const dataset =
  process.env.SANITY_STUDIO_DATASET ||
  process.env.SANITY_DATASET ||
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  "";

const token = process.env.SANITY_API_TOKEN;

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;

if (!projectId || !token) {
  console.error("✖ Missing SANITY_PROJECT_ID or SANITY_API_TOKEN in .env.local");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2026-01-01",
  useCdn: false,
});

interface TranslationItem {
  key: string;
  context?: string;
  value: {
    en?: string;
    fr?: string;
    ar?: string;
    [key: string]: string | undefined;
  };
}

interface UIDocument {
  _id: string;
  _type: "uiTranslation";
  namespace: string;
  items: TranslationItem[];
}

const uiDocuments: UIDocument[] = [
  // ─── SEO & METADATA ───
  {
    _id: "uiTranslation-metadata",
    _type: "uiTranslation",
    namespace: "metadata",
    items: [
      {
        key: "siteName",
        context: "Global site brand name used in browser tabs and OpenGraph",
        value: {
          en: "Official Store",
          fr: "Boutique Officielle",
          ar: "المتجر الرسمي",
        },
      },
      {
        key: "defaultTitle",
        context: "Primary homepage title and fallback meta title",
        value: {
          en: "Curated Collections & Premium Essentials",
          fr: "Collections Exclusives & Shopping International",
          ar: "تشكيلات حصرية واختيارات عصرية راقية",
        },
      },
      {
        key: "defaultDescription",
        context: "Default meta description used for SEO search snippets",
        value: {
          en: "Explore our exclusive catalog of authentic products with fast shipping and secure checkout.",
          fr: "Découvrez notre sélection exclusive de produits certifiés. Livraison rapide et paiement sécurisé.",
          ar: "استكشف تشكيلتنا الحصرية من المنتجات الأصلية والمختارة بعناية مع توصيل سريع ودفع آمن.",
        },
      },
      {
        key: "keywords",
        context: "Meta keywords comma-separated",
        value: {
          en: "ecommerce, authentic, fashion, curated collection, fast shipping",
          fr: "boutique en ligne, certifié, mode, collections exclusives, livraison rapide",
          ar: "متجر إلكتروني، أصلي، أزياء، تشكيلات مميزة، توصيل سريع",
        },
      },
    ],
  },

  // ─── NAVIGATION ───
  {
    _id: "uiTranslation-navigation",
    _type: "uiTranslation",
    namespace: "navigation",
    items: [
      {
        key: "announcementGlobal",
        context: "Top banner across header with dynamic threshold",
        value: {
          en: "Worldwide Express Shipping • Complimentary on orders over {amount}",
          fr: "Livraison express internationale • Offerte dès {amount} d'achat",
          ar: "شحن دولي سريع • مجاناً للطلبات التي تتجاوز {amount}",
        },
      },
      {
        key: "searchPlaceholder",
        context: "Global search bar input placeholder",
        value: {
          en: "Search products, collections, or sku...",
          fr: "Rechercher un produit, une collection ou une référence...",
          ar: "ابحث عن المنتجات، المجموعات أو الرمز...",
        },
      },
      {
        key: "selectRegion",
        context: "Region and currency selector modal title",
        value: {
          en: "Select Country & Currency",
          fr: "Sélectionnez votre pays et devise",
          ar: "اختر البلد والعملة",
        },
      },
      {
        key: "home",
        context: "Navbar link",
        value: { en: "Home", fr: "Accueil", ar: "الرئيسية" },
      },
      {
        key: "catalog",
        context: "Navbar link to all catalog items",
        value: { en: "Shop All", fr: "Tous les produits", ar: "جميع المنتجات" },
      },
      {
        key: "categories",
        context: "Dropdown menu heading",
        value: { en: "Categories", fr: "Catégories", ar: "التصنيفات" },
      },
      {
        key: "cart",
        context: "Cart action in header",
        value: { en: "Cart", fr: "Panier", ar: "السلة" },
      },
      {
        key: "account",
        context: "User profile link in header",
        value: { en: "Account", fr: "Compte", ar: "حسابي" },
      },
      {
        key: "wishlist",
        context: "Saved favorites icon",
        value: { en: "Saved Items", fr: "Mes favoris", ar: "قائمة الرغبات" },
      },
    ],
  },

  // ─── FOOTER ───
  {
    _id: "uiTranslation-footer",
    _type: "uiTranslation",
    namespace: "footer",
    items: [
      {
        key: "newsletterTitle",
        context: "Newsletter section heading",
        value: {
          en: "Subscribe to Updates",
          fr: "Abonnez-vous à notre newsletter",
          ar: "اشترك في نشرتنا البريدية",
        },
      },
      {
        key: "newsletterSubtitle",
        context: "Newsletter value proposition",
        value: {
          en: "Be the first to receive exclusive drops and private sale invites.",
          fr: "Soyez le premier informé de nos lancements exclusifs et ventes privées.",
          ar: "كن أول من يحصل على الإصدارات الحصرية والدعوات الخاصة.",
        },
      },
      {
        key: "newsletterPlaceholder",
        context: "Email input",
        value: {
          en: "Enter your email address",
          fr: "Entrez votre adresse email",
          ar: "أدخل بريدك الإلكتروني",
        },
      },
      {
        key: "subscribe",
        context: "Submit button for newsletter",
        value: { en: "Subscribe", fr: "S'inscrire", ar: "اشتراك" },
      },
      {
        key: "securePaymentTitle",
        context: "Trust badge heading",
        value: {
          en: "Guaranteed Safe & Encrypted Checkout",
          fr: "Paiement 100% sécurisé et chiffré",
          ar: "دفع آمن ومحمي بالكامل بتشفير معتمد",
        },
      },
      {
        key: "paymentMethodsSub",
        context: "Supported payment notice",
        value: {
          en: "Cash on delivery (COD) and local digital payments accepted.",
          fr: "Paiement à la livraison (COD) et cartes bancaires acceptés.",
          ar: "الدفع عند الاستلام وبطاقات الدفع الإلكتروني مقبولة.",
        },
      },
      {
        key: "privacyPolicy",
        context: "Legal link",
        value: { en: "Privacy Policy", fr: "Politique de confidentialité", ar: "سياسة الخصوصية" },
      },
      {
        key: "termsOfService",
        context: "Legal link",
        value: { en: "Terms of Service", fr: "Conditions générales", ar: "شروط الخدمة" },
      },
    ],
  },

  // ─── PRODUCT & CATALOG ───
  {
    _id: "uiTranslation-product",
    _type: "uiTranslation",
    namespace: "product",
    items: [
      {
        key: "addToCart",
        context: "Primary call to action on PDP",
        value: { en: "Add to Bag", fr: "Ajouter au panier", ar: "أضف إلى السلة" },
      },
      {
        key: "buyNow",
        context: "Direct checkout button",
        value: { en: "Express Checkout", fr: "Achat express", ar: "شراء فوري سريع" },
      },
      {
        key: "inStock",
        context: "Ready to ship badge",
        value: { en: "In Stock • Ready to dispatch", fr: "En stock • Prêt à l'expédition", ar: "متوفر • جاهز للشحن" },
      },
      {
        key: "outOfStock",
        context: "Zero inventory badge",
        value: { en: "Sold Out", fr: "Épuisé", ar: "نفذت الكمية" },
      },
      {
        key: "featuredProducts",
        context: "Section title",
        value: { en: "Curated Selections", fr: "Sélection exclusive", ar: "مختارات مميزة" },
      },
      {
        key: "newArrivals",
        context: "Section title",
        value: { en: "Latest Arrivals", fr: "Dernières nouveautés", ar: "وصل حديثاً" },
      },
    ],
  },

  // ─── CART & CHECKOUT ───
  {
    _id: "uiTranslation-cart",
    _type: "uiTranslation",
    namespace: "cart",
    items: [
      {
        key: "title",
        context: "Cart drawer/page title",
        value: { en: "Shopping Bag", fr: "Panier d'achats", ar: "سلة التسوق" },
      },
      {
        key: "emptyCart",
        context: "Empty state message",
        value: {
          en: "Your shopping bag is empty.",
          fr: "Votre panier est vide.",
          ar: "سلة التسوق فارغة حالياً.",
        },
      },
      {
        key: "subtotal",
        context: "Order breakdown subtotal line",
        value: { en: "Subtotal", fr: "Sous-total", ar: "المجموع الفرعي" },
      },
      {
        key: "total",
        context: "Final checkout total",
        value: { en: "Total Due", fr: "Total à régler", ar: "الإجمالي النهائي" },
      },
      {
        key: "proceedToCheckout",
        context: "Main checkout trigger button",
        value: { en: "Proceed to Checkout", fr: "Procéder au paiement", ar: "المتابعة لإتمام الطلب" },
      },
    ],
  },

  // ─── ACCOUNT & AUTH ───
  {
    _id: "uiTranslation-account",
    _type: "uiTranslation",
    namespace: "account",
    items: [
      {
        key: "signIn",
        context: "Log in title/button",
        value: { en: "Sign In", fr: "Se connecter", ar: "تسجيل الدخول" },
      },
      {
        key: "createAccount",
        context: "Register title/button",
        value: { en: "Create an Account", fr: "Créer un compte", ar: "إنشاء حساب جديد" },
      },
      {
        key: "orderHistory",
        context: "Customer portal tab",
        value: { en: "Order History", fr: "Historique des commandes", ar: "سجل الطلبات" },
      },
      {
        key: "logout",
        context: "Session end button",
        value: { en: "Sign Out", fr: "Déconnexion", ar: "تسجيل الخروج" },
      },
    ],
  },

  // ─── COMMON & SYSTEM ───
  {
    _id: "uiTranslation-common",
    _type: "uiTranslation",
    namespace: "common",
    items: [
      {
        key: "orderConfirmedTitle",
        context: "Post-purchase confirmation screen heading",
        value: {
          en: "Order Confirmed • Thank you for your purchase",
          fr: "Commande confirmée • Merci pour votre confiance",
          ar: "تم تأكيد طلبك بنجاح • شكراً لتسوقك معنا",
        },
      },
      {
        key: "trackOrderButton",
        context: "Button to view dispatch tracking",
        value: { en: "Track Order", fr: "Suivre la commande", ar: "تتبع الطلب" },
      },
      {
        key: "notFoundTitle",
        context: "404 page title",
        value: { en: "404 • Page Not Found", fr: "404 • Page introuvable", ar: "404 • الصفحة غير موجودة" },
      },
      {
        key: "backToHome",
        context: "Return button",
        value: { en: "Return to Storefront", fr: "Retour à l'accueil", ar: "العودة إلى الصفحة الرئيسية" },
      },
    ],
  },
];

async function seed() {
  console.log("🌱 Initiating complete White-Label Storefront Seed...");
  const tx = client.transaction();

  // 1. SITE SETTINGS
  tx.createOrReplace({
    _id: "siteSettings",
    _type: "siteSettings",
    isLocked: false,
    storeName: "Maison Aurès Luxe",
    defaultTitle: {
      en: "Maison Aurès • Premium Curated Collections",
      fr: "Maison Aurès • Collections Exclusives",
      ar: "دار الأوراس • تشكيلات فاخرة ومنتجات حصرية",
    },
    defaultDescription: {
      en: "Discover our authentic catalog with nationwide 58-Wilaya delivery and cash on delivery.",
      fr: "Découvrez notre catalogue authentique avec livraison 58 Wilayas et paiement à la livraison.",
      ar: "اكتشف تشكيلتنا الحصرية مع خدمة التوصيل لـ 58 ولاية وخيار الدفع عند الاستلام.",
    },
  });

  // 2. THEME SETTINGS
  tx.createOrReplace({
    _id: "themeSettings",
    _type: "themeSettings",
    isLocked: false,
    primaryColor: "#0F766E",
    accentColor: "#E11D48",
    backgroundColor: "#FFFFFF",
    borderRadius: "0.5rem",
    fontHeading: "var(--font-cairo)",
  });

  // 3. ANNOUNCEMENT BAR
  tx.createOrReplace({
    _id: "announcementBar",
    _type: "announcementBar",
    enabled: true,
    highlight: true,
    message: {
      en: "Complimentary Stop-Desk Delivery across 58 Wilayas for orders over 10,000 DZD",
      fr: "Livraison Stop-Desk offerte vers les 58 Wilayas dès 10 000 DZD d'achats",
      ar: "توصيل مجاني إلى مكتب الاستلام عبر 58 ولاية للطلبات التي تتجاوز 10,000 دج",
    },
  });

  // 4. NAVIGATION
  tx.createOrReplace({
    _id: "navigation",
    _type: "navigation",
    isLocked: false,
    headerNav: [
      {
        _key: "nav_home",
        label: { en: "Home", fr: "Accueil", ar: "الرئيسية" },
        link: { type: "internal", customPath: "/" },
      },
      {
        _key: "nav_catalog",
        label: { en: "All Products", fr: "Catalogue", ar: "جميع المنتجات" },
        link: { type: "internal", customPath: "/products" },
      },
    ],
    footerColumns: [
      {
        _key: "col_support",
        title: { en: "Customer Support", fr: "Service Client", ar: "خدمة العملاء" },
        links: [
          {
            _key: "link_shipping",
            label: { en: "58-Wilaya Shipping", fr: "Livraison 58 Wilayas", ar: "الشحن لـ 58 ولاية" },
            link: { type: "internal", customPath: "/policies/shipping" },
          },
        ],
      },
    ],
  });

  // 5. CATEGORY
  const categoryApparelId = "category-apparel";
  tx.createOrReplace({
    _id: categoryApparelId,
    _type: "category",
    medusaId: "pcat_apparel_01",
    syncOrigin: "medusa-seed",
    title: {
      en: "Artisanal Apparel",
      fr: "Mode & Vêtements",
      ar: "أزياء راقية",
    },
    slug: { _type: "slug", current: "apparel" },
    description: {
      en: "Curated collection of authentic garments designed for comfort.",
      fr: "Collection exclusive de vêtements conçus pour le confort.",
      ar: "تشكيلة مختارة من الملابس الفاخرة المصنوعة بعناية.",
    },
  });

  // 6. PRODUCT
  tx.createOrReplace({
    _id: "product-linen-shirt",
    _type: "product",
    medusaId: "prod_linen_shirt_01",
    syncOrigin: "medusa-seed",
    title: {
      en: "Handcrafted Aurès Linen Tunic",
      fr: "Tunique en Lin des Aurès",
      ar: "تونيك كتان أوراسي مصنوع يدوياً",
    },
    slug: { _type: "slug", current: "aures-linen-tunic" },
    productType: "Apparel",
    material: {
      en: "100% Breathable Organic Linen",
      fr: "100% Lin Biologique",
      ar: "100% كتان طبيعي",
    },
    categories: [
      {
        _key: "ref_apparel",
        _type: "reference",
        _ref: categoryApparelId,
      },
    ],
    variants: [
      {
        _key: "var_m_sand",
        medusa_variant_id: "variant_m_sand_01",
        sku: "AUR-TUN-M-SND",
        title: "Medium / Natural Sand",
      },
    ],
  });

  // 7. POLICIES
  tx.createOrReplace({
    _id: "policy-shipping",
    _type: "policy",
    title: {
      en: "Logistics & Delivery (58 Wilayas)",
      fr: "Politique de Livraison (58 Wilayas)",
      ar: "شروط الشحن والتوصيل (58 ولاية)",
    },
    slug: { _type: "slug", current: "shipping" },
    lastUpdated: "2026-01-01",
    content: {
      en: "We offer home delivery and stop-desk pick-up across all 58 Wilayas of Algeria.",
      fr: "Nous assurons la livraison à domicile et en point relais (Stop-Desk) à travers l'ensemble des 58 Wilayas.",
      ar: "نوفر خدمة الشحن السريع إلى باب منزلك أو عبر مكاتب الاستلام في جميع الولايات الـ 58.",
    },
  });

  // 8. PAGE
  tx.createOrReplace({
    _id: "page-home",
    _type: "page",
    title: "Homepage (Main Storefront)",
    slug: { _type: "slug", current: "home" },
    sections: [
      {
        _key: "hero_section_block",
        _type: "heroSection",
        title: {
          en: "Artisanal Craftsmanship • Timeless Comfort",
          fr: "Artisanat d'Excellence • Élégance Intemporelle",
          ar: "أصالة الصناعة التقليدية • أناقة راقية",
        },
      },
    ],
  });

  // 9. UI TRANSLATIONS
  for (const doc of uiDocuments) {
    const formattedDoc = {
      ...doc,
      items: doc.items.map((item: TranslationItem) => ({
        _key: item.key,
        ...item,
      })),
    };
    tx.createOrReplace(formattedDoc);
  }

  await tx.commit();
  console.log("✔ Master seed complete! All schemas, singletons, products, and policies published.");
}

seed().catch((err: Error) => {
  console.error("✖ Seeding failed:", err.message);
  process.exit(1);
});

// run npx sanity exec seed-ui.ts --with-user-token for default dataset to seed the CMS with default storefront content and translations.
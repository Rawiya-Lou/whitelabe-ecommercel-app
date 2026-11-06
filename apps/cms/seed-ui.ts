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
  process.env.SANITY_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
if (!projectId || !token) {
  console.error("Missing SANITY_PROJECT_ID or SANITY_API_TOKEN in .env.local");
  process.exit(1);
}
const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2026-01-01",
  useCdn: false,
});

const uiDocuments = [
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

  {
    _id: "uiTranslation-footer",
    _type: "uiTranslation",
    namespace: "footer",
    items: [
      {
        key: "newsletterTitle",
        context: "Newsletter section heading",
        value: {
          en: "Subscribe to Global Updates",
          fr: "Abonnez-vous à notre newsletter",
          ar: "اشترك في نشرتنا البريدية",
        },
      },
      {
        key: "newsletterSubtitle",
        context: "Newsletter value proposition",
        value: {
          en: "Be the first to receive exclusive drops, private sale invites, and global dispatch news.",
          fr: "Soyez le premier informé de nos lancements exclusifs, ventes privées et actualités.",
          ar: "كن أول من يحصل على الإصدارات الحصرية، الدعوات الخاصة وأحدث المنتجات.",
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
          fr: "Paiement international 100% sécurisé et chiffré",
          ar: "دفع آمن ومحمي بالكامل بتشفير معتمد",
        },
      },
      {
        key: "paymentMethodsSub",
        context: "Supported payment notice",
        value: {
          en: "Accepting Visa, Mastercard, American Express, Apple Pay, and local bank transfers.",
          fr: "Cartes bancaires internationales, Apple Pay et moyens de paiement locaux acceptés.",
          ar: "نقبل فيزا، ماستركارد، أمريكان إكسبريس، آبل باي وخيارات الدفع المحلية المعتمدة.",
        },
      },
      {
        key: "globalReturns",
        context: "Global return policy badge",
        value: {
          en: "{days}-Day Hassle-Free Global Return Guarantee",
          fr: "Retours internationaux simplifiés sous {days} jours",
          ar: "ضمان استرجاع دولي سهل خلال {days} يوماً",
        },
      },
      {
        key: "allRightsReserved",
        context: "Copyright notice",
        value: {
          en: "All rights reserved. Global operations & fulfillment.",
          fr: "Tous droits réservés. Exploitation et distribution internationale.",
          ar: "جميع الحقوق محفوظة. عمليات الشحن والتوزيع الدولي.",
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

  {
    _id: "uiTranslation-product",
    _type: "uiTranslation",
    namespace: "product",
    items: [
      {
        key: "addToCart",
        context: "Primary call to action on PDP",
        value: { en: "Add to Bag", fr: "Ajouter au panier", ar: "أضف إلى الحقيبة" },
      },
      {
        key: "buyNow",
        context: "Direct checkout button",
        value: { en: "Express Checkout", fr: "Achat express", ar: "شراء فوري سريع" },
      },
      {
        key: "inStock",
        context: "Ready to ship badge",
        value: { en: "In Stock • Ready to dispatch", fr: "En stock • Prêt à l'expédition", ar: "متوفر • جاهز للشحن الفوري" },
      },
      {
        key: "outOfStock",
        context: "Zero inventory badge",
        value: { en: "Sold Out", fr: "Épuisé", ar: "نفذت الكمية" },
      },
      {
        key: "preOrder",
        context: "Pre-order CTA",
        value: { en: "Pre-Order Now", fr: "Précommander", ar: "طلب مسبق" },
      },
      {
        key: "selectOptionPrompt",
        context: "Variant selection validator",
        value: { en: "Please select your options", fr: "Veuillez sélectionner vos options", ar: "يرجى تحديد الخيارات المطلوبة" },
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
      {
        key: "bestSellers",
        context: "Section title",
        value: { en: "Global Best Sellers", fr: "Meilleures ventes", ar: "الأكثر طلباً عالمياً" },
      },
      {
        key: "filtersTitle",
        context: "Sidebar filters header",
        value: { en: "Filter & Refine", fr: "Filtrer et affiner", ar: "تصفية النتائج" },
      },
      {
        key: "sortBy",
        context: "Catalog sort dropdown",
        value: { en: "Sort by", fr: "Trier par", ar: "ترتيب حسب" },
      },
      {
        key: "priceAsc",
        context: "Sort option",
        value: { en: "Price: Low to High", fr: "Prix : Croissant", ar: "السعر: من الأقل إلى الأعلى" },
      },
      {
        key: "priceDesc",
        context: "Sort option",
        value: { en: "Price: High to Low", fr: "Prix : Décroissant", ar: "السعر: من الأعلى إلى الأقل" },
      },
      {
        key: "customsNotice",
        context: "Cross-border trade note on PDP",
        value: {
          en: "Applicable duties and taxes calculated transparently at checkout.",
          fr: "Droits de douane et taxes d'importation calculés lors du paiement.",
          ar: "يتم احتساب الرسوم الجمركية والضرائب بدقة وشفافية عند الدفع.",
        },
      },
    ],
  },

  {
    _id: "uiTranslation-cart",
    _type: "uiTranslation",
    namespace: "cart",
    items: [
      {
        key: "title",
        context: "Cart drawer/page title",
        value: { en: "Shopping Bag", fr: "Panier d'achats", ar: "حقيبة التسوق" },
      },
      {
        key: "emptyCart",
        context: "Empty state message",
        value: {
          en: "Your shopping bag is empty. Explore our collection to add items.",
          fr: "Votre panier est vide. Découvrez notre collection pour commencer vos achats.",
          ar: "حقيبة التسوق فارغة حالياً. تصفح تشكيلتنا للبدء باختيار المنتجات.",
        },
      },
      {
        key: "subtotal",
        context: "Order breakdown subtotal line",
        value: { en: "Subtotal", fr: "Sous-total", ar: "المجموع الفرعي" },
      },
      {
        key: "estimatedShipping",
        context: "Order breakdown shipping estimate",
        value: { en: "International Shipping", fr: "Livraison internationale", ar: "الشحن الدولي" },
      },
      {
        key: "dutiesAndTaxes",
        context: "Customs and tax line",
        value: { en: "Duties & Taxes", fr: "Droits & Taxes", ar: "الرسوم والضرائب" },
      },
      {
        key: "total",
        context: "Final checkout total",
        value: { en: "Total Due", fr: "Total à régler", ar: "الإجمالي النهائي" },
      },
      {
        key: "proceedToCheckout",
        context: "Main checkout trigger button",
        value: { en: "Proceed to Secure Checkout", fr: "Procéder au paiement sécurisé", ar: "المتابعة لإتمام الدفع الآمن" },
      },
      {
        key: "promoCodePlaceholder",
        context: "Coupon code input placeholder",
        value: { en: "Enter promo or gift code", fr: "Code promotionnel ou carte cadeau", ar: "أدخل رمز الخصم أو قسيمة الشراء" },
      },
      {
        key: "applyPromo",
        context: "Promo code button",
        value: { en: "Apply", fr: "Appliquer", ar: "تطبيق" },
      },
    ],
  },

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
        value: { en: "Order History & Tracking", fr: "Historique et suivi des commandes", ar: "سجل الطلبات وتتبع الشحنات" },
      },
      {
        key: "savedAddresses",
        context: "Customer portal address book",
        value: { en: "Shipping Addresses", fr: "Adresses de livraison", ar: "عناوين التوصيل المحفوظة" },
      },
      {
        key: "logout",
        context: "Session end button",
        value: { en: "Sign Out", fr: "Déconnexion", ar: "تسجيل الخروج" },
      },
    ],
  },

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
        key: "orderConfirmedSubtitle",
        context: "Post-purchase dispatch notice",
        value: {
          en: "We are preparing your items. A confirmation email with international tracking details has been sent.",
          fr: "Nous préparons votre colis. Un email de confirmation contenant votre numéro de suivi vous a été envoyé.",
          ar: "نقوم حالياً بتجهيز شحنتك. تم إرسال رسالة تأكيد إلى بريدك الإلكتروني تتضمن تفاصيل التتبع الدولي.",
        },
      },
      {
        key: "trackOrderButton",
        context: "Button to view dispatch tracking",
        value: { en: "Track Consignment", fr: "Suivre l'expédition", ar: "تتبع حالة الشحنة" },
      },
      {
        key: "notFoundTitle",
        context: "404 page title",
        value: { en: "404 • Destination Not Found", fr: "404 • Page introuvable", ar: "404 • الصفحة غير موجودة" },
      },
      {
        key: "notFoundDesc",
        context: "404 page description",
        value: {
          en: "The destination you requested is currently unavailable. Return to our global storefront to continue shopping.",
          fr: "La page demandée est indisponible. Retournez à la boutique pour poursuivre vos achats.",
          ar: "الصفحة التي طلبتها غير متوفرة حالياً. يمكنك العودة إلى المتجر الرئيسي لمتابعة التسوق.",
        },
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
  console.log("Seeding comprehensive international translations to Sanity...");
  const tx = client.transaction();
  for (const doc of uiDocuments) {
    tx.createOrReplace(doc);
  }
  await tx.commit();
  console.log("✓ International UI translations successfully published in Sanity!");
}

seed().catch((err) => {
  console.error("Seeding failed:", err.message);
  process.exit(1);
});

// run npx sanity exec seed-ui.ts --with-user-token one published delete this file after seeding to avoid duplicate entries in Sanity.
import { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation"; 
import { getLocalizedHeroSection, getLocalizedFeatures } from "@/lib/sanity/query";
import { urlFor } from "@/lib/sanity/images";
import { LOCALS } from "@/i18n/constants";

type Props = {
  params: Promise<{ locale: string }>;
};

// 
// 1. Dynamic Multilingual & OpenGraph SEO
// 
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = locale as `${LOCALS}`;
  
  const heroData = await getLocalizedHeroSection(activeLocale);
  const t = await getTranslations({ locale, namespace: "metadata" });

  const title = heroData?.title || t("defaultTitle");
  const description = heroData?.subtitle || t("defaultDescription");

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        fr: "/fr",
        ar: "/ar",
      },
    },
    openGraph: {
      title,
      description,
      locale,
      images: heroData?.heroImage?.asset
        ? [urlFor(heroData.heroImage).width(1200).height(630).url()]
        : [],
    },
  };
}


// 2. Page Component
// 
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const activeLocale = locale as `${LOCALS}`;

  // Fetch CMS and UI copy in parallel
  const [heroData, featureBlocks, t, tProduct] = await Promise.all([
    getLocalizedHeroSection(activeLocale),
    getLocalizedFeatures(activeLocale),
    getTranslations({ locale, namespace: "sections" }),
    getTranslations({ locale, namespace: "product" }),
  ]);

  return (
    <div className="flex flex-col gap-20 pb-24">
      {/* ─── HERO SECTION ─── */}
      <section className="relative overflow-hidden bg-neutral-950 text-white py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col items-start gap-6 text-start">
            {heroData?.badgeText && (
              <span className="inline-block px-3.5 py-1 rounded-full text-xs font-medium tracking-wide bg-neutral-800 text-neutral-200 border border-neutral-700">
                {heroData.badgeText}
              </span>
            )}

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
              {heroData?.title || t("trendingNow")}
            </h1>

            <p className="text-lg text-neutral-400 max-w-xl leading-relaxed">
              {heroData?.subtitle || t("shopTheCollection")}
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href="/catalog"
                className="px-7 py-3.5 rounded-lg bg-white text-neutral-950 font-semibold text-sm hover:bg-neutral-200 transition-colors"
              >
                {heroData?.ctaText || tProduct("buyNow")}
              </Link>
            </div>
          </div>

          {/* Hero Image with Responsive Sizes */}
          {heroData?.heroImage?.asset && (
            <div className="relative aspect-4/3 w-full rounded-2xl overflow-hidden shadow-2xl bg-neutral-900 border border-neutral-800">
              <Image
                src={urlFor(heroData.heroImage).width(1200).height(900).url()}
                alt={heroData.title || "Hero banner"}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      {/* ─── FEATURE BLOCKS SECTION ─── */}
      {featureBlocks?.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featureBlocks.map((block) => (
              <div
                key={block._id}
                className="p-8 rounded-xl border border-neutral-200 bg-white shadow-sm flex flex-col gap-3 text-start"
              >
                {block.tag && (
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    {block.tag}
                  </span>
                )}
                <h3 className="text-xl font-bold text-neutral-900">
                  {block.heading}
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  {block.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── CATALOG SECTION HEADER ─── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 w-full flex justify-between items-end border-b border-neutral-200 pb-6">
        <div className="text-start">
          <h2 className="text-3xl font-extrabold text-neutral-900">
            {t("featuredProducts")}
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            {t("shopTheCollection")}
          </p>
        </div>

        {/* BiDi-Aware Link: Arrow flips automatically in Arabic */}
        <Link
          href="/catalog"
          className="group inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:text-neutral-600 underline underline-offset-4"
        >
          <span>{t("newArrivals")}</span>
          <span 
            aria-hidden="true" 
            className="inline-block transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1 rtl:rotate-180"
          >
            &rarr;
          </span>
        </Link>
      </section>

      {/* ─── FEATURED PRODUCTS GRID (Place your Medusa products component here) ─── */}
    </div>
  );
}
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>{t("defaultTitle")}</h1>
      <p>{t("defaultDescription")}</p>

      <span style={{ fontSize: "0.8rem", color: "#666" }}>
        Active Locale Parameter: <strong>{locale}</strong>
      </span>
    </main>
  );
}

import { useEffect } from "react";

type SEOHeadProps = {
  title: string;
  description: string;
  canonicalPath: string;
  robots?: string;
  imagePath?: string;
  type?: "website" | "article";
  structuredData?: unknown[];
};

const setMeta = (
  attribute: "name" | "property",
  key: string,
  content: string
) => {
  let meta = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  meta.content = content;
};

const SEOHead = ({
  title,
  description,
  canonicalPath,
  robots = "noindex,nofollow",
  imagePath = "/icons/egia-icon-512.png",
  type = "website",
  structuredData = []
}: SEOHeadProps) => {
  useEffect(() => {
    const origin = window.location.origin;
    const canonicalUrl = `${origin}${canonicalPath}`;
    const imageUrl = imagePath.startsWith("http")
      ? imagePath
      : `${origin}${imagePath}`;

    let canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }

    document.title = title;
    canonical.href = canonicalUrl;

    setMeta("name", "description", description);
    setMeta("name", "robots", robots);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:locale", "fr_FR");
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", imageUrl);
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", imageUrl);

    document
      .querySelectorAll('script[data-seo-json-ld="true"]')
      .forEach((script) => script.remove());

    structuredData.forEach((entry) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seoJsonLd = "true";
      script.text = JSON.stringify(entry);
      document.head.appendChild(script);
    });
  }, [
    canonicalPath,
    description,
    imagePath,
    robots,
    structuredData,
    title,
    type
  ]);

  return null;
};

export { SEOHead };
export type { SEOHeadProps };

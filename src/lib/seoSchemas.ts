/**
 * Reusable JSON-LD schema builders for Aethyx.
 * These describe the brand to search engines and AI crawlers.
 */

const SITE_URL = "https://aethyx.space";

// Organization (ProfessionalService) and WebSite schemas live as static JSON-LD
// in index.html so every prerendered page carries them without JavaScript.
// Keep that block in sync if the business details change.

export const breadcrumb = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: `${SITE_URL}${it.path === "/" ? "" : it.path}`,
  })),
});

export const serviceSchema = (name: string, description: string, path: string) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  name,
  description,
  url: `${SITE_URL}${path}`,
  provider: { "@id": `${SITE_URL}#organization` },
  areaServed: { "@type": "Country", name: "United States" },
});

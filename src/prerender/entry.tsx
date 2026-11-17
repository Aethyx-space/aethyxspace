// Server-side render entry used only at build time by scripts/prerender-heads.mjs.
// Renders a public route to static HTML so crawlers that don't run JavaScript
// (GPTBot, ClaudeBot, PerplexityBot, link previews) see the page text.
// The browser app does not hydrate this markup: main.tsx's createRoot() simply
// replaces it, so a mismatch can never break the live page.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { HelmetProvider, type HelmetServerState } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ComponentType, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

import Home from "@/pages/Home";
import Services from "@/pages/Services";
import Portfolio from "@/pages/Portfolio";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Bounty from "@/pages/Bounty";
import Advertise from "@/pages/Advertise";
import Barter from "@/pages/Barter";
import Launch from "@/pages/Launch";
import Blog from "@/pages/Blog";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import Industries from "@/pages/Industries";
import MedSpa from "@/pages/MedSpa";
import Intake from "@/pages/Intake";

// Public marketing routes only. Admin, portal and utility routes stay as the
// empty SPA shell.
export const PAGES: Record<string, ComponentType> = {
  "/": Home,
  "/services": Services,
  "/portfolio": Portfolio,
  "/about": About,
  "/contact": Contact,
  "/bounty": Bounty,
  "/advertise": Advertise,
  "/barter": Barter,
  "/launch": Launch,
  "/blog": Blog,
  "/privacy-policy": PrivacyPolicy,
  "/terms": TermsOfService,
  "/industries": Industries,
  "/industries/medspa": MedSpa,
  "/intake": Intake,
};

type Rendered = { html: string; jsonLd: string };

function renderTree(path: string, tree: ReactNode): Rendered {
  const helmetContext: { helmet?: HelmetServerState } = {};
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <StaticRouter location={path}>{tree}</StaticRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>,
  );
  // Only JSON-LD is taken from Helmet; title/meta/canonical are already
  // written per route by the prerender script.
  const jsonLd = helmetContext.helmet?.script.toString() ?? "";
  return { html, jsonLd };
}

export function render(path: string): Rendered | null {
  const Page = PAGES[path];
  return Page ? renderTree(path, <Page />) : null;
}

// Blog pages load their posts from Supabase in the browser, so their own
// components render empty here. The prerender script passes the posts it
// already fetched, and these give crawlers the real text and links.
export interface PrerenderPost {
  slug: string;
  title: string;
  excerpt?: string | null;
  content?: string | null;
  published_at?: string | null;
}

const isHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);
// Posts are written by the site owner in the admin; still drop scripts and
// inline handlers before putting them in static HTML.
const stripUnsafe = (s: string) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";

export function renderBlogIndex(posts: PrerenderPost[]): Rendered {
  return renderTree(
    "/blog",
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-16 px-6 max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-display tracking-wider mb-8">Aethyx Blog</h1>
        <ul className="space-y-6">
          {posts.map((p) => (
            <li key={p.slug}>
              <a href={`/blog/${p.slug}`} className="text-xl font-display">{p.title}</a>
              {p.excerpt && <p className="text-muted-foreground mt-1">{p.excerpt}</p>}
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </div>,
  );
}

export function renderPost(post: PrerenderPost): Rendered {
  const content = post.content || "";
  return renderTree(
    `/blog/${post.slug}`,
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-24 pb-16 px-6 max-w-3xl mx-auto">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">{fmtDate(post.published_at)}</p>
        <h1 className="text-3xl md:text-4xl font-display tracking-wider mb-8">{post.title}</h1>
        {isHtml(content) ? (
          <article className="blog-content" dangerouslySetInnerHTML={{ __html: stripUnsafe(content) }} />
        ) : (
          <article className="blog-content">
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        )}
      </main>
      <Footer />
    </div>,
  );
}

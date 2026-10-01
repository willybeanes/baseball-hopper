import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getArticle } from "@/lib/articles";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 1800;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Balls & Sticks — Baseball Hopper" };
  return {
    title: `${article.title} — Baseball Hopper`,
    description: article.subtitle,
    openGraph: {
      title: article.title,
      description: article.subtitle,
      images: article.img ? [article.img] : undefined,
    },
  };
}

// beehiiv's post HTML colors itself from --wt-* variables; point them at site tokens.
const WT_VARS = {
  "--wt-background-color": "var(--panel)",
  "--wt-text-on-background-color": "var(--text)",
  "--wt-primary-color": "var(--accent)",
  "--wt-text-on-primary-color": "#ffffff",
  "--wt-secondary-color": "var(--accent-dim)",
  "--wt-text-on-secondary-color": "var(--text)",
  "--wt-tertiary-color": "var(--panel)",
  "--wt-text-on-tertiary-color": "var(--text)",
  "--wt-subscribe-background-color": "var(--panel)",
  "--wt-text-on-subscribe-background-color": "var(--text)",
  "--wt-border-radius": "12px",
} as React.CSSProperties;

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);
  // API unavailable or unknown slug: send readers to the original post.
  if (!article) redirect(`https://ballsandsticks.beehiiv.com/p/${encodeURIComponent(slug)}`);

  return (
    <main className="flex-1 w-full px-4 py-8">
      {/* Match the beehiiv post width (800px); its inline 672px cap is lifted. */}
      <style>{`${article.css}\n.bh-post .rendered-post { max-width: none !important; }`}</style>
      <article
        className="bh-post max-w-[800px] mx-auto bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl shadow-[var(--panel-shadow)] overflow-hidden"
        style={WT_VARS}
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
      {/* The beehiiv page has a Subscribe button up top; the embedded post doesn't. */}
      <section className="max-w-[800px] mx-auto mt-5 bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl shadow-[var(--panel-shadow)] px-6 sm:px-10 py-7 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">
            Get Balls &amp; Sticks in your inbox
          </h2>
          <p className="mt-1 text-sm text-[var(--dim)] leading-relaxed">
            Subscribe for free to get new posts by email as soon as they publish.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
          <a
            href="https://ballsandsticks.beehiiv.com/subscribe"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Subscribe
          </a>
          <a
            href={article.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[var(--dim)] underline hover:text-[var(--accent)]"
          >
            Read on Balls &amp; Sticks ↗
          </a>
        </div>
      </section>
    </main>
  );
}

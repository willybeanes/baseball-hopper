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
      <style>{article.css}</style>
      <article
        className="bh-post max-w-[720px] mx-auto bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl shadow-[var(--panel-shadow)] overflow-hidden"
        style={WT_VARS}
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
      <p className="max-w-[720px] mx-auto mt-4 text-center text-xs text-[var(--dim)]">
        Originally published on{" "}
        <a
          href={article.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--accent)]"
        >
          Balls &amp; Sticks
        </a>{" "}
        · subscribe there for new posts by email.
      </p>
    </main>
  );
}

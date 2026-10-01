import type { Metadata } from "next";
import ArticleCard from "@/components/ArticleCard";
import { getArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Blog — Baseball Hopper",
  description: "Every Balls & Sticks post, readable right here on Baseball Hopper.",
};

export const revalidate = 1800;

export default async function BlogIndexPage() {
  const articles = await getArticles(100);

  return (
    <main className="flex-1 w-full">
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Balls &amp; Sticks</h1>
            <p className="mt-1 text-sm text-[var(--dim)]">
              Every post from the blog · {articles.length} {articles.length === 1 ? "post" : "posts"}
            </p>
          </div>
          <a
            href="https://ballsandsticks.beehiiv.com/subscribe"
            target="_blank"
            rel="noopener noreferrer"
            className="self-start sm:self-auto inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Subscribe
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      </div>
    </main>
  );
}

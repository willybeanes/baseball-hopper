import Link from "next/link";
import type { Article } from "@/lib/articles";

const AUTHOR_AVATAR =
  "https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,width=64,format=auto,onerror=redirect/uploads/asset/file/cc23e68a-0374-477c-b8ed-f40b105f6a14/e37759fb-9ef5-44c6-a98d-6866272799c1_1020x1020.webp";

/** Blog post card used on the home page and the /blog index. */
export default function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      className="group block bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)] hover:shadow-[var(--elevated-shadow)] hover:border-[var(--rule)] transition-all duration-150"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={article.img} alt={article.title} className="w-full h-32 object-cover" />
      <div className="p-4">
        <p className="text-[10px] text-[var(--dimmer)] mb-1">{article.date}</p>
        <p className="text-sm font-semibold leading-snug tracking-tight text-[var(--text)] group-hover:text-[var(--accent)] transition-colors mb-1">
          {article.title}
        </p>
        <p className="text-xs text-[var(--dim)] leading-relaxed mb-3">{article.subtitle}</p>
        <div className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AUTHOR_AVATAR} alt="Will Harris" className="w-4 h-4 rounded-full object-cover" />
          <span className="text-[10px] text-[var(--dimmer)]">Will Harris</span>
        </div>
      </div>
    </Link>
  );
}

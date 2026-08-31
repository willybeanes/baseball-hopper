// All tool links are either external or rewrite destinations — none are Next.js
// app routes — so we use plain <a> tags to avoid RSC prefetch 404s on rewrites.

const TOOLS = [
  {
    slug: "hitting-plus",
    label: "Hitting+",
    description:
      "Four graded inputs to a swing — Decision+, Timing+, Contact+, Power+ — refit into a single grade that disagrees with the stat line on purpose.",
    href: "https://hitting-plus.vercel.app",
    external: true,
    tag: "Hitters",
  },
  {
    slug: "compare",
    label: "Percentile Compare",
    description:
      "Side-by-side percentile bars for any two hitters or pitchers across 40+ metrics. Customize the stat mix, pick a split, and share the URL.",
    href: "/compare",
    external: false,
    tag: "Hitters · Pitchers",
  },
  {
    slug: "battery-splits",
    label: "Battery Splits",
    description:
      "Pitcher–catcher chemistry scores and split stats: how does each battery's ERA, FIP, and Stuff+ shift with the man behind the plate?",
    href: "/battery",
    external: false,
    tag: "Pitchers",
  },
  {
    slug: "stuff-splits",
    label: "Stuff Splits",
    description:
      "Pitch-quality grades (Stuff+, Location+, Pitching+) broken down by pitch type and batter handedness for every MLB arm.",
    href: "https://stuff-splits.vercel.app",
    external: true,
    tag: "Pitchers",
  },
  {
    slug: "scatter",
    label: "Scatter Plot",
    description:
      "Build any FanGraphs × Savant scatter with a few clicks. X vs Y across any stat pair, colored by a third, searchable by name.",
    href: "/scatter",
    external: false,
    tag: "Hitters · Pitchers",
  },
  {
    slug: "war",
    label: "WAR Breakdown",
    description:
      "Decompose FanGraphs WAR into its components season by season. See exactly where the value came from — and where it didn't.",
    href: "/war",
    external: false,
    tag: "Hitters · Pitchers",
  },
  {
    slug: "pbp",
    label: "Play-by-Play",
    description:
      "Every play, every game, with video links where available. Filter by play type, pitcher, hitter, or team and jump straight to the clip.",
    href: "/pbp",
    external: false,
    tag: "Games",
  },
  {
    slug: "probables",
    label: "Opposing Probables",
    description:
      "A grid of today's and upcoming probable starters matchup-by-matchup. Plan your lineup around who's toeing the slab.",
    href: "/probables",
    external: false,
    tag: "Games",
  },
  {
    slug: "xr",
    label: "xR Philosophy",
    description:
      "The math behind expected runs — how RE24, run expectancy matrices, and play-by-play event values are constructed from scratch.",
    href: "https://willybeanes.github.io/xr-philosophy/",
    external: true,
    tag: "Reference",
  },
  {
    slug: "ballot",
    label: "All-Star Ballot",
    description:
      "2026 MLB All-Star vote totals alongside fWAR — see who the fans picked and how it stacked up against who deserved it.",
    href: "/ballot",
    external: false,
    tag: "Archive",
  },
];

const TAG_COLORS: Record<string, string> = {
  Hitters: "bg-[#dbeafe] text-[#1e40af]",
  Pitchers: "bg-[#dcfce7] text-[#166534]",
  "Hitters · Pitchers": "bg-[#f3e8ff] text-[#6b21a8]",
  Games: "bg-[#fef9c3] text-[#854d0e]",
  Reference: "bg-[#f1f5f9] text-[#475569]",
  Archive: "bg-[#fce7f3] text-[#9d174d]",
};

export default function HomePage() {
  return (
    <main className="flex-1 w-full">
      {/* Page intro */}
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-6">
        <p className="text-sm text-[var(--dim)]">
          All the Balls &amp; Sticks baseball tools in one place, cross-referenced around a shared player identity.
        </p>
      </div>

      {/* Tool grid */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => {
            const cardClass =
              "group block bg-[var(--panel)] rounded-2xl border border-[var(--panel-border)] shadow-[var(--panel-shadow)] p-5 hover:shadow-[var(--elevated-shadow)] hover:border-[var(--rule)] transition-all duration-150";
            const cardInner = (
              <>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h2 className="font-semibold text-base tracking-tight group-hover:text-[var(--accent)] transition-colors">
                    {tool.label}
                  </h2>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${TAG_COLORS[tool.tag] ?? "bg-[var(--bg)] text-[var(--dim)]"}`}
                  >
                    {tool.tag}
                  </span>
                </div>
                <p className="text-sm text-[var(--dim)] leading-relaxed">
                  {tool.description}
                </p>
                {tool.external && (
                  <p className="mt-3 text-[11px] text-[var(--dimmer)]">Opens in full tab ↗</p>
                )}
              </>
            );

            return (
              <a
                key={tool.slug}
                href={tool.href}
                {...(tool.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={cardClass}
              >
                {cardInner}
              </a>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--rule)] py-6 text-center text-xs text-[var(--dimmer)]">
        Baseball Hopper · A{" "}
        <a
          href="https://www.ballsandsticks.com"
          className="underline hover:text-[var(--dim)] transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          Balls &amp; Sticks
        </a>{" "}
        property
      </footer>
    </main>
  );
}

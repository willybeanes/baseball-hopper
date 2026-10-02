const HP_BASE = "https://hitting-plus.vercel.app/data";
import Link from "next/link";
import { getArticles } from "@/lib/articles";
import ArticleCard from "@/components/ArticleCard";

const TEAM_NAMES: Record<string, string> = {
  ARI: "Arizona Diamondbacks", ATH: "Athletics", ATL: "Atlanta Braves",
  BAL: "Baltimore Orioles", BOS: "Boston Red Sox", CHC: "Chicago Cubs",
  CWS: "Chicago White Sox", CIN: "Cincinnati Reds", CLE: "Cleveland Guardians",
  COL: "Colorado Rockies", DET: "Detroit Tigers", HOU: "Houston Astros",
  KC: "Kansas City Royals", LAA: "Los Angeles Angels", LAD: "Los Angeles Dodgers",
  MIA: "Miami Marlins", MIL: "Milwaukee Brewers", MIN: "Minnesota Twins",
  NYM: "New York Mets", NYY: "New York Yankees", OAK: "Oakland Athletics",
  PHI: "Philadelphia Phillies", PIT: "Pittsburgh Pirates", SD: "San Diego Padres",
  SF: "San Francisco Giants", SEA: "Seattle Mariners", STL: "St. Louis Cardinals",
  TB: "Tampa Bay Rays", TEX: "Texas Rangers", TOR: "Toronto Blue Jays",
  WSH: "Washington Nationals",
};

const TOOLS = [
  {
    slug: "hitting-plus",
    label: "Hitting+",
    description:
      "Four graded inputs to a swing — Decision+, Timing+, Contact+, Power+ — refit into a single grade that disagrees with the stat line on purpose.",
    href: "/hitting-plus",
    external: false,
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
    href: "/stuff/platoon",
    external: false,
    tag: "Pitchers",
  },
  {
    slug: "rolling",
    label: "Rolling Chart",
    description:
      "Track any FanGraphs metric as a rolling average across the season. Add multiple players to compare trajectories over any window.",
    href: "/rolling",
    external: false,
    tag: "Hitters · Pitchers",
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
    href: "/xr",
    external: false,
    tag: "Reference",
  },
  {
    slug: "dingy",
    label: "The Dingy",
    description:
      "Pick 10 MLB teams over or under their season win total. Track live standings as projections update throughout the year.",
    href: "/dingy",
    external: false,
    tag: "Archive",
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

type SwingPlayer = {
  player_name: string;
  game_year: number;
  pa: number;
  "Hitting+": number;
  "Decision+": number;
  "Timing+": number;
  "Contact+": number;
  "Power+": number;
  xwoba: number;
  qualified: boolean;
};

function displayName(raw: string) {
  const parts = raw.split(", ");
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return raw;
}

function fmt(n: number | null | undefined, decimals = 1) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function StatBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(Math.max(value, 50), 160);
  const pct = ((clamped - 50) / 110) * 100;
  const color =
    value >= 115
      ? "#2563eb"
      : value >= 105
      ? "#16a34a"
      : value <= 90
      ? "#dc2626"
      : "#6b7280";
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-right text-[11px] text-[var(--dim)]">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--track)]">
        <div
          className="h-2 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-[11px] font-medium text-[var(--text)]">{fmt(value, 0)}</span>
    </div>
  );
}

type PlayerInfo = { id: number; team: string; position: string };

export default async function HomePage() {
  const articles = await getArticles(8);
  const [swingRes, infoRes] = await Promise.all([
    fetch(`${HP_BASE}/swingplus_latest.json`, { next: { revalidate: 1800 } }),
    fetch(`${HP_BASE}/player_info.json`, { next: { revalidate: 1800 } }),
  ]);

  const swingRaw = swingRes.ok ? await swingRes.text() : "{}";
  const swingData: { players: SwingPlayer[] } = JSON.parse(swingRaw.replace(/\bNaN\b/g, "null"));
  const playerInfo: Record<string, PlayerInfo> = infoRes.ok ? await infoRes.json() : {};

  function mlbHeadshot(name: string) {
    const id = playerInfo[name]?.id;
    if (!id) return null;
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`;
  }

  // Top Hitting+ (qualified, 2026, PA ≥ 150)
  const hittingLeaders = swingData.players
    .filter((p) => p.game_year === 2026 && p.qualified && p.pa >= 150)
    .sort((a, b) => (b["Hitting+"] ?? 0) - (a["Hitting+"] ?? 0))
    .slice(0, 7);



  return (
    // Home page reads better slightly larger; scale it like 110% browser zoom
    // on desktop (nav stays the same size as on other pages).
    <main className="flex-1 w-full md:[zoom:1.1]">
      {/* Feature strip: Articles + Sidebar */}
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-10">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Articles */}
          <section className="w-full lg:w-[52%] shrink-0 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text)] tracking-tight">
                From the blog
              </h2>
              <Link
                href="/blog"
                className="text-[11px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors"
              >
                All posts →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {articles.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </section>

          {/* Sidebar */}
          <aside className="flex-1 min-w-0 flex flex-col gap-5">
            {/* Hitting+ leaderboard */}
            <div className="bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl p-4 shadow-[var(--panel-shadow)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-[var(--text)] tracking-tight">
                  Hitting+ Leaders <span className="text-[var(--dimmer)] font-normal">2026</span>
                </h3>
                <Link
                  href="/hitting-plus?tab=leaderboard&season=2026"
                  className="text-[10px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors"
                >
                  Full table →
                </Link>
              </div>
              <div className="divide-y divide-[var(--panel-border)]">
                {hittingLeaders.map((p, i) => {
                  const shot = mlbHeadshot(p.player_name);
                  return (
                    <Link
                      key={p.player_name}
                      href={`/hitting-plus?tab=card&player=${encodeURIComponent(p.player_name)}&season=2026`}
                      className="flex items-center gap-2 py-1.5 hover:bg-[var(--track)] -mx-1 px-1 rounded-lg transition-colors group/row"
                    >
                      <span className="text-[10px] text-[var(--dimmer)] w-4 text-right shrink-0">{i + 1}</span>
                      {shot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shot} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 bg-[var(--track)]" style={{ objectPosition: "50% 15%" }} />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[var(--track)] shrink-0" />
                      )}
                      <span className="text-xs text-[var(--text)] shrink-0 group-hover/row:text-[var(--accent)] transition-colors">{displayName(p.player_name)}</span>
                      <span className="flex-1 text-xs text-[var(--dimmer)] truncate px-2">
                        {TEAM_NAMES[playerInfo[p.player_name]?.team ?? ""] ?? playerInfo[p.player_name]?.team ?? ""}
                      </span>
                      <span className="text-xs font-semibold text-[var(--text)]">{fmt(p["Hitting+"], 0)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Scatter embeds */}
            <div className="bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h3 className="text-xs font-semibold text-[var(--text)] tracking-tight">Pitching · SIERA vs ERA · Last 90 Days</h3>
                <a href="/scatter?mode=pitching&season=2026&split=39&stats=pit&lg=all&hand=&qual=y&team=0&group=player&x=SIERA&y=ERA&size=1.4" className="text-[10px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors">Open →</a>
              </div>
              <iframe
                src="/scatter-app/index.html?mode=pitching&season=2026&split=39&stats=pit&lg=all&hand=&qual=y&team=0&group=player&x=SIERA&y=ERA&size=1.0&embed=1"
                className="w-full border-0"
                style={{ height: "340px" }}
                title="Pitching scatter"
              />
            </div>

            <div className="bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h3 className="text-xs font-semibold text-[var(--text)] tracking-tight">Hitting · xwOBA vs wOBA · Last 90 Days</h3>
                <a href="/scatter?mode=hitting&season=2026&split=39&stats=all&lg=all&hand=&qual=y&team=0&group=player&x=xwOBA&y=wOBA&size=1.4" className="text-[10px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors">Open →</a>
              </div>
              <iframe
                src="/scatter-app/index.html?mode=hitting&season=2026&split=39&stats=all&lg=all&hand=&qual=y&team=0&group=player&x=xwOBA&y=wOBA&size=1.0&embed=1"
                className="w-full border-0"
                style={{ height: "340px" }}
                title="Hitting scatter"
              />
            </div>

          </aside>
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="border-t border-[var(--rule)]" />
      </div>

      {/* Tool grid */}
      <section className="max-w-6xl mx-auto px-6 py-8">
        <h2 className="text-sm font-semibold text-[var(--text)] tracking-tight mb-4">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => {
            const cardClass =
              "group block bg-[var(--panel)] rounded-2xl border border-[var(--panel-border)] shadow-[var(--panel-shadow)] p-5 hover:shadow-[var(--elevated-shadow)] hover:border-[var(--rule)] transition-all duration-150";
            const cardInner = (
              <>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-base tracking-tight group-hover:text-[var(--accent)] transition-colors">
                    {tool.label}
                  </h3>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${TAG_COLORS[tool.tag] ?? "bg-[var(--bg)] text-[var(--dim)]"}`}
                  >
                    {tool.tag}
                  </span>
                </div>
                <p className="text-sm text-[var(--dim)] leading-relaxed">{tool.description}</p>
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
          href="https://ballsandsticks.beehiiv.com/"
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

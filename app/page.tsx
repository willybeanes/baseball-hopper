import fs from "fs/promises";
import path from "path";
import Link from "next/link";

const ARTICLES = [
  {
    title: "Older but not Wiser+",
    subtitle: "Analyzing how Hitting+ components change with age",
    date: "Aug 27, 2026",
    slug: "older-but-not-wiser",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/01a568ee-2d76-408a-8b03-5f549aeae125/gettyimages-2290520599-2048x2048.jpg",
  },
  {
    title: "Hitting Plus Positive",
    subtitle: "I can do bad (hitting model) all by myself",
    date: "Aug 21, 2026",
    slug: "hitting-plus-positive",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/33afb1ce-82f4-439e-aff7-48e7de6deb55/2282744393_large_cropped.png",
  },
  {
    title: "Fast Times At Bat Speed High",
    subtitle: "Learn it. Know it. Live it.",
    date: "Jul 31, 2026",
    slug: "fast-times-at-bat-speed-high",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/26d16d62-d254-4475-8749-cd84222a4d2a/gettyimages-2283677121_copy.png",
  },
  {
    title: "The Perfect (Game) Score 2: The Re-Take",
    subtitle: "Every bit as necessary as a direct-to-video sequel",
    date: "Jul 22, 2026",
    slug: "the-perfect-game-score-2-the-re-take",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/af3dbc0a-cec6-41c0-8e17-5a49ec7ee40e/roberts-dugout_copy.jpg",
  },
  {
    title: "Semi-Charmed Kind of Schedule",
    subtitle: "The cost to making team schedules pretty",
    date: "Jul 21, 2026",
    slug: "semi-charmed-kind-of-schedule",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/af14a92c-5e05-45f3-97d0-ed889741ef2e/wmgzuifp09si7c2fltbi.jpeg",
  },
  {
    title: "Spoiled Milk in Your Fine Wine",
    subtitle: "The poison pill inside a hitter's plate discipline gains",
    date: "Nov 14, 2025",
    slug: "spoiled-milk-in-your-fine-wine",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/2efcba30-2c43-42d2-8551-2776399a9715/13b6e396-6a35-468f-b144-e8dd54237ff5_686x386.jpeg",
  },
  {
    title: "Rise of the Kitchen Sink Starters",
    subtitle: "Let that sink in",
    date: "Jul 15, 2024",
    slug: "rise-of-the-kitchen-sink-starters",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/7b958aa3-1fc6-4d28-96ba-5e30d4dfa7da/1ff737b7-a302-4fb0-828f-691594630b87_2560x1707.jpeg",
  },
  {
    title: "Isaack of Pulled-tatoes",
    subtitle: "Searching for the next Paredes",
    date: "Nov 14, 2023",
    slug: "isaack-of-pulled-tatoes",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/2c60ddbb-17e0-468e-978b-4c9f46e25ca2/04a0f144-335c-4153-8e98-40a1d72c5ffe_900x506.jpg",
  },
  {
    title: "Let's Play Two (hours)!",
    subtitle: "How good could a game be if it's shorter than Howl's Moving Castle?",
    date: "Apr 7, 2023",
    slug: "lets-play-a-nine-inning-game-in-two",
    img: "https://media.beehiiv.com/cdn-cgi/image/format=auto,fit=scale-down,onerror=redirect/uploads/asset/file/091dc3d6-aa8d-4542-aab1-d750dea79c5f/e9a993a7-48bf-4328-a028-bf7de9608806_960x495.jpg",
  },
];

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
  const dataDir = path.join(process.cwd(), "public", "data");
  const [swingRaw, infoRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, "swingplus_latest.json"), "utf-8"),
    fs.readFile(path.join(dataDir, "player_info.json"), "utf-8"),
  ]);

  const swingData: { players: SwingPlayer[] } = JSON.parse(swingRaw);
  const playerInfo: Record<string, PlayerInfo> = JSON.parse(infoRaw);

  function mlbHeadshot(name: string) {
    const id = playerInfo[name]?.id;
    if (!id) return null;
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${id}/headshot/67/current`;
  }

  // Top Hitting+ (qualified, 2026, PA ≥ 150)
  const hittingLeaders = swingData.players
    .filter((p) => p.game_year === 2026 && p.qualified && p.pa >= 150)
    .sort((a, b) => (b["Hitting+"] ?? 0) - (a["Hitting+"] ?? 0))
    .slice(0, 10);

  // Sample comparison: top 2 Hitting+ players
  const [playerA, playerB] = hittingLeaders;

  return (
    <main className="flex-1 w-full">
      {/* Feature strip: Articles + Sidebar */}
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-10">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Articles */}
          <section className="w-full lg:w-[52%] shrink-0 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--text)] tracking-tight">
                From the blog
              </h2>
              <a
                href="https://ballsandsticks.beehiiv.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors"
              >
                All posts ↗
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ARTICLES.slice(0, 8).map((a) => (
                <a
                  key={a.slug}
                  href={`https://ballsandsticks.beehiiv.com/p/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)] hover:shadow-[var(--elevated-shadow)] hover:border-[var(--rule)] transition-all duration-150"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.img} alt={a.title} className="w-full h-32 object-cover" />
                  <div className="p-4">
                    <p className="text-[10px] text-[var(--dimmer)] mb-1">{a.date}</p>
                    <p className="text-sm font-semibold leading-snug tracking-tight text-[var(--text)] group-hover:text-[var(--accent)] transition-colors mb-1">
                      {a.title}
                    </p>
                    <p className="text-xs text-[var(--dim)] leading-relaxed mb-3">{a.subtitle}</p>
                    <div className="flex items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,width=64,format=auto,onerror=redirect/uploads/asset/file/cc23e68a-0374-477c-b8ed-f40b105f6a14/e37759fb-9ef5-44c6-a98d-6866272799c1_1020x1020.webp"
                        alt="Will Harris"
                        className="w-4 h-4 rounded-full object-cover"
                      />
                      <span className="text-[10px] text-[var(--dimmer)]">Will Harris</span>
                    </div>
                  </div>
                </a>
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
                    <div key={p.player_name} className="flex items-center gap-2 py-1.5">
                      <span className="text-[10px] text-[var(--dimmer)] w-4 text-right shrink-0">{i + 1}</span>
                      {shot ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shot} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 bg-[var(--track)]" style={{ objectPosition: "50% 15%" }} />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[var(--track)] shrink-0" />
                      )}
                      <span className="flex-1 text-xs text-[var(--text)] truncate">{displayName(p.player_name)}</span>
                      <span className="text-xs font-semibold text-[var(--text)]">{fmt(p["Hitting+"], 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scatter embeds */}
            <div className="bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h3 className="text-xs font-semibold text-[var(--text)] tracking-tight">Pitching · SIERA vs ERA</h3>
                <a href="/scatter?mode=pitching&season=2026&split=0&stats=pit&lg=all&hand=&qual=y&team=0&group=player&x=SIERA&y=ERA&size=1.4" className="text-[10px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors">Open →</a>
              </div>
              <iframe
                src="https://fg-scatter.vercel.app/?mode=pitching&season=2026&split=0&stats=pit&lg=all&hand=&qual=y&team=0&group=player&x=SIERA&y=ERA&size=1.4"
                className="w-full border-0"
                style={{ height: "300px" }}
                title="Pitching scatter"
              />
            </div>

            <div className="bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl overflow-hidden shadow-[var(--panel-shadow)]">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <h3 className="text-xs font-semibold text-[var(--text)] tracking-tight">Hitting · xwOBA vs wOBA</h3>
                <a href="/scatter?mode=hitting&season=2026&split=0&stats=all&lg=all&hand=&qual=y&team=0&group=player&x=xwOBA&y=wOBA&size=1.4" className="text-[10px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors">Open →</a>
              </div>
              <iframe
                src="https://fg-scatter.vercel.app/?mode=hitting&season=2026&split=0&stats=all&lg=all&hand=&qual=y&team=0&group=player&x=xwOBA&y=wOBA&size=1.4"
                className="w-full border-0"
                style={{ height: "300px" }}
                title="Hitting scatter"
              />
            </div>

            {/* Sample comparison */}
            {playerA && playerB && (
              <div className="bg-[var(--panel)] border border-[var(--panel-border)] rounded-xl p-4 shadow-[var(--panel-shadow)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-[var(--text)] tracking-tight">Top 2 by Hitting+</h3>
                  <a
                    href={`/compare?tab=hitter&a=${encodeURIComponent(displayName(playerA.player_name))}&b=${encodeURIComponent(displayName(playerB.player_name))}`}
                    className="text-[10px] text-[var(--dim)] hover:text-[var(--accent)] transition-colors"
                  >
                    Full compare →
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[playerA, playerB].map((p) => (
                    <div key={p.player_name} className="text-center">
                      <p className="text-[11px] font-semibold text-[var(--text)] leading-tight truncate">
                        {displayName(p.player_name)}
                      </p>
                      <p className="text-lg font-bold text-[var(--accent)]">{fmt(p["Hitting+"], 0)}</p>
                      <p className="text-[10px] text-[var(--dimmer)]">Hitting+</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {(["Decision+", "Timing+", "Contact+", "Power+"] as const).map((key) => (
                    <div key={key} className="flex items-center gap-1">
                      <span className="text-[10px] text-[var(--dim)] w-14 text-right shrink-0">{key}</span>
                      <div className="flex-1 flex gap-1 items-center">
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--track)] relative">
                          <div
                            className="absolute right-0 top-0 h-1.5 rounded-full bg-[#2563eb] opacity-70"
                            style={{
                              width: `${Math.min(((playerA[key] ?? 100) - 50) / 110, 1) * 50}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] w-7 text-center font-medium text-[var(--text)]">
                          {fmt(playerA[key], 0)}
                        </span>
                        <span className="text-[10px] text-[var(--dimmer)]">vs</span>
                        <span className="text-[10px] w-7 text-center font-medium text-[var(--text)]">
                          {fmt(playerB[key], 0)}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-[var(--track)] relative">
                          <div
                            className="absolute left-0 top-0 h-1.5 rounded-full bg-[#dc2626] opacity-70"
                            style={{
                              width: `${Math.min(((playerB[key] ?? 100) - 50) / 110, 1) * 50}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

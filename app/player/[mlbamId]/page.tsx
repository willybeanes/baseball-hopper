import type { Metadata } from "next";
import {
  fetchPlayerInfo,
  headshotUrl,
  hittingPlusUrl,
  compareUrl,
  batteryUrl,
  stuffUrl,
  playerUrl,
} from "@/lib/player";

interface Props {
  params: Promise<{ mlbamId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mlbamId } = await params;
  const player = await fetchPlayerInfo(Number(mlbamId));
  if (!player) return { title: "Player — Baseball Hopper" };
  return {
    title: `${player.displayName} — Baseball Hopper`,
    description: `Cross-tool stats and grades for ${player.displayName}${player.team ? ` (${player.team})` : ""} across every Balls & Sticks tool.`,
  };
}

const CURRENT_YEAR = new Date().getFullYear();

const TOOL_LINKS = (player: Awaited<ReturnType<typeof fetchPlayerInfo>>) => {
  if (!player) return [];
  return [
    {
      label: "Hitting+",
      description: "Decision+, Timing+, Contact+, Power+ grades for this hitter",
      href: hittingPlusUrl(player, CURRENT_YEAR),
      tag: "Hitters",
    },
    {
      label: "Percentile Compare",
      description: `Open ${player.displayName.split(" ")[0]} as Player A — add a second player to compare`,
      href: compareUrl(player, CURRENT_YEAR),
      tag: "Hitters · Pitchers",
    },
    {
      label: "Battery Splits",
      description: "Pitcher–catcher chemistry and ERA/FIP/Stuff+ splits",
      href: batteryUrl(),
      tag: "Pitchers",
    },
    {
      label: "Stuff Splits",
      description: "Pitch-quality grades by type and batter handedness",
      href: stuffUrl(),
      tag: "Pitchers",
    },
  ];
};

const TAG_BG: Record<string, string> = {
  Hitters: "bg-[#dbeafe] text-[#1e40af]",
  Pitchers: "bg-[#dcfce7] text-[#166534]",
  "Hitters · Pitchers": "bg-[#f3e8ff] text-[#6b21a8]",
};

export default async function PlayerPage({ params }: Props) {
  const { mlbamId } = await params;
  const id = Number(mlbamId);

  if (!mlbamId || isNaN(id)) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-[var(--dim)]">Invalid player ID.</p>
      </main>
    );
  }

  const player = await fetchPlayerInfo(id);

  if (!player) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-[var(--dim)]">
          Player not found. Check the MLBAM id or try searching a tool directly.
        </p>
        <a
          href="/"
          className="mt-4 inline-block text-sm underline text-[var(--dim)] hover:text-[var(--text)]"
        >
          ← Back to Baseball Hopper
        </a>
      </main>
    );
  }

  const tools = TOOL_LINKS(player);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      {/* Back link */}
      <a
        href="/"
        className="text-xs text-[var(--dimmer)] hover:text-[var(--dim)] transition-colors"
      >
        ← Baseball Hopper
      </a>

      {/* Player header */}
      <div className="mt-6 flex items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={headshotUrl(id)}
          alt={player.displayName}
          width={80}
          height={80}
          className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] object-cover shrink-0"
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{player.displayName}</h1>
          <p className="mt-1 text-sm text-[var(--dim)]">
            {[player.team, player.position, `MLBAM id ${id}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-8 mb-6 h-px bg-[var(--rule)]" />

      {/* Tool links */}
      <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
        Tools
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tools.map((tool) => (
          <a
            key={tool.label}
            href={tool.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-[var(--panel)] rounded-xl border border-[var(--panel-border)] shadow-[var(--panel-shadow)] p-4 hover:shadow-[var(--elevated-shadow)] hover:border-[var(--rule)] transition-all duration-150"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="font-semibold text-sm group-hover:text-[var(--accent)] transition-colors">
                {tool.label}
              </span>
              <span
                className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${TAG_BG[tool.tag] ?? "bg-[var(--bg)] text-[var(--dim)]"}`}
              >
                {tool.tag}
              </span>
            </div>
            <p className="text-xs text-[var(--dim)] leading-relaxed">{tool.description}</p>
          </a>
        ))}
      </div>

      {/* Identity footer */}
      <div className="mt-10 rounded-xl border border-[var(--rule)] bg-[var(--panel)] px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)] mb-3">
          Player identity
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--dimmer)]">MLBAM id</dt>
          <dd className="font-mono font-medium">{id}</dd>
          <dt className="text-[var(--dimmer)]">Display name</dt>
          <dd>{player.displayName}</dd>
          <dt className="text-[var(--dimmer)]">Stored name</dt>
          <dd className="font-mono text-xs">{player.storedName}</dd>
          <dt className="text-[var(--dimmer)]">Team</dt>
          <dd>{player.team ?? "—"}</dd>
          <dt className="text-[var(--dimmer)]">Position</dt>
          <dd>{player.position ?? "—"}</dd>
          <dt className="text-[var(--dimmer)]">Canonical URL</dt>
          <dd className="font-mono text-xs truncate">{playerUrl(id)}</dd>
        </dl>
      </div>
    </main>
  );
}

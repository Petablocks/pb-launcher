import { Fragment, useEffect, useState } from "react";
import {
  ExternalLink,
  Globe,
  Heart,
  Loader2,
  Map,
  Megaphone,
  Monitor,
  Package,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { inTauri } from "../auth";
import { BuyMeACoffeeLogo, DiscordLogo, GitHubLogo } from "../components/BrandIcons";
import { INSTANCES } from "../instances";
import { getChangelog } from "../sync";
import { APP_VERSION } from "../version";
import launcherChangelogRaw from "../../CHANGELOG.md?raw";

interface ChangelogItem {
  heading: string;
  subItems: string[];
}

interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}

interface ParsedRelease {
  version: string;
  date?: string;
  sections: ChangelogSection[];
}

/**
 * Sanitizes changelog text before rendering to players:
 * - Drops `Security` and `Infrastructure` sections
 * - Strips internal source file paths (`src-tauri/...`, `overrides/config/...`, `scripts/...`, `server/...`)
 * - Redacts internal ports, Client IDs, Application IDs, and internal API URLs
 * - Filters out purely internal build/script/licensing bullets
 */
function sanitizeLineForPlayers(line: string): string | null {
  const lower = line.toLowerCase();
  if (
    lower.includes("zip-slip") ||
    lower.includes("hardcoded discord webhook") ||
    lower.includes("credential manager") ||
    lower.includes("credwritew") ||
    lower.includes("session-cache.json") ||
    lower.includes("storedaccount") ||
    lower.includes("client_id") ||
    lower.includes("appid") ||
    lower.includes("application id") ||
    lower.includes("aadsts") ||
    lower.includes("entra") ||
    lower.includes("install-server.sh") ||
    lower.includes("server-exclude.txt") ||
    lower.includes("setup-commands.txt") ||
    lower.includes("staff portal") ||
    lower.includes("private repository") ||
    lower.includes("unauthenticated clients") ||
    lower.includes("redistribution licensing") ||
    lower.includes("verify-mods.mjs") ||
    lower.includes("build-mrpack.mjs") ||
    lower.includes("build-curseforge.mjs") ||
    lower.includes("mdrcloud")
  ) {
    return null;
  }

  return line
    // Remove parenthetical file/script paths like (`src/pages/Feedback.tsx`, `src-tauri/src/community.rs`)
    .replace(/\s*\((?:`?(?:src|src-tauri|overrides|scripts|server|dist|docs|public|\.github)\/[^)]+)\)/gi, "")
    // Remove bare port numbers in parentheses like (port 11677)
    .replace(/\s*\(port\s+\d+\)/gi, "")
    // Redact any UUID client IDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    // Redact raw API endpoint paths
    .replace(/`?(?:POST|GET|PUT|DELETE)?\s*https?:\/\/[^\s)`]+\/api\/[^\s)`]+`?/gi, "PETABLOCKS Cloud")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Parses Keep a Changelog markdown into structured, player-safe releases. */
export function parseChangelog(md: string): ParsedRelease[] {
  const out: ParsedRelease[] = [];
  let rel: ParsedRelease | undefined;
  let sec: ChangelogSection | undefined;
  let skipSection = false;

  for (const rawLine of md.replace(/\r/g, "").split("\n")) {
    let m: RegExpExecArray | null;
    if ((m = /^## \[([^\]]+)\](?: - (\S+))?/.exec(rawLine))) {
      const ver = m[1];
      const date = m[2];
      if (out.length > 0 && out[out.length - 1].version === ver) {
        rel = out[out.length - 1];
      } else {
        rel = { version: ver, date, sections: [] };
        out.push(rel);
      }
      sec = undefined;
      skipSection = false;
    } else if (rel && (m = /^### (.+)/.exec(rawLine))) {
      const title = m[1].trim();
      if (/^(security|infrastructure|notes)$/i.test(title)) {
        skipSection = true;
        sec = undefined;
      } else {
        skipSection = false;
        sec = { title, items: [] };
        rel.sections.push(sec);
      }
    } else if (!skipSection && sec && (m = /^- (.+)/.exec(rawLine))) {
      const clean = sanitizeLineForPlayers(m[1].trim());
      if (clean) {
        sec.items.push({ heading: clean, subItems: [] });
      }
    } else if (!skipSection && sec && sec.items.length > 0 && (m = /^\s+- (.+)/.exec(rawLine))) {
      const clean = sanitizeLineForPlayers(m[1].trim());
      if (clean) {
        sec.items[sec.items.length - 1].subItems.push(clean);
      }
    }
  }
  return out
    .map((r) => ({
      ...r,
      sections: r.sections.filter((s) => s.items.length > 0),
    }))
    .filter((r) => r.sections.length > 0);
}

export function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : part.startsWith("`") && part.endsWith("`") ? (
          <code
            key={i}
            className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-pb-cyan"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

const ANNOUNCEMENTS = [
  {
    id: "s2-beta",
    tag: "SEASON 2 CLOSED BETA",
    tagColor: "bg-pb-cyan/15 text-pb-cyan border-pb-cyan/30",
    date: "November 2026",
    title: "PETABLOCKS Season 2 & Official Launcher Closed Beta",
    summary:
      "Welcome to the official PETABLOCKS Desktop Launcher! Season 2 runs on Minecraft 1.21.1 (NeoForge 21.1.259) with Create 6.0.10, Steam 'n' Rails, Aeronautics, FTB Chunks, and automatic modpack updates.",
    bullets: [
      "Link your Discord account via the sidebar profile pill or `/link` in-game to claim 32x Diamonds and sync your network rank.",
      "Modpack updates now notify you right on the Play card and banner with one-click Release Notes and synchronization.",
      "Found a bug or have a mod suggestion? Use the Feedback tab in the sidebar to submit a report directly to the team!",
    ],
  },
  {
    id: "network-roadmap",
    tag: "NETWORK ROADMAP",
    tagColor: "bg-pb-purple/15 text-pb-purple border-pb-purple/30",
    date: "2026 – 2027",
    title: "Upcoming Servers: Create 2, Patreon Testbed & Hunger Games",
    summary:
      "The new 2x2 Play screen prepares the launcher for every upcoming server on the PETABLOCKS Minecraft Network:",
    bullets: [
      "PETABLOCKS Season 2 (s2.petablocks.com) — Live now in Closed Beta, public launch in January 2027.",
      "PETABLOCKS Create 2 (create2.petablocks.com) — Direct one-click launcher integration coming soon.",
      "Patreon Supporter Server (patreon.petablocks.com) — Exclusive sandbox and early-access testbed for Patreon supporters.",
      "PETABLOCKS Hunger Games (hg.petablocks.com) — Custom competitive Paper arena survival arriving Spring 2027.",
    ],
  },
];

const LINKS = [
  { label: "PETABLOCKS Website", url: "https://petablocks.com", icon: Globe },
  { label: "Live World Map", url: "https://map.petablocks.com", icon: Map },
  { label: "Official Discord", url: "https://discord.gg/YpKbVHASqC", icon: DiscordLogo },
  { label: "Launcher GitHub", url: "https://github.com/Petablocks/pb-launcher", icon: GitHubLogo },
];

type NewsFeedTab = "announcements" | "launcher" | "modpack";

const launcherReleases = parseChangelog(launcherChangelogRaw);

export default function News() {
  const [activeTab, setActiveTab] = useState<NewsFeedTab>("announcements");
  const [modpackReleases, setModpackReleases] = useState<ParsedRelease[]>([]);
  const [loadingModpack, setLoadingModpack] = useState(false);
  const [modpackError, setModpackError] = useState<string | null>(null);

  const s2Instance = INSTANCES[0];

  async function loadModpackChangelog() {
    if (!inTauri) return;
    setLoadingModpack(true);
    setModpackError(null);
    try {
      const url =
        s2Instance.changelogUrl ??
        "https://github.com/Petablocks/pb-launcher/releases/latest/download/CHANGELOG.md";
      const raw = await getChangelog(s2Instance.id, url);
      setModpackReleases(parseChangelog(raw));
    } catch (err) {
      setModpackError(String(err));
    } finally {
      setLoadingModpack(false);
    }
  }

  useEffect(() => {
    loadModpackChangelog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openExternal(url: string) {
    if (inTauri) openUrl(url).catch(() => {});
    else window.open(url, "_blank");
  }

  const latestModpackVer = modpackReleases[0]?.version;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">News & Release Notes</h1>
          <p className="mt-1 text-xs text-pb-muted">
            Official network announcements, Launcher updates, and live Season 2 Modpack patch notes.
          </p>
        </div>

        {activeTab === "modpack" && (
          <button
            type="button"
            onClick={loadModpackChangelog}
            disabled={loadingModpack}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-pb-card px-3.5 py-2 text-xs font-bold text-pb-muted transition hover:border-white/20 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={13} className={loadingModpack ? "animate-spin text-pb-cyan" : ""} />
            <span>Refresh Feed</span>
          </button>
        )}
      </div>

      {/* Quick community links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LINKS.map(({ label, url, icon: Icon }) => (
          <button
            key={url}
            onClick={() => openExternal(url)}
            className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-pb-card p-3.5 text-left transition hover:border-pb-cyan/50"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pb-cyan/15 text-pb-cyan">
                <Icon size={16} />
              </div>
              <span className="truncate text-xs font-bold text-white">{label}</span>
            </div>
            <ExternalLink size={13} className="shrink-0 text-pb-muted" />
          </button>
        ))}
      </div>

      {/* Optional Community Hosting Support Banner */}
      <section className="rounded-2xl border border-[#FFDD00]/30 bg-[#FFDD00]/5 p-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#FFDD00]/40 bg-[#FFDD00]/20 text-[#FFDD00]">
              <Heart size={17} />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white">Fuel Our Community & Hosting (Optional)</h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-pb-muted">
                PETABLOCKS is 100% free to play. Optional donations via Buy Me a Coffee go directly toward our dedicated server hosting and bandwidth costs.
              </p>
            </div>
          </div>

          <button
            onClick={() => openExternal("https://buymeacoffee.com/petabyteofficial")}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[#FFDD00] px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-black shadow-lg transition hover:bg-[#ffe338]"
          >
            <BuyMeACoffeeLogo size={14} />
            <span>Buy Us a Coffee</span>
            <ExternalLink size={12} />
          </button>
        </div>
      </section>

      {/* Feed Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("announcements")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
            activeTab === "announcements"
              ? "bg-pb-cyan text-[#031617] shadow-md shadow-pb-cyan/20"
              : "border border-white/10 bg-pb-card text-pb-muted hover:border-white/20 hover:text-white"
          }`}
        >
          <Megaphone size={14} />
          <span>Announcements</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              activeTab === "announcements" ? "bg-black/20 text-[#031617]" : "bg-white/10 text-white"
            }`}
          >
            {ANNOUNCEMENTS.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("launcher")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
            activeTab === "launcher"
              ? "bg-pb-cyan text-[#031617] shadow-md shadow-pb-cyan/20"
              : "border border-white/10 bg-pb-card text-pb-muted hover:border-white/20 hover:text-white"
          }`}
        >
          <Monitor size={14} />
          <span>Launcher Updates</span>
          <span
            className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
              activeTab === "launcher" ? "bg-black/20 text-[#031617]" : "bg-pb-cyan/15 text-pb-cyan"
            }`}
          >
            v{APP_VERSION}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("modpack")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
            activeTab === "modpack"
              ? "bg-pb-cyan text-[#031617] shadow-md shadow-pb-cyan/20"
              : "border border-white/10 bg-pb-card text-pb-muted hover:border-white/20 hover:text-white"
          }`}
        >
          <Package size={14} />
          <span>Season 2 Modpack</span>
          {latestModpackVer && (
            <span
              className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                activeTab === "modpack"
                  ? "bg-black/20 text-[#031617]"
                  : "bg-pb-mint/15 text-pb-mint"
              }`}
            >
              v{latestModpackVer}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Announcements */}
      {activeTab === "announcements" && (
        <div className="space-y-4">
          {ANNOUNCEMENTS.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-white/10 bg-pb-card p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${item.tagColor}`}
                >
                  <Sparkles size={11} /> {item.tag}
                </span>
                <span className="text-xs text-pb-muted">{item.date}</span>
              </div>
              <h2 className="mt-3 text-base font-extrabold text-white">{item.title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-white/80">{item.summary}</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-pb-muted">
                {item.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {/* Tab 2: Launcher Updates (parsed from CHANGELOG.md) */}
      {activeTab === "launcher" && (
        <div className="space-y-4">
          {launcherReleases.map((rel, idx) => (
            <article
              key={`${rel.version}-${idx}`}
              className="rounded-2xl border border-white/10 bg-pb-card p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-pb-cyan/15 px-3 py-1 font-mono text-xs font-extrabold text-pb-cyan">
                    <Sparkles size={12} /> v{rel.version}
                  </span>
                  {rel.version === APP_VERSION && (
                    <span className="rounded-md border border-pb-mint/30 bg-pb-mint/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-pb-mint">
                      Installed
                    </span>
                  )}
                </div>
                {rel.date && <span className="text-xs text-pb-muted">{rel.date}</span>}
              </div>

              <div className="mt-3 space-y-3">
                {rel.sections.map((sec) => (
                  <div key={sec.title}>
                    <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-pb-cyan">
                      {sec.title}
                    </h3>
                    <ul className="list-disc space-y-1.5 pl-5 text-xs text-white/85">
                      {sec.items.map((item, i) => (
                        <li key={i}>
                          <InlineMarkdown text={item.heading} />
                          {item.subItems.length > 0 && (
                            <ul className="mt-1 list-circle space-y-1 pl-4 text-[11px] text-pb-muted">
                              {item.subItems.map((sub, j) => (
                                <li key={j}>
                                  <InlineMarkdown text={sub} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Tab 3: Season 2 Modpack Updates (fetched live via sync_get_changelog) */}
      {activeTab === "modpack" && (
        <div className="space-y-4">
          {loadingModpack ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-pb-card py-14 text-pb-muted">
              <Loader2 size={24} className="mb-2 animate-spin text-pb-cyan" />
              <span className="text-xs">Fetching latest Season 2 Modpack release notes...</span>
            </div>
          ) : modpackError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-xs text-red-300">
              {modpackError}
            </div>
          ) : (
            modpackReleases.map((rel, idx) => (
              <article
                key={`${rel.version}-${idx}`}
                className="rounded-2xl border border-white/10 bg-pb-card p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-pb-mint/15 px-3 py-1 font-mono text-xs font-extrabold text-pb-mint">
                      <Package size={12} /> v{rel.version}
                    </span>
                    {idx === 0 && (
                      <span className="rounded-md border border-pb-cyan/30 bg-pb-cyan/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-pb-cyan">
                        Latest Release
                      </span>
                    )}
                  </div>
                  {rel.date && <span className="text-xs text-pb-muted">{rel.date}</span>}
                </div>

                <div className="mt-3 space-y-3">
                  {rel.sections.map((sec) => (
                    <div key={sec.title}>
                      <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-pb-mint">
                        {sec.title}
                      </h3>
                      <ul className="list-disc space-y-1.5 pl-5 text-xs text-white/85">
                        {sec.items.map((item, i) => (
                          <li key={i}>
                            <InlineMarkdown text={item.heading} />
                            {item.subItems.length > 0 && (
                              <ul className="mt-1 list-circle space-y-1 pl-4 text-[11px] text-pb-muted">
                                {item.subItems.map((sub, j) => (
                                  <li key={j}>
                                    <InlineMarkdown text={sub} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}

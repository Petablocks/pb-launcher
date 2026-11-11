import { Fragment, ReactNode } from "react";
import { Badge, Tone } from "../components/ui";

interface ChangelogItem {
  heading: string;
  subItems: string[];
}

interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}

export interface ParsedRelease {
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
            className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-2xs text-pb-cyan"
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

const ACCENTS: Record<"cyan" | "mint", string> = {
  cyan: "text-pb-cyan",
  mint: "text-pb-mint",
};

/** One release rendered as a card: version, optional status badge, date and its sections. */
export function ReleaseCard({
  release,
  accent = "cyan",
  icon,
  badge,
  compact = false,
}: {
  release: ParsedRelease;
  accent?: "cyan" | "mint";
  icon?: ReactNode;
  badge?: { label: string; tone: Tone };
  compact?: boolean;
}) {
  return (
    <article
      className={
        compact
          ? "rounded-xl border border-white/10 bg-black/30 p-4"
          : "rounded-2xl border border-white/10 bg-pb-card p-5"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <Badge tone={accent} className="px-3 py-1 font-mono text-xs font-extrabold">
            {icon} v{release.version}
          </Badge>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
        {release.date && <span className="text-xs text-pb-muted">{release.date}</span>}
      </div>
      <div className="mt-3 space-y-3 select-text">
        {release.sections.map((sec) => (
          <div key={sec.title}>
            <h4 className={`mb-1.5 text-2xs font-extrabold uppercase tracking-wider ${ACCENTS[accent]}`}>
              {sec.title}
            </h4>
            <ul className="list-disc space-y-1.5 pl-5 text-xs text-white/85">
              {sec.items.map((item, i) => (
                <li key={i}>
                  <InlineMarkdown text={item.heading} />
                  {item.subItems.length > 0 && (
                    <ul className="mt-1 list-[circle] space-y-1 pl-4 text-2xs text-pb-muted">
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
  );
}

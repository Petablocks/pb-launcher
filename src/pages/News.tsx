import { useEffect, useState } from "react";
import {
  ExternalLink,
  Globe,
  Heart,
  Map,
  Megaphone,
  Monitor,
  Package,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import launcherChangelogRaw from "../../CHANGELOG.md?raw";
import { inTauri } from "../auth";
import { BuyMeACoffeeLogo, DiscordLogo, GitHubLogo } from "../components/BrandIcons";
import InstanceSelector from "../components/InstanceSelector";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SegmentedControl,
  Tone,
} from "../components/ui";
import { ParsedRelease, ReleaseCard, parseChangelog } from "../lib/changelog";
import { openExternal } from "../lib/open";
import { useLauncher, useManagedInstance } from "../state/LauncherProvider";
import { getChangelog } from "../sync";
import { APP_VERSION } from "../version";

const TONES: Tone[] = ["cyan", "mint", "amber", "purple", "red", "neutral"];
const toTone = (tone: string): Tone => (TONES.includes(tone as Tone) ? (tone as Tone) : "cyan");

const LINKS = [
  { label: "PETABLOCKS Website", url: "https://petablocks.com", icon: Globe },
  { label: "Live World Map", url: "https://map.petablocks.com", icon: Map },
  { label: "Official Discord", url: "https://discord.gg/YpKbVHASqC", icon: DiscordLogo },
  { label: "Launcher GitHub", url: "https://github.com/Petablocks/pb-launcher", icon: GitHubLogo },
];

export const SUPPORT_URL = "https://buymeacoffee.com/petabyteofficial";

type Feed = "announcements" | "launcher" | "modpack";

const launcherReleases = parseChangelog(launcherChangelogRaw);

export default function News() {
  const instance = useManagedInstance();
  const { announcements } = useLauncher();
  const [feed, setFeed] = useState<Feed>("announcements");
  const [modpackReleases, setModpackReleases] = useState<ParsedRelease[]>([]);
  const [loadingModpack, setLoadingModpack] = useState(false);
  const [modpackError, setModpackError] = useState<string | null>(null);

  async function loadModpackChangelog() {
    if (!inTauri) return;
    setLoadingModpack(true);
    setModpackError(null);
    try {
      setModpackReleases(parseChangelog(await getChangelog(instance.id, instance.changelogUrl ?? "")));
    } catch (err) {
      setModpackReleases([]);
      setModpackError(String(err));
    } finally {
      setLoadingModpack(false);
    }
  }

  useEffect(() => {
    loadModpackChangelog();
    // Reload only when the managed instance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id, instance.changelogUrl]);

  const shortName = instance.name.replace("PETABLOCKS ", "");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="News"
        description="Network announcements, launcher updates and modpack patch notes."
        actions={
          <>
            <InstanceSelector />
            {feed === "modpack" && (
              <Button
                variant="ghost"
                icon={<RefreshCw size={13} className={loadingModpack ? "animate-spin" : ""} />}
                disabled={loadingModpack}
                onClick={loadModpackChangelog}
              >
                Refresh
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LINKS.map(({ label, url, icon: Icon }) => (
          <button
            key={url}
            type="button"
            onClick={() => openExternal(url)}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-pb-card p-3.5 text-left transition hover:border-pb-cyan/50"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pb-cyan/15 text-pb-cyan">
                <Icon size={16} />
              </span>
              <span className="truncate text-xs font-bold text-white">{label}</span>
            </span>
            <ExternalLink size={13} className="shrink-0 text-pb-muted" />
          </button>
        ))}
      </div>

      <SegmentedControl<Feed>
        label="News feed"
        value={feed}
        onChange={setFeed}
        options={[
          {
            value: "announcements",
            label: (
              <>
                <Megaphone size={14} /> Announcements
              </>
            ),
          },
          {
            value: "launcher",
            label: (
              <>
                <Monitor size={14} /> Launcher <span className="font-mono opacity-70">v{APP_VERSION}</span>
              </>
            ),
          },
          {
            value: "modpack",
            label: (
              <>
                <Package size={14} /> {shortName} modpack
                {modpackReleases[0] && (
                  <span className="font-mono opacity-70">v{modpackReleases[0].version}</span>
                )}
              </>
            ),
          },
        ]}
      />

      {feed === "announcements" && (
        <div className="space-y-4">
          {announcements.length === 0 && (
            <EmptyState title="No announcements right now">Check back soon.</EmptyState>
          )}
          {announcements.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={toTone(item.tone)} className="px-3 font-extrabold uppercase tracking-wider">
                  <Sparkles size={11} /> {item.tag}
                </Badge>
                <span className="text-xs text-pb-muted">{item.date}</span>
              </div>
              <h2 className="mt-3 text-base">{item.title}</h2>
              {item.summary && (
                <p className="mt-1.5 text-xs leading-relaxed text-white/80">{item.summary}</p>
              )}
              {item.bullets.length > 0 && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-pb-muted">
                  {item.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </Card>
          ))}

          <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bmc/15 text-bmc">
                <Heart size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">Help keep the servers running</div>
                <p className="mt-0.5 text-2xs leading-relaxed text-pb-muted">
                  PETABLOCKS is free to play. Optional donations go to server hosting and bandwidth.
                </p>
              </div>
            </div>
            <Button variant="support" icon={<BuyMeACoffeeLogo size={14} />} onClick={() => openExternal(SUPPORT_URL)}>
              Buy us a coffee <ExternalLink size={12} />
            </Button>
          </Card>
        </div>
      )}

      {feed === "launcher" && (
        <div className="space-y-4">
          {launcherReleases.map((rel, idx) => (
            <ReleaseCard
              key={`${rel.version}-${idx}`}
              release={rel}
              icon={<Sparkles size={12} />}
              badge={rel.version === APP_VERSION ? { label: "Installed", tone: "mint" } : undefined}
            />
          ))}
        </div>
      )}

      {feed === "modpack" && (
        <div className="space-y-4">
          {loadingModpack ? (
            <LoadingState>Fetching {instance.name} release notes…</LoadingState>
          ) : modpackError ? (
            <Alert
              tone="error"
              actions={
                <Button size="sm" onClick={loadModpackChangelog}>
                  Try again
                </Button>
              }
            >
              {modpackError}
            </Alert>
          ) : modpackReleases.length === 0 ? (
            <EmptyState title="No release notes yet">
              Patch notes for {instance.name} will appear here once they are published.
            </EmptyState>
          ) : (
            modpackReleases.map((rel, idx) => (
              <ReleaseCard
                key={`${rel.version}-${idx}`}
                release={rel}
                accent="mint"
                icon={<Package size={12} />}
                badge={idx === 0 ? { label: "Latest", tone: "cyan" } : undefined}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

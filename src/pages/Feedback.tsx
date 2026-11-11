import { useState } from "react";
import {
  Bug,
  ExternalLink,
  Flame,
  Lightbulb,
  MessageSquareHeart,
  Monitor,
  Package,
  ShieldCheck,
} from "lucide-react";
import { inTauri } from "../auth";
import { FeedbackSubmitResult, submitBetaFeedback } from "../community";
import { GitHubLogo } from "../components/BrandIcons";
import { Alert, Badge, Button, Card, PageHeader, cn } from "../components/ui";
import { openExternal } from "../lib/open";
import { useLauncher } from "../state/LauncherProvider";
import { APP_VERSION } from "../version";

type CategoryId = "bug" | "crash" | "suggestion" | "feedback";

const REPORT_TARGETS: {
  id: string;
  label: string;
  repo: string;
  desc: string;
  instanceId: string;
}[] = [
  {
    id: "launcher",
    label: "PETABLOCKS Launcher",
    repo: "Petablocks/pb-launcher",
    desc: "Launcher UI, updates, login, Java runtime, or settings",
    instanceId: "petablocks-s2",
  },
  {
    id: "petablocks-s2",
    label: "PETABLOCKS Season 2 Modpack",
    repo: "Petablocks/petablocks-modpack-s2",
    desc: "In-game mods, recipes, shaders, keybinds, or Season 2 crashes",
    instanceId: "petablocks-s2",
  },
  {
    id: "petablocks-create2",
    label: "PETABLOCKS Create 2 Modpack",
    repo: "Petablocks/petablocks-modpack-create2",
    desc: "In-game mods, recipes, trains, kinetics, or Create 2 crashes",
    instanceId: "petablocks-create2",
  },
];

const CATEGORIES: {
  id: CategoryId;
  label: string;
  desc: string;
  icon: typeof Bug;
  placeholderTitle: string;
  placeholderDesc: string;
}[] = [
  {
    id: "bug",
    label: "Bug Report",
    desc: "Something in the launcher or modpack isn't working properly",
    icon: Bug,
    placeholderTitle: "e.g., Optional mod toggle doesn't persist after restart",
    placeholderDesc:
      "1. What were you doing when the bug occurred?\n2. What did you expect to happen?\n3. What actually happened?",
  },
  {
    id: "crash",
    label: "Crash / Freeze",
    desc: "Launcher or Minecraft 1.21.1 crashed or failed to start",
    icon: Flame,
    placeholderTitle: "e.g., Game crashes on NeoForge loading screen",
    placeholderDesc:
      "Describe when the crash happens and paste any error messages or steps before the crash...",
  },
  {
    id: "suggestion",
    label: "Feature Idea",
    desc: "Suggest an improvement or mod addition",
    icon: Lightbulb,
    placeholderTitle: "e.g., Add shaderpack selector tab",
    placeholderDesc: "Describe the feature or quality-of-life improvement you'd love to see...",
  },
  {
    id: "feedback",
    label: "Beta Impression",
    desc: "Share general thoughts on performance, UI, or gameplay",
    icon: MessageSquareHeart,
    placeholderTitle: "e.g., Smooth install & update experience on Windows 11",
    placeholderDesc: "How is the PETABLOCKS Launcher & Season 2 Modpack feeling on your PC so far?",
  },
];

const choiceClass = (active: boolean) =>
  cn(
    "rounded-xl border p-3.5 text-left transition",
    active
      ? "border-pb-cyan bg-pb-cyan/15 text-white"
      : "border-white/10 bg-pb-card text-pb-muted hover:border-white/20 hover:text-white",
  );

const FIELD_LABEL = "block text-xs font-bold uppercase tracking-wider text-pb-muted";

export default function Feedback() {
  const { session, settings } = useLauncher();
  const [target, setTarget] = useState<string>("launcher");
  const [category, setCategory] = useState<CategoryId>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<FeedbackSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTarget = REPORT_TARGETS.find((t) => t.id === target) ?? REPORT_TARGETS[0];
  const activeCat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 5 || description.trim().length < 15) {
      setError("Please provide a descriptive summary title (at least 5 characters) and details (at least 15 characters).");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSubmitResult(null);
    try {
      const res = await submitBetaFeedback({
        webhookUrl: settings?.crashWebhookUrl || "",
        target: activeTarget.id,
        category,
        title: title.trim(),
        description: description.trim(),
        playerName: session?.profile.name ?? "Beta Tester (Not signed in)",
        playerUuid: session?.profile.uuid ?? "",
        contact: contact.trim(),
        launcherVersion: APP_VERSION,
        includeDiagnostics,
        instanceId: activeTarget.instanceId,
      });
      setSubmitResult(res);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenGitHubIssue() {
    const issueTitle = encodeURIComponent(`[Beta v${APP_VERSION}] ${title || activeCat.label}`);
    const issueBody = encodeURIComponent(
      `**Target:** ${activeTarget.label}\n**Category:** ${activeCat.label}\n**Launcher Version:** v${APP_VERSION}\n**Minecraft User:** ${
        session?.profile.name ?? "Not signed in"
      }\n\n### Description\n${description || "_Describe the issue or feedback here..._"}`
    );
    const url = `https://github.com/${activeTarget.repo}/issues/new?title=${issueTitle}&body=${issueBody}`;
    openExternal(url);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Feedback"
        description={
          <>
            Reports open a tracked issue in{" "}
            <span className="font-mono font-bold text-white/90">{activeTarget.repo}</span> for the
            PETABLOCKS team.
          </>
        }
        actions={
          <Button icon={<GitHubLogo size={15} />} onClick={handleOpenGitHubIssue}>
            Write on GitHub instead
          </Button>
        }
      >
        <Badge tone="purple">Closed beta</Badge>
      </PageHeader>

      {/* Target Repository Selector */}
      <div className="mt-5">
        <div id="fb-target" className="mb-2 text-2xs font-extrabold uppercase tracking-wider text-pb-muted">
          1. What is it about?
        </div>
        <div role="radiogroup" aria-labelledby="fb-target" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REPORT_TARGETS.map((t) => {
            const active = target === t.id;
            const Icon = t.id === "launcher" ? Monitor : Package;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTarget(t.id);
                  setSubmitResult(null);
                }}
                className={cn("flex items-start gap-3.5", choiceClass(active))}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-pb-cyan/20 text-pb-cyan" : "bg-white/5 text-pb-muted"
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">{t.label}</span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-2xs text-pb-cyan">
                      {t.repo.split("/")[1]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-2xs leading-snug opacity-80">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Selector */}
      <div className="mt-4">
        <div id="fb-category" className="mb-2 text-2xs font-extrabold uppercase tracking-wider text-pb-muted">
          2. What kind of report?
        </div>
        <div role="radiogroup" aria-labelledby="fb-category" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setCategory(c.id);
                  setSubmitResult(null);
                }}
                className={cn("flex flex-col items-start", choiceClass(active))}
              >
                <Icon size={18} className={active ? "text-pb-cyan" : "text-pb-muted"} />
                <span className="mt-2 text-xs font-extrabold">{c.label}</span>
                <span className="mt-0.5 text-2xs leading-tight opacity-75">{c.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Form */}
      <Card className="mt-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fb-title" className={FIELD_LABEL}>
            Summary *
          </label>
          <input
            id="fb-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={activeCat.placeholderTitle}
            maxLength={120}
            className="pb-input mt-1.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="fb-details" className={FIELD_LABEL}>
            Details / steps to reproduce *
          </label>
          <textarea
            id="fb-details"
            required
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={activeCat.placeholderDesc}
            maxLength={2500}
            className="pb-input mt-1.5 py-2.5 text-sm leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fb-account" className={FIELD_LABEL}>
              Minecraft account
            </label>
            <input
              id="fb-account"
              type="text"
              disabled
              value={
                session
                  ? `${session.profile.name} (Verified)`
                  : "Not signed in"
              }
              className="pb-input mt-1.5 font-semibold"
            />
          </div>

          <div>
            <label htmlFor="fb-contact" className={FIELD_LABEL}>
              Discord username (optional)
            </label>
            <input
              id="fb-contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g., @username so we can follow up"
              maxLength={64}
              className="pb-input mt-1.5"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-pb-bg/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-pb-cyan" />
            <div>
              <div className="text-xs font-bold text-white">
                Include launcher diagnostics
              </div>
              <div className="text-2xs text-pb-muted">
                Attaches your Minecraft username &amp; UUID, Launcher v{APP_VERSION}, OS arch, RAM allocation, Java 21 status, and synced modpack version (Windows user paths are automatically scrubbed; no tokens are sent).
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={includeDiagnostics}
            onChange={(e) => setIncludeDiagnostics(e.target.checked)}
            className="h-4 w-4 accent-pb-cyan"
          />
        </label>

        {error && (
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {submitResult && (
          <Alert
            tone="success"
            title={
              submitResult.issueNumber && submitResult.repository
                ? `Issue #${submitResult.issueNumber} created in ${submitResult.repository}`
                : "Thanks! Your report reached the PETABLOCKS team."
            }
            actions={
              submitResult.issueUrl ? (
                <Button
                  size="sm"
                  icon={<GitHubLogo size={13} />}
                  onClick={() => openExternal(submitResult.issueUrl!)}
                >
                  View issue <ExternalLink size={12} />
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-2xs text-pb-muted">
            {inTauri ? (
              <>
                Goes to <span className="font-mono text-white/80">{activeTarget.repo}</span>
              </>
            ) : (
              "Submitting needs the desktop launcher."
            )}
          </span>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!inTauri}
            icon={<GitHubLogo size={15} />}
          >
            {submitting ? "Sending…" : "Send report"}
          </Button>
        </div>
      </form>
      </Card>
    </div>
  );
}

import { useState } from "react";
import {
  Bug,
  CheckCircle2,
  ExternalLink,
  Flame,
  Lightbulb,
  Loader2,
  MessageSquareHeart,
  Monitor,
  Package,
  ShieldCheck,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Session, inTauri } from "../auth";
import { INSTANCES } from "../instances";
import { getSettings } from "../launch";
import { FeedbackSubmitResult, submitBetaFeedback } from "../community";
import { APP_VERSION } from "../version";
import { GitHubLogo } from "../components/BrandIcons";

interface Props {
  session: Session | null;
}

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

export default function Feedback({ session }: Props) {
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
  const instance = INSTANCES.find((i) => i.id === activeTarget.instanceId) ?? INSTANCES[0];

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
      const s = inTauri ? await getSettings() : { crashWebhookUrl: "" };
      const res = await submitBetaFeedback({
        webhookUrl: s.crashWebhookUrl || "",
        target: activeTarget.id,
        category,
        title: title.trim(),
        description: description.trim(),
        playerName: session?.profile.name ?? "Beta Tester (Not signed in)",
        playerUuid: session?.profile.uuid ?? "",
        contact: contact.trim(),
        launcherVersion: APP_VERSION,
        includeDiagnostics,
        instanceId: instance.id,
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

  function handleOpenUrl(url: string) {
    if (inTauri) {
      openUrl(url);
    } else {
      window.open(url, "_blank");
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
    handleOpenUrl(url);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-pb-purple/40 bg-pb-purple/15 px-3 py-1 text-xs font-bold text-pb-purple">
            <span>PETABLOCKS CLOSED BETA PROGRAM</span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold">Beta Feedback & Bug Reports</h1>
          <p className="mt-1 text-xs text-pb-muted">
            Reports automatically open a tracked GitHub Issue in{" "}
            <span className="font-mono font-bold text-white/90">{activeTarget.repo}</span> and notify the PETABLOCKS engineering team.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenGitHubIssue}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-pb-card px-4 py-2.5 text-xs font-bold text-pb-muted transition hover:border-white/20 hover:text-white"
        >
          <GitHubLogo size={15} /> Open in Browser
        </button>
      </div>

      {/* Target Repository Selector */}
      <div className="mt-5">
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-pb-muted">
          1. What are you reporting on?
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {REPORT_TARGETS.map((t) => {
            const active = target === t.id;
            const Icon = t.id === "launcher" ? Monitor : Package;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTarget(t.id);
                  setSubmitResult(null);
                }}
                className={`flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 text-left transition ${
                  active
                    ? "border-pb-cyan bg-pb-cyan/15 text-white shadow-[0_0_20px_rgba(15,205,248,0.12)]"
                    : "border-white/10 bg-pb-card text-pb-muted hover:border-white/20 hover:text-white"
                }`}
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
                    <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-pb-cyan">
                      {t.repo.split("/")[1]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug opacity-80">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Selector */}
      <div className="mt-4">
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-pb-muted">
          2. Report Category
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategory(c.id);
                  setSubmitResult(null);
                }}
                className={`flex cursor-pointer flex-col items-start rounded-xl border p-3.5 text-left transition ${
                  active
                    ? "border-pb-cyan bg-pb-cyan/15 text-white"
                    : "border-white/10 bg-pb-card text-pb-muted hover:border-white/20 hover:text-white"
                }`}
              >
                <Icon size={18} className={active ? "text-pb-cyan" : "text-pb-muted"} />
                <span className="mt-2 text-xs font-extrabold">{c.label}</span>
                <span className="mt-0.5 text-[11px] leading-tight opacity-75">{c.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Form */}
      <form
        onSubmit={handleSubmit}
        className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-pb-card p-6"
      >
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-pb-muted">
            Summary Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={activeCat.placeholderTitle}
            maxLength={120}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-pb-bg px-3.5 py-2.5 text-sm text-white placeholder:text-pb-muted/50 focus:border-pb-cyan focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-pb-muted">
            Details / Steps to Reproduce *
          </label>
          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={activeCat.placeholderDesc}
            maxLength={2500}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-pb-bg px-3.5 py-2.5 text-sm leading-relaxed text-white placeholder:text-pb-muted/50 focus:border-pb-cyan focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-pb-muted">
              Minecraft Account
            </label>
            <input
              type="text"
              disabled
              value={
                session
                  ? `${session.profile.name} (Verified)`
                  : "Not signed in"
              }
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-pb-bg/60 px-3.5 py-2 text-xs font-semibold text-pb-muted"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-pb-muted">
              Discord Username (Optional)
            </label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g., @username so we can follow up"
              maxLength={64}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-pb-bg px-3.5 py-2 text-xs text-white placeholder:text-pb-muted/50 focus:border-pb-cyan focus:outline-none"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-pb-bg/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-pb-cyan" />
            <div>
              <div className="text-xs font-bold text-white">
                Include Automatic Launcher Diagnostics
              </div>
              <div className="text-[11px] text-pb-muted">
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
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {submitResult && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pb-mint/40 bg-pb-mint/15 px-4 py-3 text-xs font-bold text-pb-mint">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>
                {submitResult.issueNumber && submitResult.repository
                  ? `Issue #${submitResult.issueNumber} created in ${submitResult.repository}!`
                  : "Thank you! Your report has been delivered to the PETABLOCKS team."}
              </span>
            </div>
            {submitResult.issueUrl && (
              <button
                type="button"
                onClick={() => handleOpenUrl(submitResult.issueUrl!)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-pb-mint/40 bg-black/30 px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-black/50"
              >
                <GitHubLogo size={13} />
                <span>View Issue #{submitResult.issueNumber}</span>
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-pb-muted">
            Target repo: <span className="font-mono text-white/80">{activeTarget.repo}</span>
          </span>
          <button
            type="submit"
            disabled={submitting || !inTauri}
            className="pb-glow inline-flex cursor-pointer items-center gap-2 rounded-xl bg-pb-cyan px-6 py-2.5 text-xs font-extrabold text-[#031617] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Creating GitHub Issue...
              </>
            ) : (
              <>
                <GitHubLogo size={15} /> Submit Report to GitHub
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

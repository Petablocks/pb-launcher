import { useState } from "react";
import {
  Bug,
  CheckCircle2,
  Flame,
  Lightbulb,
  Loader2,
  MessageSquareHeart,
  ShieldCheck,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Session, inTauri } from "../auth";
import { INSTANCES } from "../instances";
import { getSettings } from "../launch";
import { submitBetaFeedback } from "../community";
import { APP_VERSION } from "../version";
import { DiscordLogo, GitHubLogo } from "../components/BrandIcons";

interface Props {
  session: Session | null;
}

type CategoryId = "bug" | "crash" | "suggestion" | "feedback";

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
    desc: "Suggest an improvement or feature for the launcher",
    icon: Lightbulb,
    placeholderTitle: "e.g., Add shaderpack selector tab",
    placeholderDesc: "Describe the feature or quality-of-life improvement you'd love to see...",
  },
  {
    id: "feedback",
    label: "Beta Impression",
    desc: "Share general thoughts on performance, UI, or onboarding",
    icon: MessageSquareHeart,
    placeholderTitle: "e.g., Smooth install & update experience on Windows 11",
    placeholderDesc: "How is the PETABLOCKS Launcher Beta feeling on your PC so far?",
  },
];

export default function Feedback({ session }: Props) {
  const instance = INSTANCES[0];
  const [category, setCategory] = useState<CategoryId>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Please provide both a short summary title and details.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSubmitted(false);
    try {
      const s = inTauri ? await getSettings() : { crashWebhookUrl: "" };
      await submitBetaFeedback({
        webhookUrl: s.crashWebhookUrl || "",
        category,
        title: title.trim(),
        description: description.trim(),
        playerName: session?.profile.name ?? "Beta Tester (Not signed in)",
        contact: contact.trim(),
        launcherVersion: APP_VERSION,
        includeDiagnostics,
        instanceId: instance.id,
      });
      setSubmitted(true);
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
      `**Category:** ${activeCat.label}\n**Launcher Version:** v${APP_VERSION}\n**Minecraft User:** ${
        session?.profile.name ?? "Not signed in"
      }\n\n### Description\n${description || "_Describe the issue or feedback here..._"}`
    );
    const url = `https://github.com/Petablocks/pb-launcher/issues/new?title=${issueTitle}&body=${issueBody}`;
    if (inTauri) {
      openUrl(url);
    } else {
      window.open(url, "_blank");
    }
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
            Help us polish the PETABLOCKS Launcher during Beta! Reports go directly to the PETABLOCKS engineering channel on Discord.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenGitHubIssue}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-pb-card px-4 py-2.5 text-xs font-bold text-pb-muted transition hover:border-white/20 hover:text-white"
        >
          <GitHubLogo size={15} /> Open GitHub Issue
        </button>
      </div>

      {/* Category Selector */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategory(c.id);
                setSubmitted(false);
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
                  : "Not signed in (Pending Mojang Approval)"
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
                Attaches Launcher v{APP_VERSION}, OS arch, RAM allocation, Java 21 status, and synced modpack version (no personal tokens).
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

        {submitted && (
          <div className="flex items-center gap-2 rounded-xl border border-pb-mint/40 bg-pb-mint/15 px-4 py-3 text-xs font-bold text-pb-mint">
            <CheckCircle2 size={16} />
            <span>
              Thank you! Your report has been delivered to the PETABLOCKS team on Discord.
            </span>
          </div>
        )}

        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            disabled={submitting || !inTauri}
            className="pb-glow inline-flex cursor-pointer items-center gap-2 rounded-xl bg-pb-cyan px-6 py-2.5 text-xs font-extrabold text-[#031617] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Sending Report...
              </>
            ) : (
              <>
                <DiscordLogo size={15} /> Send Report to PETABLOCKS Team
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserRound,
  WifiOff,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  DeviceCodeInfo,
  Session,
  avatarUrl,
  bodySkinUrl,
  completeLogin,
  inTauri,
  logout,
  restoreSession,
  startLogin,
} from "../auth";
import {
  DiscordLinkStatus,
  checkDiscordLink,
  requestDiscordLinkCode,
} from "../community";
import { DiscordLogo, MicrosoftLogo } from "./BrandIcons";

interface Props {
  session: Session | null;
  onSession: (s: Session | null) => void;
  totalPlaytimeSeconds?: number;
  sessionsPlayed?: number;
  discordStatus?: DiscordLinkStatus | null;
  onDiscordStatus?: (status: DiscordLinkStatus | null) => void;
}

function formatPlaytime(seconds = 0): string {
  if (seconds < 60) return "0m";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export default function AccountCard({
  session,
  onSession,
  totalPlaytimeSeconds = 0,
  sessionsPlayed = 0,
  discordStatus,
  onDiscordStatus,
}: Props) {
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkingDiscord, setCheckingDiscord] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const attempt = useRef(0);

  async function refreshDiscordStatus(uuid: string) {
    if (!inTauri) return;
    setCheckingDiscord(true);
    try {
      const st = await checkDiscordLink(uuid);
      onDiscordStatus?.(st);
      if (st.pendingCode && !generatedCode) {
        setGeneratedCode(st.pendingCode);
      }
    } catch {
      // Ignore transient network errors when checking identity portal
    } finally {
      setCheckingDiscord(false);
    }
  }

  useEffect(() => {
    if (session) {
      setChecking(false);
      refreshDiscordStatus(session.profile.uuid);
      return;
    }
    restoreSession()
      .then((s) => {
        if (s) {
          onSession(s);
          refreshDiscordStatus(s.profile.uuid);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.profile.uuid]);

  // Poll every 8s while signed in but not yet Discord-linked so linking in browser/Discord unlocks Play immediately
  useEffect(() => {
    if (!session || discordStatus?.linked) return;
    const timer = setInterval(() => {
      refreshDiscordStatus(session.profile.uuid);
    }, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.profile.uuid, discordStatus?.linked]);

  async function signIn() {
    const id = ++attempt.current;
    setError(null);
    setBusy(true);
    try {
      const info = await startLogin();
      setDevice(info);
      openUrl(info.verification_uri).catch(() => {});
      const s = await completeLogin(info);
      if (id === attempt.current) onSession(s);
    } catch (e) {
      if (id === attempt.current) setError(String(e));
    } finally {
      if (id === attempt.current) {
        setBusy(false);
        setDevice(null);
      }
    }
  }

  function cancel() {
    attempt.current++;
    setBusy(false);
    setDevice(null);
  }

  async function signOut() {
    await logout();
    onSession(null);
    onDiscordStatus?.(null);
    setGeneratedCode(null);
  }

  async function handleOneClickDiscordOAuth() {
    if (!session) return;
    setGeneratingCode(true);
    setError(null);
    try {
      const res = await requestDiscordLinkCode(session.profile.uuid, session.profile.name);
      setGeneratedCode(res.code);
      const url = res.oauthUrl || "https://my.petablocks.com/link";
      if (inTauri) openUrl(url).catch(() => {});
      else window.open(url, "_blank");
    } catch (e) {
      setError(String(e));
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleGenerateLinkCode() {
    if (!session) return;
    setGeneratingCode(true);
    setError(null);
    try {
      const res = await requestDiscordLinkCode(session.profile.uuid, session.profile.name);
      setGeneratedCode(res.code);
    } catch (e) {
      setError(String(e));
    } finally {
      setGeneratingCode(false);
    }
  }

  if (checking) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/10 bg-pb-card p-4 text-sm text-pb-muted">
        <Loader2 size={18} className="animate-spin" /> Checking account...
      </div>
    );
  }

  if (session) {
    const isLinked = Boolean(discordStatus?.linked);
    const inGuild = Boolean(discordStatus?.inGuild);

    return (
      <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-pb-card p-5">
        <div className="flex items-center gap-5">
          <div className="relative flex h-20 w-16 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-pb-bg/80 p-1.5">
            <img
              src={bodySkinUrl(session.profile.uuid, 120)}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = avatarUrl(session.profile.uuid, 64);
              }}
              alt={session.profile.name}
              className="h-full w-auto object-contain drop-shadow-[0_4px_10px_rgba(15,205,248,0.3)]"
              draggable={false}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-base font-extrabold text-white">
                {session.profile.name}
              </span>
              {discordStatus?.rank && (
                <span className="rounded-md border border-pb-purple/40 bg-pb-purple/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-pb-purple">
                  {discordStatus.rank}
                </span>
              )}
              <span className="rounded-md bg-pb-cyan/15 px-2 py-0.5 font-mono text-[10px] font-bold text-pb-cyan">
                {formatPlaytime(totalPlaytimeSeconds)} played
              </span>
              {sessionsPlayed > 0 && (
                <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] text-pb-muted">
                  {sessionsPlayed} {sessionsPlayed === 1 ? "session" : "sessions"}
                </span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-pb-muted">
              <span className="inline-flex items-center gap-1.5">
                {session.offline ? (
                  <>
                    <WifiOff size={12} /> Offline - cached account
                  </>
                ) : (
                  <>
                    <MicrosoftLogo size={12} /> Verified Microsoft Account
                  </>
                )}
              </span>

              {isLinked && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#5865F2]">
                  <DiscordLogo size={13} />
                  <span>@{discordStatus?.discordUsername}</span>
                  {inGuild ? (
                    <span className="inline-flex items-center gap-1 rounded bg-pb-mint/15 px-1.5 py-0.5 text-[10px] font-bold text-pb-mint">
                      <CheckCircle2 size={10} /> Beta Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                      Not in Discord Server
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => refreshDiscordStatus(session.profile.uuid)}
              disabled={checkingDiscord}
              title="Refresh Discord link & role status"
              className="cursor-pointer rounded-lg p-2 text-pb-muted hover:bg-white/5 hover:text-white"
            >
              <RefreshCw size={14} className={checkingDiscord ? "animate-spin text-pb-cyan" : ""} />
            </button>
            <button
              onClick={signOut}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-pb-muted hover:bg-white/5 hover:text-white"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>

        {/* Closed Beta Discord Link & Role Gate Banner */}
        {!isLinked ? (
          <div className="rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-extrabold text-white">
                  <DiscordLogo size={15} className="text-[#5865F2]" />
                  <span>Link Discord Account (Required for Closed Beta + 32x Diamonds)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-pb-muted">
                  During the Closed Beta, players must link their Discord account to verify server membership, sync ranks, and claim <strong>32x Diamonds</strong> on Season 2.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOneClickDiscordOAuth}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#5865F2] px-3.5 py-2 text-xs font-extrabold text-white shadow transition hover:brightness-110"
                >
                  <DiscordLogo size={14} /> One-Click Link via Browser
                </button>
                <button
                  type="button"
                  onClick={handleGenerateLinkCode}
                  disabled={generatingCode}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-pb-bg/80 px-3 py-2 text-xs font-bold text-white transition hover:border-pb-cyan/50 hover:text-pb-cyan disabled:opacity-50"
                >
                  {generatingCode ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <KeyRound size={13} className="text-pb-cyan" />
                  )}
                  Get `/link` Code
                </button>
              </div>
            </div>

            {generatedCode && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pb-cyan/30 bg-pb-bg/90 px-3.5 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-minecraft text-xl tracking-[0.2em] text-pb-cyan select-text">
                    {generatedCode}
                  </span>
                  <span className="text-[11px] text-pb-muted">
                    Run <code className="font-mono text-white">/link code:{generatedCode}</code> in the{" "}
                    <button
                      type="button"
                      onClick={() => openUrl("https://discord.gg/YpKbVHASqC").catch(() => {})}
                      className="cursor-pointer font-bold text-pb-cyan underline"
                    >
                      PETABLOCKS Discord
                    </button>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`/link code:${generatedCode}`);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/20"
                >
                  <Copy size={12} /> {copiedCode ? "Copied `/link` command!" : "Copy `/link` Command"}
                </button>
              </div>
            )}
          </div>
        ) : !inGuild ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-200">
              <ShieldAlert size={16} className="shrink-0 text-amber-400" />
              <span>
                Your Discord (<strong>@{discordStatus?.discordUsername}</strong>) is linked, but you need to join the official PETABLOCKS Discord server to unlock the Closed Beta.
              </span>
            </div>
            <button
              type="button"
              onClick={() => openUrl("https://discord.gg/YpKbVHASqC").catch(() => {})}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#5865F2] px-3 py-1.5 font-extrabold text-white hover:brightness-110"
            >
              <DiscordLogo size={13} /> Join Discord Server
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-pb-mint/25 bg-pb-mint/5 px-3.5 py-2 text-[11px] text-pb-muted">
            <span className="flex items-center gap-1.5 text-pb-mint font-semibold">
              <Sparkles size={13} /> Discord Linked (@{discordStatus?.discordUsername}) • Rank & 32x Diamonds Synced
            </span>
            <button
              type="button"
              onClick={() => openUrl("https://my.petablocks.com/hub").catch(() => {})}
              className="inline-flex cursor-pointer items-center gap-1 font-semibold text-pb-cyan hover:underline"
            >
              My PETABLOCKS Hub <ExternalLink size={11} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-pb-card p-4">
      {device ? (
        <div className="text-center">
          <p className="text-sm text-pb-muted">Enter this code at {device.verification_uri}</p>
          <div className="font-minecraft my-3 text-4xl tracking-[0.25em] pb-text-gradient select-text">
            {device.user_code}
          </div>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(device.user_code)}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              <Copy size={14} /> Copy code
            </button>
            <button
              onClick={() => openUrl(device.verification_uri).catch(() => {})}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              <ExternalLink size={14} /> Open page
            </button>
            <button
              onClick={cancel}
              className="rounded-lg px-3 py-2 text-sm text-pb-muted hover:text-white"
            >
              Cancel
            </button>
          </div>
          <p className="mt-3 flex items-center justify-center gap-2 text-xs text-pb-muted">
            <Loader2 size={12} className="animate-spin" /> Waiting for you to sign in...
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <UserRound size={18} className="text-pb-muted" />
          <span className="flex-1 text-sm text-pb-muted">Not signed in</span>
          <button
            onClick={signIn}
            disabled={busy || !inTauri}
            className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg bg-pb-cyan px-4 py-2 text-sm font-bold text-[#031617] hover:brightness-110 disabled:opacity-50"
          >
            <MicrosoftLogo size={16} />
            Sign in with Microsoft
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}

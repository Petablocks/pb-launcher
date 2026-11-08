import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  ShieldAlert,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  DeviceCodeInfo,
  Session,
  avatarUrl,
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
  discordStatus: DiscordLinkStatus | null;
  onDiscordStatus: (status: DiscordLinkStatus | null) => void;
  totalPlaytimeSeconds?: number;
  sessionsPlayed?: number;
}

function formatPlaytime(seconds = 0): string {
  if (seconds < 60) return "0m";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export default function SidebarAccountPill({
  session,
  onSession,
  discordStatus,
  onDiscordStatus,
  totalPlaytimeSeconds = 0,
  sessionsPlayed = 0,
}: Props) {
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkingDiscord, setCheckingDiscord] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const attempt = useRef(0);

  async function refreshDiscordStatus(uuid: string) {
    if (!inTauri) return;
    setCheckingDiscord(true);
    try {
      const st = await checkDiscordLink(uuid);
      onDiscordStatus(st);
      if (st.pendingCode && !generatedCode) {
        setGeneratedCode(st.pendingCode);
      }
    } catch {
      // ignore
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
      if (id === attempt.current) {
        onSession(s);
        setShowModal(false);
      }
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
    onDiscordStatus(null);
    setGeneratedCode(null);
    setShowModal(false);
  }

  async function handleOneClickDiscordOAuth() {
    if (!session) return;
    const url = `https://my.petablocks.com/api/public/oauth/discord?mc_uuid=${encodeURIComponent(
      session.profile.uuid
    )}&mc_username=${encodeURIComponent(session.profile.name)}&returnTo=${encodeURIComponent(
      "/hub"
    )}`;
    if (inTauri) openUrl(url).catch(() => {});
    else window.open(url, "_blank");
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

  function handleCopyCode() {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  const isDiscordReady = Boolean(discordStatus?.linked && discordStatus?.inGuild);

  return (
    <>
      {/* Sidebar Compact Pill */}
      <div className="w-full">
        {session ? (
          <button
            onClick={() => setShowModal(true)}
            className="group flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition hover:border-pb-cyan/50 hover:bg-white/10"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative shrink-0">
                <img
                  src={avatarUrl(session.profile.uuid, 64)}
                  alt={session.profile.name}
                  className="h-8 w-8 rounded-lg border border-white/20 bg-black/40 object-cover"
                />
                <span
                  className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-pb-card ${
                    isDiscordReady ? "bg-pb-mint" : "bg-amber-400"
                  }`}
                  title={isDiscordReady ? "Discord Linked & Ready" : "Discord Link Required"}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white group-hover:text-pb-cyan">
                  {session.profile.name}
                </p>
                <p className="truncate text-[10px] text-pb-muted">
                  {isDiscordReady
                    ? `${formatPlaytime(totalPlaytimeSeconds)} • ${sessionsPlayed} ${
                        sessionsPlayed === 1 ? "session" : "sessions"
                      }`
                    : "Link Discord"}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-pb-muted group-hover:text-white">⚙</span>
          </button>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            disabled={checking}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-pb-cyan px-3 py-2 text-xs font-extrabold text-[#031617] shadow-md transition hover:brightness-110 disabled:opacity-50"
          >
            <MicrosoftLogo size={14} />
            <span>Sign In</span>
          </button>
        )}
      </div>

      {/* Account Details & Sign In Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#0b121e] p-6 shadow-2xl">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-pb-muted transition hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>

            {session ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <img
                    src={avatarUrl(session.profile.uuid, 128)}
                    alt={session.profile.name}
                    className="h-14 w-14 rounded-xl border border-white/20 bg-black/40 shadow-inner"
                  />
                  <div>
                    <h3 className="text-base font-extrabold text-white">{session.profile.name}</h3>
                    <p className="text-xs text-pb-muted">Minecraft UUID: {session.profile.uuid.slice(0, 8)}...</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-pb-muted">
                      <span>Playtime: {formatPlaytime(totalPlaytimeSeconds)}</span>
                      <span>•</span>
                      <span>{sessionsPlayed} sessions</span>
                    </div>
                  </div>
                </div>

                {/* Discord Closed Beta Status */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-bold text-white">
                      <DiscordLogo size={16} /> Discord Closed Beta Access
                    </span>
                    {isDiscordReady ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-pb-mint">
                        <CheckCircle2 size={13} /> Verified Member
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                        <ShieldAlert size={13} /> Required to Play
                      </span>
                    )}
                  </div>

                  {discordStatus?.linked ? (
                    <div className="mt-2 text-xs text-pb-muted">
                      Linked as <strong className="text-white">@{discordStatus.discordUsername}</strong>.
                      {discordStatus.inGuild ? (
                        <p className="text-pb-mint">✓ Community role confirmed. All servers unlocked!</p>
                      ) : (
                        <p className="text-amber-300">You must be in discord.gg/petablocks to launch.</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-pb-muted">
                        Link your Minecraft account with Discord to unlock Season 2 and join the community.
                      </p>
                      <button
                        onClick={handleOneClickDiscordOAuth}
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#4752c4]"
                      >
                        <DiscordLogo size={14} /> One-Click Link via Browser
                      </button>

                      {generatedCode ? (
                        <div className="mt-2 flex items-center justify-between rounded-lg border border-white/10 bg-black/60 p-2">
                          <code className="text-xs font-mono font-bold text-pb-cyan">{generatedCode}</code>
                          <button
                            onClick={handleCopyCode}
                            className="flex items-center gap-1 text-[11px] font-bold text-pb-muted hover:text-white"
                          >
                            <Copy size={12} /> {copiedCode ? "Copied" : "Copy"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleGenerateLinkCode}
                          disabled={generatingCode}
                          className="flex w-full cursor-pointer items-center justify-center gap-1.5 text-[11px] font-semibold text-pb-muted hover:text-white"
                        >
                          {generatingCode ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                          Generate code for `/link` bot command
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => {
                      const url = "https://my.petablocks.com";
                      if (inTauri) openUrl(url).catch(() => {});
                      else window.open(url, "_blank");
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-pb-cyan hover:underline"
                  >
                    <span>My PETABLOCKS Hub</span>
                    <ExternalLink size={12} />
                  </button>

                  <button
                    onClick={signOut}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut size={13} /> Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pb-cyan/15 text-pb-cyan shadow-inner">
                    <UserRound size={24} />
                  </div>
                  <h3 className="mt-3 text-base font-extrabold text-white">Sign In to PETABLOCKS</h3>
                  <p className="mt-1 text-xs text-pb-muted">
                    Authenticate securely with your Microsoft account to verify Minecraft ownership.
                  </p>
                </div>

                {device ? (
                  <div className="rounded-xl border border-pb-cyan/30 bg-pb-cyan/10 p-4 text-center">
                    <p className="text-xs text-white">
                      Enter this code in the Microsoft verification page:
                    </p>
                    <div className="my-3 font-mono text-2xl font-black tracking-widest text-pb-cyan">
                      {device.user_code}
                    </div>
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openUrl(device.verification_uri)}
                        className="rounded-lg bg-pb-cyan px-3 py-1.5 text-xs font-bold text-black"
                      >
                        Open Browser
                      </button>
                      <button
                        onClick={cancel}
                        className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={signIn}
                    disabled={busy}
                    className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-pb-cyan py-3 text-sm font-extrabold text-[#031617] shadow-lg shadow-pb-cyan/20 transition hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Waiting for browser approval...
                      </>
                    ) : (
                      <>
                        <MicrosoftLogo size={16} /> Sign in with Microsoft
                      </>
                    )}
                  </button>
                )}

                {error && (
                  <p className="rounded-lg bg-red-500/10 p-2 text-center text-xs text-red-400">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

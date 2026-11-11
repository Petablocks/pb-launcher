import { useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  LogOut,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { DeviceCodeInfo, avatarUrl, completeLogin, logout, startLogin } from "../auth";
import { requestDiscordLinkCode } from "../community";
import { formatPlaytime, pluralize } from "../lib/format";
import { openExternal } from "../lib/open";
import { useLauncher } from "../state/LauncherProvider";
import { DiscordLogo, MicrosoftLogo } from "./BrandIcons";
import { Alert, Button, Modal } from "./ui";

export const DISCORD_INVITE_URL = "https://discord.gg/YpKbVHASqC";

/** Sidebar account button plus the dialog for signing in and linking Discord. */
export default function AccountMenu() {
  const {
    session,
    setSession,
    restoringSession,
    discordStatus,
    refreshDiscord,
    totalPlaytimeSeconds,
    totalSessions,
    accountOpen,
    setAccountOpen,
  } = useLauncher();

  const [device, setDevice] = useState<DeviceCodeInfo | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [requestingLink, setRequestingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  // Each sign-in attempt gets an id so a cancelled attempt cannot complete later.
  const attempt = useRef(0);

  const discordReady = Boolean(discordStatus?.linked && discordStatus.inGuild);
  const pendingCode = linkCode ?? discordStatus?.pendingCode ?? null;

  async function signIn() {
    const id = ++attempt.current;
    setError(null);
    setSigningIn(true);
    try {
      const info = await startLogin();
      if (id !== attempt.current) return;
      setDevice(info);
      openExternal(info.verification_uri);
      const next = await completeLogin(info);
      if (id === attempt.current) setSession(next);
    } catch (e) {
      if (id === attempt.current) setError(String(e));
    } finally {
      if (id === attempt.current) {
        setSigningIn(false);
        setDevice(null);
      }
    }
  }

  function cancelSignIn() {
    attempt.current++;
    setSigningIn(false);
    setDevice(null);
  }

  async function signOut() {
    try {
      await logout();
    } catch (e) {
      setError(String(e));
      return;
    }
    setSession(null);
    setLinkCode(null);
    setAccountOpen(false);
  }

  async function requestLink(openBrowser: boolean) {
    if (!session) return;
    setRequestingLink(true);
    setError(null);
    try {
      const res = await requestDiscordLinkCode(session.profile.uuid, session.profile.name);
      setLinkCode(res.code);
      if (openBrowser) openExternal(res.oauthUrl || "https://my.petablocks.com/link");
    } catch (e) {
      setError(String(e));
    } finally {
      setRequestingLink(false);
    }
  }

  function copyCode() {
    if (!pendingCode) return;
    navigator.clipboard
      .writeText(pendingCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <>
      {session ? (
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          aria-haspopup="dialog"
          className="group flex w-full items-center justify-between gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2 text-left transition hover:border-pb-cyan/50 hover:bg-white/10"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="relative shrink-0">
              <img
                src={avatarUrl(session.profile.uuid, 64)}
                alt=""
                className="h-8 w-8 rounded-lg border border-white/20 bg-black/40 object-cover"
              />
              <span
                className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-pb-card ${
                  discordReady ? "bg-pb-mint" : "bg-amber-400"
                }`}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-white group-hover:text-pb-cyan">
                {session.profile.name}
              </span>
              <span className="block truncate text-2xs text-pb-muted">
                {session.offline
                  ? "Offline — sign in again"
                  : discordReady
                    ? `${formatPlaytime(totalPlaytimeSeconds)} played`
                    : "Discord not linked"}
              </span>
            </span>
          </span>
          <ChevronRight size={14} className="shrink-0 text-pb-muted group-hover:text-white" />
        </button>
      ) : (
        <Button
          variant="primary"
          block
          disabled={restoringSession}
          onClick={() => setAccountOpen(true)}
          icon={<MicrosoftLogo size={14} />}
        >
          Sign in
        </Button>
      )}

      <Modal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={session ? "Your account" : "Sign in to PETABLOCKS"}
        size="sm"
        hideTitle
      >
        {session ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <img
                src={avatarUrl(session.profile.uuid, 128)}
                alt=""
                className="h-14 w-14 rounded-xl border border-white/20 bg-black/40"
              />
              <div className="min-w-0">
                <div className="truncate text-base font-extrabold text-white">{session.profile.name}</div>
                <div className="mt-0.5 text-xs text-pb-muted">
                  {formatPlaytime(totalPlaytimeSeconds)} played · {pluralize(totalSessions, "session")}
                </div>
              </div>
            </div>

            {session.offline && (
              <Alert
                tone="warning"
                title="Session not verified"
                actions={
                  <Button size="sm" variant="primary" loading={signingIn} onClick={signIn}>
                    Sign in again
                  </Button>
                }
              >
                Minecraft services could not confirm your account, so online play is unavailable.
              </Alert>
            )}

            <div className="rounded-xl border border-white/10 bg-black/40 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-bold text-white">
                  <DiscordLogo size={16} /> Discord
                </span>
                {discordReady ? (
                  <span className="flex items-center gap-1 text-2xs font-bold text-pb-mint">
                    <CheckCircle2 size={13} /> Linked
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-2xs font-bold text-amber-300">
                    <ShieldAlert size={13} /> Needed for closed beta
                  </span>
                )}
              </div>

              {discordStatus?.linked ? (
                <div className="mt-2 space-y-2 text-xs text-pb-muted">
                  <p>
                    Linked as <strong className="text-white">@{discordStatus.discordUsername}</strong>.
                  </p>
                  {discordStatus.inGuild ? (
                    <p className="text-pb-mint">You're in the PETABLOCKS Discord. All servers unlocked.</p>
                  ) : (
                    <>
                      <p className="text-amber-200">
                        Join the PETABLOCKS Discord server to unlock closed beta servers.
                      </p>
                      <Button
                        variant="discord"
                        block
                        icon={<DiscordLogo size={14} />}
                        onClick={() => {
                          openExternal(DISCORD_INVITE_URL);
                          refreshDiscord();
                        }}
                      >
                        Join the Discord server
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2.5">
                  <p className="text-xs text-pb-muted">
                    Link your Minecraft account with Discord to unlock closed beta servers. This
                    page updates by itself once you finish in the browser.
                  </p>
                  <Button
                    variant="discord"
                    block
                    loading={requestingLink}
                    icon={<DiscordLogo size={14} />}
                    onClick={() => requestLink(true)}
                  >
                    Link Discord in browser
                  </Button>
                  {pendingCode ? (
                    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/60 p-2">
                      <span className="text-2xs text-pb-muted">
                        Or run <code className="font-mono text-white">/link</code> in Discord with code{" "}
                        <code className="select-text font-mono text-xs font-bold text-pb-cyan">{pendingCode}</code>
                      </span>
                      <Button size="sm" variant="ghost" icon={<Copy size={12} />} onClick={copyCode}>
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      block
                      disabled={requestingLink}
                      icon={<KeyRound size={12} />}
                      onClick={() => requestLink(false)}
                    >
                      Get a code for the /link command instead
                    </Button>
                  )}
                </div>
              )}
            </div>

            {error && (
              <Alert tone="error" onDismiss={() => setError(null)}>
                {error}
              </Alert>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="text-pb-cyan"
                onClick={() => openExternal("https://my.petablocks.com")}
              >
                My PETABLOCKS <ExternalLink size={12} />
              </Button>
              <Button size="sm" variant="danger" icon={<LogOut size={13} />} onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pb-cyan/15 text-pb-cyan">
                <UserRound size={24} />
              </div>
              <div className="mt-3 text-base font-extrabold text-white">Sign in to PETABLOCKS</div>
              <p className="mt-1 text-xs text-pb-muted">
                Use the Microsoft account that owns Minecraft: Java Edition. Your password is
                entered on Microsoft's site and never seen by the launcher.
              </p>
            </div>

            {device ? (
              <div className="rounded-xl border border-pb-cyan/30 bg-pb-cyan/10 p-4 text-center">
                <p className="text-xs text-white">Enter this code on the Microsoft page that just opened:</p>
                <div className="my-3 select-text font-mono text-2xl font-black tracking-widest text-pb-cyan">
                  {device.user_code}
                </div>
                <p className="mb-3 text-2xs text-pb-muted">Waiting for you to approve in the browser…</p>
                <div className="flex justify-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openExternal(device.verification_uri)}
                  >
                    Open the page again
                  </Button>
                  <Button size="sm" onClick={cancelSignIn}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                block
                loading={signingIn}
                icon={<MicrosoftLogo size={16} />}
                onClick={signIn}
              >
                {signingIn ? "Contacting Microsoft…" : "Sign in with Microsoft"}
              </Button>
            )}

            {error && (
              <Alert tone="error" onDismiss={() => setError(null)}>
                {error}
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

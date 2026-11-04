import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, LogOut, UserRound, Loader2, WifiOff } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DeviceCodeInfo, Session, avatarUrl, bodySkinUrl, completeLogin, inTauri, logout, restoreSession, startLogin } from "../auth";
import { MicrosoftLogo } from "./BrandIcons";

interface Props {
  session: Session | null;
  onSession: (s: Session | null) => void;
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

export default function AccountCard({
  session,
  onSession,
  totalPlaytimeSeconds = 0,
  sessionsPlayed = 0,
}: Props) {
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const attempt = useRef(0);

  useEffect(() => {
    if (session) {
      setChecking(false);
      return;
    }
    restoreSession()
      .then((s) => s && onSession(s))
      .catch((e) => setError(String(e)))
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }

  if (checking) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/10 bg-pb-card p-4 text-sm text-pb-muted">
        <Loader2 size={18} className="animate-spin" /> Checking account...
      </div>
    );
  }

  if (session) {
    return (
      <div className="mt-6 flex items-center gap-5 rounded-2xl border border-white/10 bg-pb-card p-5">
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
            <span className="truncate text-base font-extrabold text-white">{session.profile.name}</span>
            <span className="rounded-md bg-pb-cyan/15 px-2 py-0.5 font-mono text-[10px] font-bold text-pb-cyan">
              {formatPlaytime(totalPlaytimeSeconds)} played
            </span>
            {sessionsPlayed > 0 && (
              <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10px] text-pb-muted">
                {sessionsPlayed} {sessionsPlayed === 1 ? "session" : "sessions"}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-pb-muted">
            {session.offline ? (
              <>
                <WifiOff size={12} /> Offline - cached account
              </>
            ) : (
              <>
                <MicrosoftLogo size={12} /> Verified Microsoft Account (Minecraft: Java Edition)
              </>
            )}
          </div>
        </div>
        <button
          onClick={signOut}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-pb-muted hover:bg-white/5 hover:text-white"
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-pb-card p-4">
      {device ? (
        <div className="text-center">
          <p className="text-sm text-pb-muted">Enter this code at {device.verification_uri}</p>
          <div className="font-minecraft my-3 text-4xl tracking-[0.25em] pb-text-gradient select-text">{device.user_code}</div>
          <div className="flex justify-center gap-2">
            <button onClick={() => navigator.clipboard.writeText(device.user_code)} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
              <Copy size={14} /> Copy code
            </button>
            <button onClick={() => openUrl(device.verification_uri).catch(() => {})} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
              <ExternalLink size={14} /> Open page
            </button>
            <button onClick={cancel} className="rounded-lg px-3 py-2 text-sm text-pb-muted hover:text-white">Cancel</button>
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


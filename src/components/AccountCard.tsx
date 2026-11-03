import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, LogOut, UserRound, Loader2, WifiOff } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DeviceCodeInfo, Session, avatarUrl, completeLogin, inTauri, logout, restoreSession, startLogin } from "../auth";

interface Props {
  session: Session | null;
  onSession: (s: Session | null) => void;
}

export default function AccountCard({ session, onSession }: Props) {
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
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-white/10 bg-pb-card p-4">
        <img src={avatarUrl(session.profile.uuid)} alt="" className="h-10 w-10 rounded-md" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{session.profile.name}</div>
          <div className="flex items-center gap-1 text-xs text-pb-muted">
            {session.offline ? (<><WifiOff size={12} /> Offline - cached account</>) : "Signed in with Microsoft"}
          </div>
        </div>
        <button onClick={signOut} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-pb-muted hover:bg-white/5 hover:text-white">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-pb-card p-4">
      {device ? (
        <div className="text-center">
          <p className="text-sm text-pb-muted">Enter this code at {device.verification_uri}</p>
          <div className="my-3 text-4xl font-extrabold tracking-[0.3em] pb-text-gradient select-text">{device.user_code}</div>
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
            className="rounded-lg bg-pb-cyan px-4 py-2 text-sm font-bold text-[#031617] hover:brightness-110 disabled:opacity-50"
          >
            Sign in with Microsoft
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}


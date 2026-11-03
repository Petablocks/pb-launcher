import { Play } from "lucide-react";
import { INSTANCES } from "../instances";
import AccountCard from "../components/AccountCard";
import { Session } from "../auth";
import logo from "../assets/petablocks-logo-horizontal-512w.png";

interface Props {
  session: Session | null;
  onSession: (s: Session | null) => void;
}

export default function Home({ session, onSession }: Props) {
  const instance = INSTANCES[0];
  return (
    <div className="mx-auto max-w-3xl">
      <img src={logo} alt="PETABLOCKS" className="mb-8 h-14 object-contain object-left" draggable={false} />

      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-pb-card p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-pb-cyan/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-pb-purple/10 blur-3xl" />
        <div className="relative">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-pb-mint/15 px-3 py-1 text-xs font-bold text-pb-mint">
            <span className="h-2 w-2 rounded-full bg-pb-mint" /> {instance.serverAddress}
          </div>
          <h1 className="text-3xl font-extrabold">{instance.name}</h1>
          <p className="mt-1 text-sm text-pb-muted">
            Minecraft {instance.minecraftVersion} - {instance.loader}
          </p>
          <button
            disabled
            className="pb-glow mt-8 inline-flex items-center gap-2 rounded-xl bg-pb-cyan px-8 py-3 text-lg font-extrabold text-[#031617] opacity-60"
          >
            <Play size={20} fill="currentColor" /> Play
          </button>
          <p className="mt-3 text-xs text-pb-muted">
            {session ? "Game launch arrives in a later release." : "Sign in with Microsoft to play."}
          </p>
        </div>
      </section>

      <AccountCard session={session} onSession={onSession} />
    </div>
  );
}

import { ExternalLink, Globe, Heart, Map, Sparkles } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BuyMeACoffeeLogo, GitHubLogo } from "../components/BrandIcons";

const UPDATES = [
  {
    version: "v0.18.0",
    date: "2026-11-03",
    title: "Official PETABLOCKS Launcher Support & Optional Mod Toggles",
    highlights: [
      "Added native launcher-manifest.json generation with SHA-1 verification and Modrinth CDN links.",
      "Enabled 12 optional client mod toggles (Simple Voice Chat, Xaero's Minimap & World Map, 3D Skin Layers, Freecam, Zoom, Sound Muffler).",
      "Preloaded official 512x512 PETABLOCKS branding icon and animated PetabyteYT loading screen.",
    ],
  },
  {
    version: "v0.17.20",
    date: "2026-11-03",
    title: "Season 2 Stability & Create 6.0.10 Parity",
    highlights: [
      "Minecraft 1.21.1 on NeoForge 21.1.259 with 160 curated mods.",
      "Create 6.0.10 + Steam 'n' Rails + Create Aeronautics + Sable physics engine.",
      "FTB Chunks & FTB Teams land claiming integrated with Xaero's Map.",
    ],
  },
];

const LINKS = [
  { label: "PETABLOCKS Website", url: "https://petablocks.com", icon: Globe },
  { label: "Live World Map", url: "https://map.petablocks.com", icon: Map },
  { label: "Modpack on GitHub", url: "https://github.com/Petablocks/petablocks-modpack-s2", icon: GitHubLogo },
];

export default function News() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">News & Release Notes</h1>
        <p className="mt-1 text-sm text-pb-muted">
          Latest announcements, modpack updates, and quick links for PETABLOCKS Season 2.
        </p>
      </div>

      {/* Quick community links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {LINKS.map(({ label, url, icon: Icon }) => (
          <button
            key={url}
            onClick={() => openUrl(url).catch(() => {})}
            className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-pb-card p-4 text-left transition hover:border-pb-cyan/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-pb-cyan/15 text-pb-cyan">
                <Icon size={18} />
              </div>
              <span className="text-xs font-bold text-white">{label}</span>
            </div>
            <ExternalLink size={14} className="text-pb-muted" />
          </button>
        ))}
      </div>

      {/* Optional Community Hosting Support Banner (matching petablocks-website About page) */}
      <section className="rounded-2xl border border-[#FFDD00]/30 bg-[#FFDD00]/5 p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#FFDD00]/40 bg-[#FFDD00]/20 text-[#FFDD00]">
              <Heart size={19} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Fuel Our Community & Hosting (Optional)</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-pb-muted">
                PETABLOCKS is 100% free to play. Optional donations via Buy Me a Coffee go directly toward our dedicated MDRCloud server hosting and bandwidth costs.
              </p>
            </div>
          </div>

          <button
            onClick={() => openUrl("https://buymeacoffee.com/petabyteofficial").catch(() => {})}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[#FFDD00] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-black shadow-lg transition hover:bg-[#ffe338]"
          >
            <BuyMeACoffeeLogo size={15} />
            <span>Buy Us a Coffee</span>
            <ExternalLink size={13} />
          </button>
        </div>
      </section>

      {/* Changelog feed */}
      <div className="space-y-4">
        {UPDATES.map((rel) => (
          <article
            key={rel.version}
            className="rounded-2xl border border-white/10 bg-pb-card p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-pb-cyan/15 px-3 py-1 text-xs font-extrabold text-pb-cyan">
                  <Sparkles size={12} /> {rel.version}
                </span>
                <h2 className="text-base font-bold text-white">{rel.title}</h2>
              </div>
              <span className="text-xs text-pb-muted">{rel.date}</span>
            </div>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 text-xs text-pb-muted">
              {rel.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

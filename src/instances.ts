export interface Instance {
  id: string;
  name: string;
  serverAddress: string;
  minecraftVersion: string;
  neoforgeVersion?: string;
  loader: string;
  manifestUrl: string;
  status: "playable" | "coming_soon";
  logoImage: string;
  bgImage: string;
  description: string;
  badge?: string;
  playLabel?: string;
}

export const INSTANCES: Instance[] = [
  {
    id: "petablocks-s2",
    name: "PETABLOCKS Season 2",
    serverAddress: "s2.petablocks.com",
    minecraftVersion: "1.21.1",
    neoforgeVersion: "21.1.259",
    loader: "NeoForge 21.1.259",
    manifestUrl:
      "https://github.com/Petablocks/pb-launcher/releases/latest/download/launcher-manifest.json",
    status: "playable",
    logoImage: "/cards/logo-season2.png",
    bgImage: "/cards/bg-season2.jpg",
    description: "The official Create SMP season 2 modpack featuring train logistics, aeronautics & community industry.",
    badge: "Official Season",
    playLabel: "Play Season 2",
  },
  {
    id: "petablocks-create2",
    name: "PETABLOCKS Create 2",
    serverAddress: "create2.petablocks.com",
    minecraftVersion: "1.21.1",
    neoforgeVersion: "21.1.233",
    loader: "NeoForge 21.1.233",
    manifestUrl:
      "https://github.com/Petablocks/pb-launcher/releases/latest/download/launcher-manifest-create2.json",
    status: "coming_soon",
    logoImage: "/cards/logo-create2.png",
    bgImage: "/cards/bg-create2.jpg",
    description: "The beloved Create 2 network server. Coming soon directly to the launcher!",
    badge: "Live Server",
    playLabel: "Coming Soon",
  },
  {
    id: "petablocks-hungergames",
    name: "PETABLOCKS Hunger Games",
    serverAddress: "hg.petablocks.com",
    minecraftVersion: "1.21.1",
    loader: "Vanilla / Fabric",
    manifestUrl: "",
    status: "coming_soon",
    logoImage: "/cards/logo-hungergames.png",
    bgImage: "/cards/bg-hungergames.jpg",
    description: "Competitive custom arena PvP survival. Fight for the crown and earn network badges.",
    badge: "Spring 2027",
    playLabel: "Coming Soon",
  },
  {
    id: "petablocks-patreon",
    name: "Patreon Supporter Server",
    serverAddress: "patreon.petablocks.com",
    minecraftVersion: "1.21.1",
    loader: "NeoForge 21.1.259",
    manifestUrl: "",
    status: "coming_soon",
    logoImage: "/cards/logo-patreon.png",
    bgImage: "/cards/bg-create2.jpg",
    description: "Exclusive sandbox & development testbed server dedicated to Patreon supporters.",
    badge: "Supporters Only",
    playLabel: "Coming Soon",
  },
];

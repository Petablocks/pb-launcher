export interface Instance {
  id: string;
  name: string;
  serverAddress: string;
  minecraftVersion: string;
  neoforgeVersion: string;
  loader: string;
  manifestUrl: string;
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
      "https://github.com/Petablocks/petablocks-modpack-s2/releases/latest/download/launcher-manifest.json",
  },
];

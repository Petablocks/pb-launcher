# PETABLOCKS Launcher

**Version**: `v0.1.0` - Official Minecraft launcher for the [PETABLOCKS](https://petablocks.com) network.

Built with Tauri v2 (Rust) + React 19 + TypeScript + Tailwind CSS v4, using the official `petablocks-brand` design tokens.

## Status
Phase 1 (scaffold and branded shell) is complete. Authentication, modpack sync, Java management and game launch come in later phases.

## Season 2 instance
| Property | Value |
| --- | --- |
| Server | `s2.petablocks.com` |
| Minecraft / Loader | `1.21.1` / NeoForge `21.1.259` |
| Manifest (source of truth) | GitHub Releases of `Petablocks/petablocks-modpack-s2` (`launcher-manifest.json`) |

## Development
Requires Node 20+, Rust (stable, MSVC) and the Visual Studio C++ Build Tools.

```bash
npm install
npm run tauri dev     # run the desktop app
npm run build         # type-check and build the frontend
npm run tauri build   # build the Windows installer
```

## Roadmap
1. Scaffold and brand shell (done)
2. Microsoft device code login
3. Manifest sync from GitHub Releases
4. Java 21 and NeoForge launch engine
5. Server ping, Discord Rich Presence, screenshots, crash reports

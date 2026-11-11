# PETABLOCKS Launcher

**Version**: `v1.14.2` - Official Minecraft launcher for the [PETABLOCKS](https://petablocks.com) network.

Built with Tauri v2 (Rust) + React 19 + TypeScript + Tailwind CSS v4, using the official `petablocks-brand` design tokens.

## Status
All phases complete: frameless transparent startup splash screen with automatic update installation, **Multi-Modpack Support (Season 2 & Create 2)** with shared vanilla & NeoForge asset caching, **Decoupled Modpack Distribution (`Petablocks/pb-modpacks`)**, **Unified Active Instance Context across all launcher tabs with compact switcher pill**, **Release Update Channel selector (`Stable` vs `Staging / Pre-release`)**, Microsoft sign-in with full-body 3D skin preview and playtime tracking, **Discord Account Linking & Access Policies**, Shaders & Resource Packs manager, Adoptium Java 21 auto-installer, NeoForge launch engine, native TCP Server List Ping, Discord Rich Presence, Screenshots gallery, News, Crash Report diagnostics, and **direct in-launcher GitHub Issue & Crash Report Gateway**.

## Supported Instances
| Instance | Server | Minecraft / Loader | Manifest Distribution |
| --- | --- | --- | --- |
| **PETABLOCKS Season 2** | `s2.petablocks.com` | `1.21.1` / NeoForge `21.1.259` | `launcher-manifest.json` via `Petablocks/pb-modpacks` |
| **PETABLOCKS Create 2** | `create2.petablocks.com` | `1.21.1` / NeoForge `21.1.233` | `launcher-manifest-create2.json` via `Petablocks/pb-modpacks` |

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
2. Microsoft device code login (done)
3. Manifest sync from GitHub Releases (done)
4. Java 21 and NeoForge launch engine (done)
5. Server ping, Discord Rich Presence, screenshots, crash reports (done)


## Microsoft sign-in
Uses the Microsoft device code flow (Xbox Live, XSTS, Minecraft services) powered by the official Mojang-approved PETABLOCKS Azure Application (`acbc8721-204e-4445-8c3f-962fa445d718`). The refresh token and user profile are persisted securely in the Windows Credential Manager (OS Keyring), while the Minecraft Services session token is kept in Rust memory and cached on disk encrypted with Windows DPAPI (`session-cache.dpapi`) with rate-limit protection (`TOO_MANY_REQUESTS` resilience) and offline fallback mode.

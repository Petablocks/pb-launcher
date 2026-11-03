# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-11-03
### Changed
- **Minecraft Services Diagnostic (`src-tauri/src/auth.rs`)**:
  - Updated `finish_login` to surface the exact `api.minecraftservices.com` error message and clarify when Microsoft + Xbox Live authentication succeeded while the Azure AppID (`acbc8721-204e-4445-8c3f-962fa445d718`) is awaiting Mojang approval via `aka.ms/AppRegInfo`.

## [1.1.0] - 2026-11-03
### Added
- **Official Third-Party Brand SVGs (`src/components/BrandIcons.tsx`)**:
  - Added official vector logos from [TheSVG.org](https://thesvg.org) for **Microsoft** (4-square color mark on the Sign In button and signed-in status), **GitHub** (News repository card), **Discord** (Settings webhook section), and **Modrinth** (Mod Manager entries).
  - Codified Rule 6 in `GEMINI.md` requiring official brand SVGs from TheSVG.org for all third-party services.
- **Entra Public Client Flow Diagnostic (`src-tauri/src/auth.rs`)**:
  - Added clear guidance when Azure returns `AADSTS70002` (`The client application must be marked as 'mobile'`) explaining how to enable *Allow public client flows* in the Entra portal.

## [1.0.1] - 2026-11-03
### Fixed
- **Vite File Watcher on Windows (`vite.config.ts`)**:
  - Added `watch: { ignored: ["**/src-tauri/**"] }` to `vite.config.ts` to prevent `EBUSY: resource busy or locked` crashes on `src-tauri/target/debug/deps/pb_launcher_lib.dll` during `npm run tauri dev`.

## [1.0.0] - 2026-11-03
### Added
- **Native Minecraft Server List Ping (`src-tauri/src/ping.rs`)**:
  - Direct TCP handshake & status request (`0x00`) to `s2.petablocks.com:25565`, displaying real-time latency (`ms`), online/max player count, and MOTD on the Home card.
- **Discord Rich Presence (`src-tauri/src/community.rs`)**:
  - Lightweight native Windows Discord IPC client (`\\.\pipe\discord-ipc-0`) updating player activity when in the launcher or connected to `s2.petablocks.com`.
- **Screenshots Gallery (`src/pages/Screenshots.tsx`)**:
  - Interactive gallery reading `<instance>/screenshots/*.png` with high-res preview and one-click folder/file opening.
- **News & Release Notes (`src/pages/News.tsx`)**:
  - Release notes feed and quick community links (Website, Live World Map, Modpack Repo).
- **Crash Diagnostics & Discord Webhook Reporter (`src-tauri/src/community.rs`, `src/pages/Home.tsx`)**:
  - Automatic detection of non-zero exit codes and `<instance>/crash-reports/` logs with one-click Copy or Discord Webhook submission.
- **CI/CD Workflow (`.github/workflows/release.yml`)**:
  - GitHub Actions workflow to build and publish signed Windows NSIS installers on version tags.

## [0.4.0] - 2026-11-03
### Added
- **Adoptium Java 21 Manager (`src-tauri/src/java.rs`)**:
  - Automatic detection of Java 21+ across custom path, launcher-managed runtime, `JAVA_HOME`, and standard Windows JDK directories.
  - On-demand download and extraction of Eclipse Adoptium OpenJDK 21 JRE into `runtime/java-21/`.
- **NeoForge 21.1.259 & Minecraft 1.21.1 Launch Engine (`src-tauri/src/launch.rs`)**:
  - Enforces Mojang AppID policy: verifies online session and valid access token before spawning the game.
  - Resolves Mojang `version_manifest_v2.json`, vanilla client jar, libraries, and asset objects in parallel.
  - Runs `neoforge-21.1.259-installer.jar --installClient` automatically on first launch and builds the merged NeoForge + vanilla classpath and module args.
  - Supports `--quickPlayMultiplayer s2.petablocks.com:25565` direct connection and streams stdout/stderr logs to the UI in real time.
- **Settings Page (`src/pages/Settings.tsx`)**:
  - RAM allocation slider (`3 GB` – `16 GB`, default `6 GB`), custom `java.exe` override, JVM flags, and auto-connect toggle.

## [0.3.0] - 2026-11-03
### Added
- **Manifest & Differential Sync Engine (`src-tauri/src/sync.rs`)**:
  - Fetches `launcher-manifest.json` from GitHub Releases (with offline/local cache fallback).
  - Multi-threaded SHA-1 verified downloader (`6` concurrent streams) with live progress telemetry.
  - Extracts `overrides/` from `.mrpack` while preserving existing user `options.txt` and `servers.dat`.
  - Protected `mods/custom/` folder for player-supplied client mods that survive modpack updates.
- **Mod Manager UI (`src/pages/Mods.tsx`)**:
  - Interactive toggles for optional client mods (Voice Chat, Xaero's Minimap/World Map, 3D Skin Layers, Freecam, Zoom, etc.).
  - Search and category filtering across all 142+ Modrinth client mods plus a Custom Folder inspector with one-click Explorer launch.
- **Default Entra Application ID**:
  - Configured `acbc8721-204e-4445-8c3f-962fa445d718` as the default `PB_LAUNCHER_CLIENT_ID` in `auth.rs`.

## [0.2.0] - 2026-11-03
### Added
- Microsoft device code sign-in (Microsoft, Xbox Live, XSTS, Minecraft services) implemented in Rust, with friendly Xbox error messages and ownership check.
- Account persistence in the Windows Credential Manager, automatic silent session restore at startup, and offline fallback to the cached profile.
- Account card UI: device code display with copy/open actions, player avatar, sign out.
- `PB_LAUNCHER_CLIENT_ID` configuration for the Azure AD app registration.

## [0.1.0] - 2026-11-03
### Added
- Initial scaffold of the PETABLOCKS Launcher: Tauri v2 + React 19 + TypeScript + Tailwind CSS v4.
- PETABLOCKS brand tokens (colours, Plus Jakarta Sans typography, gradients) and official logo/icon assets from `petablocks-brand`.
- Branded custom window titlebar, sidebar navigation (Play, Mods, Screenshots, News, Settings) and Season 2 home screen (Play button disabled until sign-in is implemented).
- Season 2 instance definition: Minecraft 1.21.1, NeoForge 21.1.259, server `s2.petablocks.com`, manifest sourced from GitHub Releases of `petablocks-modpack-s2`.


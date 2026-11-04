# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-11-04
### Added
- **Frameless Transparent Startup Splash Screen (`src/components/SplashScreen.tsx`, `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`)**:
  - Dedicated transparent, always-on-top `splash` window featuring the floating PETABLOCKS stacked emblem, glowing ambient backdrop, and real-time boot progress bar.
  - Automatically checks for and installs launcher updates during the splash sequence before revealing the main window, restores the Microsoft session, and pre-verifies the Season 2 manifest, Java 21 runtime, and server status.
- **Shaders & Resource Packs Manager (`src/pages/Packs.tsx`, `src-tauri/src/sync.rs`)**:
  - New **Shaders & Packs** sidebar tab to inspect and toggle `.zip` shaderpacks (`shaderpacks/`) and resource packs (`resourcepacks/`).
  - One-click **Activate Shader** integration that directly reads and writes `shaderPack=` and `enableShaders=` in `config/iris.properties` (allowing players to switch between Complementary Reimagined, Complementary Unbound, or Shaders Off before launching).
- **Full-Body 3D Skin Preview & Session Playtime Tracking (`src/components/AccountCard.tsx`, `src/pages/Home.tsx`, `src-tauri/src/launch.rs`)**:
  - Displays the signed-in player's full-body Minecraft skin render alongside cumulative playtime (`Xh Ym played`) and session count.
- **Hide Launcher While Playing & Auto-Restore (`src-tauri/src/launch.rs`, `src/pages/Settings.tsx`)**:
  - Automatically hides the launcher window when Minecraft spawns and restores/focuses it when the game exits (configurable in Settings, enabled by default).
- **Optional Hosting Support Link (`src/App.tsx`, `src/pages/News.tsx`, `src/components/BrandIcons.tsx`)**:
  - Added the official **Buy Me a Coffee** vector logo from [TheSVG.org](https://thesvg.org) (`https://buymeacoffee.com/petabyteofficial`) in the sidebar and News page for optional community hosting support.

## [1.5.0] - 2026-11-04
### Added
- **Beta Feedback & Bug Reporting System (`src/pages/Feedback.tsx`, `src-tauri/src/community.rs`, `src/App.tsx`, `src/components/TitleBar.tsx`)**:
  - Added a dedicated **Beta Feedback** sidebar tab (`BETA` badge) and `BETA` pill in the custom window titlebar ready for select Beta testers once Mojang approves the Azure AppID.
  - Supports 4 report categories (**Bug Report**, **Crash / Freeze**, **Feature Idea**, **Beta Impression**) with automatic system & launcher diagnostics attachment (RAM allocation, Java 21 runtime detection, synced modpack version, disabled mods count, OS architecture, and launcher version).
  - Delivers structured embeds directly to the PETABLOCKS engineering Discord channel out-of-the-box (no manual webhook configuration required by players), alongside a secondary **Open GitHub Issue** shortcut.

### Changed
- **Zero-Wizard Passive Auto-Updater (`src-tauri/src/updater.rs`)**:
  - Passed `/P /R` flags to the Tauri NSIS installer when updating (`Command::new(&installer_path).args(["/P", "/R"])`), running updates in passive progress-bar-only mode (skipping all Next/Install wizard prompts) and automatically relaunching the launcher once finished.

## [1.4.0] - 2026-11-03
### Added
- **Official `Minecraft Ten` Display Font (`public/assets/fonts/minecraft-ten.ttf`, `src/index.css`)**:
  - Bundled `minecraft-ten.ttf` from `petablocks-website` and applied `Minecraft Ten` across all `h1`/`h2` headings, the `LAUNCHER` titlebar badge, the `Play` button, and the Microsoft device code display (`Inter` + `JetBrains Mono` for body and logs, matching `petablocks-website`).

## [1.3.0] - 2026-11-03
### Changed
- **Branded Titlebar (`src/components/TitleBar.tsx`, `src/index.css`)**:
  - Updated the window titlebar to display the full horizontal `PETABLOCKS` wordmark (`petablocks-logo-horizontal-256w.png`) followed by `LAUNCHER` in the official magenta-to-purple tagline gradient (`--pb-gradient-tagline`).
- **Branded Windows NSIS Installer (`src-tauri/tauri.conf.json`, `src-tauri/nsis/`)**:
  - Added custom dark-themed PETABLOCKS NSIS `header.bmp` (150×57) and `sidebar.bmp` (164×314) with the stacked logo, purple/cyan accent borders, and official `.ico` installer icon.
- **Disk Usage & Build Artifact Hygiene (`src-tauri/src/updater.rs`)**:
  - Automatically purges stale update installers in `%APPDATA%/PETABLOCKS Launcher/updates/` before downloading a new release, and cleans old `.mrpack`/`.zip`/`.exe` build artifacts on disk.

## [1.2.1] - 2026-11-03
### Fixed
- **Public GitHub Releases Manifest & Override Hosting (`src-tauri/src/sync.rs`, `src/instances.ts`)**:
  - Because `Petablocks/petablocks-modpack-s2` is a private repository (returning HTTP 404 to unauthenticated clients), attached `launcher-manifest.json` and `PETABLOCKS-Season-2-0.18.0.mrpack` to the public `Petablocks/pb-launcher` releases and updated `sync.rs` to resolve from `Petablocks/pb-launcher` releases first.

## [1.2.0] - 2026-11-03
### Added
- **In-App Auto-Updater (`src-tauri/src/updater.rs`, `src/App.tsx`)**:
  - Automatically checks `https://api.github.com/repos/Petablocks/pb-launcher/releases/latest` at startup, every 2 minutes, and on manual click of the sidebar refresh icon.
  - Displays a prominent top update banner when a newer release is published and provides one-click download + NSIS installer execution (`Update & Restart Now`).

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


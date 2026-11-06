# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.1] - 2026-11-06
### Fixed
- **Server List Ping SRV Record Resolution**:
  - Implemented automatic DNS SRV resolution (`_minecraft._tcp.<domain>`) via secure Cloudflare DNS-over-HTTPS. Resolves `s2.petablocks.com` (port 11677) and `create2.petablocks.com` (port 11681), fixing the offline status bug.
  - QuickPlay multiplayer direct-connect now passes the bare host string to Minecraft so the client natively leverages its internal SRV resolver.
- **Sidebar Menu Navigation Overflow**:
  - Widened the side navigation container (`w-56`, `shrink-0`) with graceful truncation and icon protection to prevent multi-line wrap on the "Beta Feedback" badge.
- **Create 2 Instance Specifications**:
  - Corrected loader and versions to **Minecraft 1.21.1** and **NeoForge 21.1.233**.

### Changed
- **Modpack Card Layout Polish**:
  - Removed redundant text card titles from the bottom bar since the main 3D logos already state the modpack name.
  - Replaced the word "Minecraft" with the official Minecraft Server block SVG icon.
  - Replaced the word "NeoForge" with the official NeoForge pixel fox logo icon.

## [1.9.0] - 2026-11-06
### Added
- **Multi-Modpack Split-Card Showcase Layout**:
  - Restyled home screen inspired by HaulMP with high-resolution artwork and 3D modpack logos.
  - Card 1: **PETABLOCKS Season 2** (`s2.petablocks.com`, Minecraft 1.21.1 / NeoForge 21.1.259) with live server ping, direct play action, memory settings shortcut, and collapsible live logs/crash drawer.
  - Card 2: **PETABLOCKS Create 2** (`create2.petablocks.com`, Minecraft 1.20.1 / Forge 47.3.0) with "Coming Soon" badge and live server status ping.
  - Future modpack definitions added for Hunger Games (Spring 2027) and Patreon Supporter Server.
- **Bottom News & Announcements Ticker**:
  - Added live ticker banner along the launcher footer highlighting new modpack releases and updates.
- **Enlarged Launcher Viewport**:
  - Adjusted default window dimensions to 1200x760 (minimum 980x640) for comfortable multi-pack browsing and side-by-side card viewing.

## [1.8.6] - 2026-11-06
### Security
- Prevented zip-slip in modpack override extraction; restricted updater installs to this repository's GitHub releases.
- Removed the hardcoded Discord webhook (now injected at build time).
- Verified Java runtime (SHA-256) and NeoForge installer (SHA-1) downloads; rejected path-escaping instance ids and pack filenames.

### Fixed
- Launcher no longer signs the user out on transient network/Xbox/Minecraft services errors.
- Failed modpack override downloads are retried on the next sync instead of being marked installed.
- Fixed Discord crash/feedback reports failing with HTTP 400 (embed field length limit).
- Fixed "launcher already running" lockups: added single-instance guard, moved Discord Rich Presence off the main/async threads, and reveal the window if the splash stalls.
- Java detection and game logs now use `java.exe` with `CREATE_NO_WINDOW` (still no console window).
- Memory settings: `-Xms` can no longer exceed `-Xmx`, and RAM is capped at 75% of system memory.
- Mod downloads and game files retry, verify hashes and are written atomically; stale mods are backed up to `mods/_removed`.

### Changed
- Screenshots gallery loads images lazily instead of embedding every PNG as base64.
- CI checks version consistency, typechecks and runs tests before building a release.

## [1.8.5] - 2026-11-06
### Fixed
- **Suppressed Java Console Window (`src-tauri/src/launch.rs`, `src-tauri/src/java.rs`)**:
  - Prefer `javaw.exe` over `java.exe` on Windows when locating the Java 21 runtime.
  - Applied `CREATE_NO_WINDOW` (0x08000000) process creation flag directly to the spawned Minecraft / NeoForge process, preventing Windows Terminal / Eclipse Adoptium console windows from staying open in the background while playing.

## [1.8.4] - 2026-11-05
### Fixed
- **Bundled Override Mods Preservation (`src-tauri/src/sync.rs`)**:
  - Prevented bundled mods from being purged during `cleanup_stale_mods()`. Bundled jars without external CDN URLs (`kotlinforforge-5.12.0-all.jar`, FTB, KubeJS) are now recognized as managed manifest entries and ignored by the HTTP downloader queue.
- **Launcher Window Lifecycle & Resilience (`src-tauri/src/launch.rs`)**:
  - Changed window minimize behavior on game launch: window minimizes rather than hiding completely, ensuring the taskbar entry remains accessible and restores automatically with focus even if Minecraft terminates abruptly in early JVM startup.

## [1.8.3] - 2026-11-05
### Fixed
- **Windows Credential Manager Character Limit Resolution (`src-tauri/src/auth.rs`)**:
  - Resolved `Attribute 'password encoded as UTF-16' is longer than platform limit of 2560 chars` error on Windows.
  - Windows Credential Manager (`CredWriteW`) limits credential blobs to 5120 bytes (2560 UTF-16 code units). Large Minecraft Services JWT access tokens (~1.5 KB) serialized into the credential store previously exceeded this boundary.
  - Decoupled token storage: the OS Keyring now strictly stores the lightweight OAuth refresh token and user profile (<250 bytes), while the ephemeral Minecraft services session token is safely cached in `session-cache.json` in the user's launcher directory.
  - Full automatic cleanup on `logout()`.

## [1.8.2] - 2026-11-05
### Fixed
- **Minecraft Authentication Rate-Limiting Protection (`TOO_MANY_REQUESTS`)**:
  - Implemented token reuse caching in the OS credential store (`StoredAccount`). Minecraft tokens are valid for up to 24 hours; the launcher now reuses the valid token across launcher restarts and self-updates without hitting Mojang's authentication endpoints on every launch.
  - Added graceful fallback in `restore()`: if Mojang temporarily returns `TOO_MANY_REQUESTS`, the launcher seamlessly falls back to the active cached token and player profile rather than kicking the player out.

## [1.8.1] - 2026-11-05
### Fixed
- **Discord Rich Presence Process Binding & Heartbeat (`src-tauri/src/community.rs`, `src-tauri/src/launch.rs`)**:
  - Attached Discord Rich Presence directly to Minecraft's spawned process ID (`child.id()`) instead of the launcher GUI PID, ensuring Discord associates the presence activity with the actual Minecraft game window.
  - Added a persistent 15-second heartbeat loop over `\\.\pipe\discord-ipc-*` so Discord maintains continuous presence without dropping or reverting to generic fallback boxes.
  - Included application rich asset keys (`petablocks_logo` & `minecraft`) and session start timestamps.

## [1.8.0] - 2026-11-05
### Added
- **Game Memory & JVM Tuning Profiles (`src/pages/Settings.tsx`, `src-tauri/src/settings.rs`)**:
  - Introduced one-click performance presets tailored for Minecraft 1.21.1 and complex Create mod contraptions:
    - **Eco (6 GB)**: Optimized for 8GB–12GB RAM systems with low background footprint and optimized G1GC.
    - **Standard (8 GB - Recommended)**: Default profile with `-XX:+AlwaysPreTouch` and parallel ref processing for smooth chunk loading.
    - **Enthusiast (12 GB - Generational ZGC)**: Advanced Java 21 Generational ZGC flags (`-XX:+UseZGC -XX:+ZGenerational`) providing sub-millisecond GC pauses and zero frame drops on high-spec hardware.
  - Preserved continuous manual slider and custom argument input for power users.
- **Live Online Player Heads Display (`src/pages/Home.tsx`, `src-tauri/src/ping.rs`)**:
  - Extended Server List Ping (SLP) parser to capture active player samples and render live avatar heads alongside the online player counter.
- **Enhanced Background Self-Updater Pipeline (`src/components/SplashScreen.tsx`, `src/App.tsx`, `src-tauri/src/updater.rs`)**:
  - Silent startup checks and in-app top banner for instant, seamless 1-click update installations.

## [1.7.4] - 2026-11-05
### Fixed
- **Resolved Java Module Resolution Collision (`ResolutionException`)**:
  - Removed vanilla client jar (`1.21.1.jar`) from the classpath when launching NeoForge. NeoForge's production client provider supplies the SRG/patched client (`client-1.21.1-20240808.144430-srg.jar`), defining module `minecraft`. Appending `1.21.1.jar` caused Java to load `1.21.1.jar` as automatic module `_1._21._1`, triggering a fatal `ResolutionException: Modules minecraft and _1._21._1 export package com.mojang.blaze3d.platform to module placebo`.
- **Automatic Stale Mod Cleanup**:
  - Added `cleanup_stale_mods()` to the sync pipeline. When syncing modpack versions, older/duplicate `.jar` files from prior modpack iterations (e.g., older `collective`, `emi_loot`, or `moonlight` jars) are automatically pruned from `mods/` while preserving player custom mods in `mods/custom/`.

## [1.7.3] - 2026-11-05
### Added
- **One-Click Copy All Logs**: Added a dedicated **Copy All Logs** button in the Live Game Output header so full logs can be copied directly to clipboard with a single click.
- **Enabled Text Selection in Game Output**: Enabled browser text selection (`select-text`) inside the log terminal viewer.
- **Expanded Log History**: Increased retained live log buffer to 1,000 lines.
- **Season 2 v0.19.0 Modpack Sync**: Bundled updated Season 2 `PETABLOCKS-Season-2-0.19.0.mrpack` archive.

## [1.7.2] - 2026-11-05
### Fixed
- **Player Skin Rendering**: Migrated avatar and 3D body skin rendering from Minotar to Crafthead (`https://crafthead.net/armor/body/<uuid>`) for reliable full custom skin and overlay rendering.
- **Process Spawning & Console Cleanup**: Added Windows `CREATE_NO_WINDOW` (0x08000000) flags to Java probing and the NeoForge installer commands so console windows no longer flash on screen during startup.
- **Diagnostics & Error Visibility**: Added persistent logging to `launcher-game.log` in the instance directory. When the game process exits unexpectedly with a non-zero exit code, the launcher automatically opens the live **Game Logs** terminal and displays a diagnostic banner.

## [1.7.1] - 2026-11-05
### Changed
- **Mojang Production Approval Transition**:
  - Confirmed official Mojang application approval for Client ID `acbc8721-204e-4445-8c3f-962fa445d718`.
  - Updated error handling in `src-tauri/src/auth.rs` and status labels in `src/pages/Feedback.tsx` to reflect active production authorization status with Mojang and Xbox Live services.
  - Updated documentation in `README.md`.

## [1.7.0] - 2026-11-04
### Added
- **In-Launcher Discord Account Linking & Closed Beta Role Gate (`src/components/AccountCard.tsx`, `src/pages/Home.tsx`, `src-tauri/src/community.rs`)**:
  - Automatically queries the PETABLOCKS Central Identity Engine (`https://my.petablocks.com/api/public/launcher/status/:uuid`) once signed in with Microsoft to verify whether the player's Minecraft UUID is linked to a Discord account and in the official PETABLOCKS Discord server.
  - Displays the player's linked Discord handle (`@username`), network rank badge (`Player`, `VIP`, `MVP`, `Admin`, `Owner`), and `Beta Verified` pill on the Account Card.
  - Provides **two zero-friction ways to link Discord directly from the launcher** (without needing to launch Minecraft first):
    1. **One-Click Link via Browser**: Opens `my.petablocks.com/api/public/oauth/discord` with the player's verified Minecraft UUID & IGN pre-attached and auto-polls every 8 seconds until linking completes.
    2. **Get `/link` Code**: Generates a 15-minute `PB-XXXX` code directly inside the launcher (`POST /api/public/launcher/link-code`) with one-click copy for `/link code:PB-XXXX` in the PETABLOCKS Discord (`pb-bot`), which also awards the 32x Diamonds bonus on Season 2.
  - Enforces the Closed Beta Discord gate on the **Play** button until both Microsoft sign-in and Discord server membership are verified.

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


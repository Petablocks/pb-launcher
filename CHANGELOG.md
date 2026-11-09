# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.13.1] - 2026-11-09
### Fixed
- **Modpack Overrides Extraction on Empty Files**:
  - Fixed an issue where extracting `.mrpack` archives failed on 0-byte override files (such as `overrides/config/xaeropatreon.txt`), causing the `zip` crate to return `Invalid checksum` and silently aborting modpack overrides unpacking.
  - Ensured all KubeJS scripts, custom items, and block registries unpack cleanly into instances.
  - Made override extraction failures return explicit error dialogs rather than failing silently with outdated version states.

## [1.13.0] - 2026-11-09
### Added
- **Multi-Modpack Support (PETABLOCKS Create 2)**:
  - Enabled **PETABLOCKS Create 2** (`create2.petablocks.com` / NeoForge 21.1.233 / MC 1.21.1) as a playable instance alongside Season 2.
  - Added dedicated authoring repository `Petablocks/petablocks-modpack-create2` and decoupled public distribution stream `Petablocks/pb-modpacks`.
  - Added instance sandboxing: per-instance isolation for `mods/`, `config/`, `shaderpacks/`, `resourcepacks/`, `screenshots/`, and `options.txt`.
- **Unified Active Instance Context & Compact Switcher Pill**:
  - Lifted active instance selection to top-level app state, automatically synchronizing across all tabs (**Play**, **Mods**, **Shaders & Resource Packs**, **Screenshots**, **Feedback**, and **Settings**).
  - Added a compact instance switcher pill to tab headers so players can switch packs with a single click from any tab.
  - Dynamically wired **Feedback** and **Crash Reports** to route bug reports to their respective modpack repository (`petablocks-modpack-s2` or `petablocks-modpack-create2`).
- **Per-Instance Access Policies**:
  - Added `accessPolicy` tiers (`public`, `discord_linked`, `beta_role`, `patreon_role`) in `src/instances.ts`.
  - Dynamically configured direct connect server descriptions in Settings based on the currently selected instance.

## [1.12.1] - 2026-11-09
### Changed
- **Authenticated Discord Account Linking**:
  - Updated in-launcher Discord account linking and status checks to authenticate with your active verified Minecraft session before generating a link code or opening the one-click browser link.

## [1.12.0] - 2026-11-08
### Added
- **Release Update Channel Selector (`Stable` vs `Staging / Pre-release`)**:
  - Added a **Release Update Channel** setting in **Launcher Settings** allowing you to switch between **Stable (Default)** and **Staging / Pre-release**.
  - Players on **Stable** only receive verified full releases, while machines opted into **Staging** automatically detect and install staged pre-release builds (`-rc.1`, `-beta.1`, or GitHub Pre-releases) for both the launcher and the Season 2 modpack.
  - Added a `STAGING` indicator badge in the sidebar version footer and Settings when opted into the staging channel.

## [1.11.1] - 2026-11-08
### Fixed
- **Shaders, Resource Packs, Screenshots & Instance Folder Opening**:
  - Fixed an issue where clicking **Open `shaderpacks`**, **Open `resourcepacks`**, **Open Screenshots Folder**, **Open Custom Mods Folder**, or **Open Instance Folder** showed a path permission error after migrating to Local AppData.
  - Enabled native Explorer folder and screenshot file opening directly from the launcher backend.
- **Shaderpacks & Screenshots Data Migration**:
  - Improved the Local AppData migration to automatically merge any remaining files, screenshots, or shaderpacks from Roaming AppData if both folders existed during an update.
  - Automatically restores bundled shaderpacks and configs during sync if the `shaderpacks` folder is empty.

## [1.11.0] - 2026-11-08
### Added
- **Streaming Downloader & Slow-Connection Resilience**:
  - Upgraded modpack, Java 21, and game asset downloads to stream directly to disk with per-chunk read timeouts so large files download reliably even on slower internet connections.
  - Added SHA-256 and SHA-512 integrity verification for modpack files and updates.
- **Crash-Safe Settings & Playtime Saving**:
  - All launcher settings, disabled mod preferences, and playtime counters now save atomically so unexpected PC restarts or power loss never reset your settings or playtime.
- **Automatic Local Data Migration**:
  - Automatically migrates launcher instances and game files to Windows Local AppData for faster disk performance and cleaner Windows profile behavior.

### Changed
- **Faster, Smoother UI & Discord Rich Presence**:
  - Moved Java detection, file checks, and Discord Rich Presence onto dedicated background workers so dragging, minimizing, and navigating the launcher stays responsive at all times.
  - Added a safeguard preventing the launcher window from closing accidentally while a modpack update is actively downloading.
- **Enhanced Account & Privacy Protection**:
  - Encrypted cached sign-in sessions using Windows Data Protection (DPAPI) and automatically scrubbed local Windows folder paths from crash report excerpts.

### Fixed
- **Java 21+ Detection Improvements**:
  - Improved Java version detection to support all JDK 21+ releases (including GA builds and newer major versions) across custom and system installation folders.
- **Multi-Instance Sync Isolation**:
  - Added per-instance launch and sync guards so two instances or downloads can never conflict simultaneously.

## [1.10.1] - 2026-11-08
### Added
- **Live Playtime & Session Counter Across Cards & Sidebar**:
  - Restored per-modpack playtime and session counters directly in the footer of playable modpack cards (`⏱ Xh Ym (N sessions)`).
  - Restored cumulative playtime and session count on the sidebar Account Pill and inside the Account Profile modal.
  - Added live 15-second periodic playtime saving while Minecraft is open so progress is continuously recorded.
- **Dynamic Tabbed News & Release Notes Feed**:
  - Upgraded the **News** page with three dedicated tabs: **Announcements**, **Launcher Updates**, and live **Season 2 Modpack** patch notes.

### Changed
- **Sidebar Feedback Navigation Polish**:
  - Shortened the sidebar menu label from `Beta Feedback` to `Feedback` and removed the duplicate `BETA` badge so it fits cleanly without truncation.
- **Player-Safe Release Notes Formatting**:
  - Formatted in-app release notes into clean visual cards and scrubbed internal paths, build scripts, and infrastructure details from player-facing changelogs.

## [1.10.0] - 2026-11-08
### Added
- **Direct GitHub Issue & Crash Report Integration**:
  - Linked in-launcher Bug Reports, Crash Reports, and Feature Ideas directly to GitHub Issues.
  - Added a **Report Target** selector in the Feedback tab so players can choose between **PETABLOCKS Launcher** (`Petablocks/pb-launcher`) and **PETABLOCKS Season 2 Modpack** (`Petablocks/petablocks-modpack-s2`), automatically routing modpack bugs and crashes to their respective repository.
  - Displays the created GitHub Issue number (`Issue #XX`) and a one-click **View Issue** button right inside the launcher after submission.

## [1.9.6] - 2026-11-07
### Fixed
- **Release Notes Loading**:
  - Routed modpack changelog fetching through the native launcher downloader so the in-launcher release notes modal loads reliably.

## [1.9.5] - 2026-11-07
### Added
- **Modpack Update Notifications & Banner**:
  - Added real-time modpack update detection comparing the locally installed manifest version to the latest remote release manifest.
  - Added an animated glowing `Update v<version>` pill badge to modpack cards when a newer pack release is ready.
  - Added a dedicated modpack update notification banner directly above the progress bar with version comparison (`v0.21.0` vs installed `v0.20.1`).
  - Added quick **Changelog** inspection button and modal to review all patch notes and changes before updating.
  - Added **Update & Play** / **Update** one-click synchronization buttons.

## [1.9.4] - 2026-11-06
### Changed
- **Hunger Games Card Specifications**:
  - Updated Minecraft version to **Latest** and server software to **Paper**.
  - Added official PaperMC logo icon (`/cards/paper-icon.png`) for the Hunger Games card footer.

## [1.9.3] - 2026-11-06
### Added
- **Hunger Games Arena Artwork**:
  - Integrated custom aerial arena screenshot (`bg-hungergames.jpg`) for the PETABLOCKS Hunger Games card.

## [1.9.2] - 2026-11-06
### Added
- **2x2 Multi-Instance Modpack Grid**:
  - Expanded the Play page to display all 4 modpack instances simultaneously in a balanced 2x2 grid:
    1. **PETABLOCKS Season 2** (`s2.petablocks.com` - Playable now)
    2. **PETABLOCKS Create 2** (`create2.petablocks.com` - Coming Soon)
    3. **PETABLOCKS Hunger Games** (`hg.petablocks.com` - Spring 2027)
    4. **Patreon Supporter Server** (`patreon.petablocks.com` - Supporters Only)
- **Compact Sidebar Account Pill & Modal**:
  - Relocated the Account & Closed Beta verification widget from the Play page into a sleek, compact user pill at the bottom of the sidebar.
  - Clicking the pill opens a dedicated profile modal with full-body skin details, Discord Closed Beta linking tools, and sign-out controls, freeing up the entire main area for modpack cards.

## [1.9.1] - 2026-11-06
### Fixed
- **Server Status & Direct Connect SRV Resolution**:
  - Added automatic DNS SRV resolution for `s2.petablocks.com` and `create2.petablocks.com`, fixing the offline server status indicator and direct-connect support.
- **Sidebar Menu Navigation Overflow**:
  - Widened the side navigation container with graceful truncation and icon protection.
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
### Fixed
- Launcher no longer signs the user out on transient network/Xbox/Minecraft services errors.
- Failed modpack override downloads are retried on the next sync instead of being marked installed.
- Fixed crash and feedback reports when submitting long log excerpts.
- Fixed "launcher already running" lockups with single-instance window focus and non-blocking Discord Rich Presence.
- Memory settings: `-Xms` can no longer exceed `-Xmx`, and RAM allocation is capped safely at 75% of system memory.
- Mod downloads and game files retry automatically and verify file integrity; obsolete mods are backed up to `mods/_removed`.

### Changed
- Screenshots gallery loads images lazily for faster browsing.

## [1.8.5] - 2026-11-06
### Fixed
- **Suppressed Background Java Console Window**:
  - Prevented extra console windows from staying open in the background while Minecraft is running.

## [1.8.4] - 2026-11-05
### Fixed
- **Bundled Override Mods Preservation**:
  - Ensured bundled modpack jars are preserved during modpack updates and cleanup.
- **Launcher Window Lifecycle & Resilience**:
  - Launcher window minimizes to the taskbar on game launch and restores automatically with focus when Minecraft closes.

## [1.8.3] - 2026-11-05
### Fixed
- **Session Persistence on Windows**:
  - Resolved an issue where large session tokens could fail to save on Windows, ensuring players stay signed in across launcher restarts.

## [1.8.2] - 2026-11-05
### Fixed
- **Faster Startup Sign-In Restore**:
  - Reuses active Minecraft sessions across launcher restarts and updates for faster startup and reliability.

## [1.8.1] - 2026-11-05
### Fixed
- **Discord Rich Presence Stability**:
  - Attached Discord Rich Presence directly to the active Minecraft game session with a continuous heartbeat so presence never drops while playing.

## [1.8.0] - 2026-11-05
### Added
- **Game Memory & JVM Tuning Profiles**:
  - Introduced one-click performance presets tailored for Minecraft 1.21.1 and complex Create mod contraptions:
    - **Eco (6 GB)**: Optimized for 8GB–12GB RAM systems with low background footprint.
    - **Standard (8 GB - Recommended)**: Default profile for smooth chunk loading.
    - **Enthusiast (12 GB - Generational ZGC)**: Advanced Java 21 Generational ZGC flags providing sub-millisecond GC pauses on high-spec hardware.
  - Preserved continuous manual slider and custom argument input for power users.
- **Live Online Player Heads Display**:
  - Displays live online player avatars alongside the online player counter.
- **Enhanced Background Self-Updater**:
  - Silent startup checks and in-app top banner for 1-click update installations.

## [1.7.4] - 2026-11-05
### Fixed
- **Resolved NeoForge Launch Classpath Conflict**:
  - Fixed a module conflict when launching NeoForge 1.21.1.
- **Automatic Stale Mod Cleanup**:
  - Older or duplicate mod `.jar` files from prior modpack releases are automatically cleaned up while preserving player custom mods in `mods/custom/`.

## [1.7.3] - 2026-11-05
### Added
- **One-Click Copy All Logs**: Added a dedicated **Copy All Logs** button in the Live Game Output header.
- **Enabled Text Selection in Game Output**: Enabled text selection inside the log terminal viewer.
- **Expanded Log History**: Increased retained live log buffer to 1,000 lines.
- **Season 2 v0.19.0 Modpack Sync**: Updated to Season 2 `v0.19.0`.

## [1.7.2] - 2026-11-05
### Fixed
- **Player Skin Rendering**: Improved 3D body skin and overlay rendering reliability.
- **Startup Polish**: Prevented brief console window flashes when detecting Java or installing NeoForge.
- **Diagnostics & Error Visibility**: Automatically opens the **Game Logs** drawer if the game exits unexpectedly.

## [1.7.1] - 2026-11-05
### Changed
- **Microsoft & Minecraft Sign-In Ready**:
  - Enabled production Microsoft and Minecraft Java Edition account verification.

## [1.7.0] - 2026-11-04
### Added
- **In-Launcher Discord Account Linking & Closed Beta Access**:
  - Verifies whether your Minecraft account is linked to Discord and in the official PETABLOCKS Discord server.
  - Displays your linked Discord handle (`@username`), network rank badge, and `Beta Verified` status.
  - Provides **two easy ways to link Discord directly from the launcher**:
    1. **One-Click Link via Browser**: Link your verified Minecraft profile with Discord in one click.
    2. **Get `/link` Code**: Generate a `/link` code directly inside the launcher to claim your **32x Diamonds** reward on Season 2.

## [1.6.0] - 2026-11-04
### Added
- **Frameless Transparent Startup Splash Screen**:
  - Dedicated transparent startup splash window with animated PETABLOCKS emblem and live boot progress bar.
  - Automatically checks for launcher updates, restores your Microsoft session, and pre-verifies the Season 2 manifest and Java 21 runtime.
- **Shaders & Resource Packs Manager**:
  - New **Shaders & Packs** sidebar tab to inspect, toggle, and activate shaderpacks (Complementary Reimagined, Complementary Unbound, or Shaders Off) and resource packs before launching.
- **Full-Body 3D Skin Preview & Session Playtime Tracking**:
  - Displays your Minecraft skin render alongside cumulative playtime and session count.
- **Minimize Launcher While Playing & Auto-Restore**:
  - Automatically minimizes the launcher when Minecraft starts and restores it when the game exits (configurable in Settings).
- **Optional Hosting Support Link**:
  - Added an optional **Buy Me a Coffee** link in the sidebar and News page to help support community server hosting.

## [1.5.0] - 2026-11-04
### Added
- **Feedback & Bug Reporting System**:
  - Added a dedicated **Feedback** sidebar tab supporting **Bug Reports**, **Crash / Freeze**, **Feature Ideas**, and **Beta Impressions** with optional system diagnostics.

### Changed
- **Seamless Auto-Updater**:
  - Launcher updates now install automatically in progress-bar mode and relaunch without manual wizard prompts.

## [1.4.0] - 2026-11-03
### Added
- **Official `Minecraft Ten` Display Font**:
  - Applied `Minecraft Ten` across headings, the `LAUNCHER` titlebar badge, and the `Play` button.

## [1.3.0] - 2026-11-03
### Changed
- **Branded Titlebar & Windows Installer**:
  - Updated the window titlebar with the full horizontal `PETABLOCKS` wordmark and `LAUNCHER` tagline gradient, plus custom dark-themed Windows installer artwork.

## [1.2.0] - 2026-11-03
### Added
- **In-App Auto-Updater**:
  - Automatically checks for new launcher releases and provides one-click `Update & Restart Now`.

## [1.1.0] - 2026-11-03
### Added
- **Official Service Icons**:
  - Added official vector logos for Microsoft, GitHub, Discord, and Modrinth across the launcher UI.

## [1.0.0] - 2026-11-03
### Added
- **Live Server Status**:
  - Real-time online/max player count and latency indicator on the Play screen.
- **Discord Rich Presence**:
  - Displays your current PETABLOCKS Launcher and Season 2 activity on Discord.
- **Screenshots Gallery**:
  - Built-in gallery to view and open your Minecraft screenshots.
- **News & Release Notes**:
  - In-app announcements, release notes, and quick community links.
- **Crash Diagnostics & One-Click Reporting**:
  - Automatic detection of game crashes with one-click crash report submission.
- **Automatic Java 21 & NeoForge Setup**:
  - Automatically downloads and configures Java 21 and NeoForge 21.1.259 for Minecraft 1.21.1.
- **Mod Manager**:
  - Toggle optional client QoL mods (Simple Voice Chat, Xaero's Minimap/World Map, 3D Skin Layers, Freecam, Zoom, Sound Muffler) and manage `mods/custom/`.


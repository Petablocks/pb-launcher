# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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


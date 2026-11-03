# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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


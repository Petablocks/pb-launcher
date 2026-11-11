# PETABLOCKS Launcher

**Version**: `v1.17.0` - Official Minecraft launcher for the [PETABLOCKS](https://petablocks.com) network.

Built with Tauri v2 (Rust) + React 19 + TypeScript + Tailwind CSS v4, using the official `petablocks-brand` design tokens.

## Status
All phases complete: frameless transparent startup splash screen with automatic update installation, **Multi-Modpack Support (Season 2 & Create 2)** with shared vanilla & NeoForge asset caching, **Decoupled Modpack Distribution (`Petablocks/pb-modpacks`)**, **Unified Active Instance Context across all launcher tabs with compact switcher pill**, **Release Update Channel selector (`Stable` vs `Staging / Pre-release`)**, Microsoft sign-in with full-body 3D skin preview and playtime tracking, **Discord Account Linking & Access Policies**, Shaders & Resource Packs manager, Adoptium Java 21 auto-installer, NeoForge launch engine, native TCP Server List Ping, Discord Rich Presence, Screenshots gallery, News, Crash Report diagnostics, and **direct in-launcher GitHub Issue & Crash Report Gateway**.

## Supported Instances
| Instance | Server | Minecraft / Loader | Manifest Distribution |
| --- | --- | --- | --- |
| **PETABLOCKS Season 2** | `s2.petablocks.com` | `1.21.1` / NeoForge `21.1.259` | `launcher-manifest.json` via `Petablocks/pb-modpacks` |
| **PETABLOCKS Create 2** | `create2.petablocks.com` | `1.21.1` / NeoForge `21.1.233` | `launcher-manifest-create2.json` via `Petablocks/pb-modpacks` |

## Architecture
| Area | Location | Notes |
| --- | --- | --- |
| Launcher state | `src/state/` | `LauncherProvider` holds session, per-instance runtime, settings and updates; `logStore` holds game output; `access` resolves why an instance cannot be launched. |
| UI primitives | `src/components/ui/` | Button, Modal, Alert, Badge, Switch, SegmentedControl, Card / page layout. Use these instead of ad-hoc class strings. |
| Pages | `src/pages/`, `src/pages/play/` | One file per tab; the Play tab is split into focused components. |
| Backend commands | `src-tauri/src/lib.rs` | Thin `#[tauri::command]` wrappers. |
| Sync engine | `src-tauri/src/sync/` | `download` (allowlist + verified streaming), `manifest`, `state`, `packs`, `paths`; `mod.rs` orchestrates a sync. |
| Launch engine | `src-tauri/src/launch.rs` | Vanilla + NeoForge setup, process lifecycle, playtime, batched logs. |
| Events | `src-tauri/src/events.rs` | Typed, instance-tagged payloads for `launch-status`, `game-state`, `game-log`. |

## Launcher config
`launcher-config.json` (repo root) defines the instances shown on the Play tab, the footer headline and the News announcements. The launcher fetches it from the `master` branch at startup, validates it, caches it, and falls back to the copy compiled into the build when it cannot be reached. Editing the file on `master` therefore changes every installed launcher without a release.

Validation is strict: server addresses must be `*.petablocks.com`, manifest and changelog URLs must be on the download allowlist, artwork must be a bundled `/cards/...` file or hosted on `*.petablocks.com` / this GitHub organisation, and version strings must be plain tokens. Invalid instances are dropped and logged to `launcher.log`. Instances without `"accessPolicy": "public"` require a linked Discord account.

## Development
Requires Node 20+, Rust (stable, MSVC) and the Visual Studio C++ Build Tools.

```bash
npm install
npm run tauri dev     # run the desktop app
npm run build         # type-check and build the frontend
npm run tauri build   # build the Windows installer
```

## Checks
```bash
npm run typecheck     # tsc
npm run lint          # eslint
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```
The same checks run on every pull request (`.github/workflows/ci.yml`).

## Release signing
Both kinds of signing are optional and switch on when their settings exist in the repository.

**Installer (Authenticode, removes the SmartScreen warning)** — add the secrets `WINDOWS_CERTIFICATE` (base64 of the `.pfx`) and `WINDOWS_CERTIFICATE_PASSWORD`.

**In-app updates (Ed25519)** — generate a key pair once and keep the private key out of the repository:
```bash
openssl genpkey -algorithm ed25519 -out update-signing-key.pem
openssl pkey -in update-signing-key.pem -pubout -outform DER | tail -c 32 | base64
```
Store the PEM file's contents as the secret `PB_UPDATE_SIGNING_KEY` and the printed public key as the repository variable `PB_UPDATE_PUBLIC_KEY`. From then on each release uploads `<installer>.sig`, and launchers built with the public key refuse an update without a valid signature. Launchers built before the key existed keep verifying by SHA-256 only, so the first signed release rolls out normally.

## Roadmap
1. Scaffold and brand shell (done)
2. Microsoft device code login (done)
3. Manifest sync from GitHub Releases (done)
4. Java 21 and NeoForge launch engine (done)
5. Server ping, Discord Rich Presence, screenshots, crash reports (done)


## Microsoft sign-in
Uses the Microsoft device code flow (Xbox Live, XSTS, Minecraft services) powered by the official Mojang-approved PETABLOCKS Azure Application (`acbc8721-204e-4445-8c3f-962fa445d718`). The refresh token and user profile are persisted securely in the Windows Credential Manager (OS Keyring), while the Minecraft Services session token is kept in Rust memory and cached on disk encrypted with Windows DPAPI (`session-cache.dpapi`) with rate-limit protection (`TOO_MANY_REQUESTS` resilience) and offline fallback mode.

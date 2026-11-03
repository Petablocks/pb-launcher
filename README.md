# PETABLOCKS Launcher

**Version**: `v0.4.0` - Official Minecraft launcher for the [PETABLOCKS](https://petablocks.com) network.

Built with Tauri v2 (Rust) + React 19 + TypeScript + Tailwind CSS v4, using the official `petablocks-brand` design tokens.

## Status
Phases 1-4 (scaffold, branded shell, Microsoft sign-in, GitHub Releases manifest sync engine, Adoptium Java 21 auto-installer, and NeoForge 21.1.259 launch engine) are complete. Server ping, Discord Rich Presence, screenshots gallery, and crash reporting arrive in Phase 5.

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
2. Microsoft device code login (done)
3. Manifest sync from GitHub Releases (done)
4. Java 21 and NeoForge launch engine (done)
5. Server ping, Discord Rich Presence, screenshots, crash reports


## Microsoft sign-in
Uses the Microsoft device code flow (Xbox Live, XSTS, Minecraft services). The refresh token and cached profile are stored in the Windows Credential Manager; if the network is unavailable the cached account is shown in offline mode.

Requires an Azure AD app registration (public client, "Personal Microsoft accounts only", device code flow enabled). Provide its Application (client) ID via the `PB_LAUNCHER_CLIENT_ID` environment variable at runtime or build time:

```powershell
$env:PB_LAUNCHER_CLIENT_ID = "<client-id>"; npm run tauri dev
```

Note: Minecraft services only accept tokens from approved Azure apps; see https://aka.ms/AppRegInfo to request access.

# Antigravity Global Rules — PETABLOCKS Engineering Standards

## Mandatory Project Maintenance on Every Change

Whenever making changes to any application, service, repository, or component in this workspace (regardless of the session or task type), you **MUST** ensure the following three areas are strictly updated before completing the task:

---

### 1. Semantic Version Bumping (`package.json` & Version Identifiers)
* **Rule**: Every functional change, feature, refactor, UI polish, or bug fix must bump the project version following [Semantic Versioning 2.0.0](https://semver.org/):
  - **PATCH (`x.y.Z`)**: Bug fixes, minor styling tweaks, typo corrections, internal optimizations.
  - **MINOR (`x.Y.0`)**: New features, new pages, new endpoints, new integrations, architectural enhancements.
  - **MAJOR (`X.0.0`)**: Breaking API changes, complete redesigns, major architectural overhauls.
* **Synchronization**:
  - Update `version` in `package.json` (and `backend/package.json` / `version.json` where applicable).
  - Update any user-facing version badges (e.g. `src/components/Footer.tsx`, UI footers, or environment displays).

---

### 2. Changelog Maintenance (`CHANGELOG.md` & In-App Changelog)
* **Rule**: Document every change in `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
* **Format**:
  ```markdown
  ## [x.y.z] - YYYY-MM-DD
  ### Added
  - Description of newly added features or endpoints.

  ### Changed
  - Description of modified workflows, UI updates, or data models.

  ### Fixed
  - Description of resolved bugs, crash fixes, or security patches.

  ### Infrastructure
  - Description of deployment, reverse proxy, Caddy, or container changes.
  ```
* **In-App Changelog Sync**: If the repository includes an in-app changelog or release notes page (e.g., `src/pages/ChangelogPage.tsx`), add the new release entry to keep the UI synchronized with `CHANGELOG.md`.

---

### 3. Documentation & README Maintenance (`README.md`)
* **Rule**: Keep `README.md` synchronized and accurate:
  - Update the version badge / text in the header of `README.md`.
  - Add or update descriptions for new features, endpoints, CLI scripts, or configuration options.
  - Ensure all service URLs, ports, and architecture diagrams match reality.

---

### 4. Build & Test Verification Before Commit
* Always verify that code builds cleanly with zero errors before committing:
  - Frontend: `npm run build` (`tsc -b && vite build`)
  - Backend/Microservices: Syntax validation / lint check (`npm test` or `npm run lint` where applicable)

---

## 5. Cloudflare & Wrangler Execution Rules
- **NEVER** run `wrangler login` or `wrangler logout`.
- Before running any `wrangler` command, verify the active account by running `npx wrangler whoami` or checking `account_id` in `wrangler.toml` / `wrangler.jsonc`.
- Always execute wrangler commands from within the target service's directory (or pass `--config <path>/wrangler.toml` and `--profile <profile-name>`) so directory-bound credentials and `account_id` are respected.

---

## 6. Third-Party Brand Icons & Logos (`TheSVG.org`)
- Whenever referencing or displaying third-party services (e.g., **Microsoft**, **GitHub**, **Discord**, **Modrinth**, **CurseForge**, **Adoptium**, **Cloudflare**), **ALWAYS** use their official brand SVG vector marks from [TheSVG.org](https://thesvg.org) (stored in `src/components/BrandIcons.tsx` or `src/assets/brands/`) rather than generic Lucide placeholder icons.




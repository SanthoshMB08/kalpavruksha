# Modernization Plan: Kalpavruksha Follow-up

**Project**: Kalpavruksha Kalyana

## Technical Framework

- **Language**: JavaScript (Node.js 22+)
- **Framework**: Express 4 and EJS
- **Build Tool**: npm
- **Database**: MySQL/MariaDB (PostgreSQL transfer tooling remains for cutover)
- **Key Dependencies**: mysql2, express-session, Jest, Playwright

## Overview

The current worktree already contains substantial modernization work. The runtime
database is MySQL/MariaDB, `migrations/schema.sql` documents a fresh Hostinger
database import, and the PostgreSQL export/import scripts and deployment notes
are present. The requested logo sizing, responsive dashboard components,
English/Kannada catalog, and advertisement frame guidance and previews also
appear implemented.

The remaining plan is deliberately limited to closing validation-pipeline gaps,
removing code only when it is demonstrably unused, and checking the dependency
audit gate. Existing uncommitted changes are to be preserved; no completed
database, logo, translation, dashboard, or advertisement work should be
reimplemented.

## Migration Impact Summary

| Area | Current state | Remaining outcome |
|---|---|---|
| Validation pipeline | CI runs lint, audit, and Jest; local UI check exists | Verify and close reproducible gaps |
| Code hygiene | No cleanup inventory found | Remove only proven dead code |
| Dependencies | CI audit is configured | Resolve actionable dependency CVEs |

## Existing Work and Evidence

- Hostinger setup documentation and the MySQL schema are present at
  `README.md` and `migrations/schema.sql`.
- `config/db.js` requires a MySQL/MariaDB connection; PostgreSQL references are
  isolated to documented one-time transfer tooling and tests.
- Logo assets and enlarged desktop/mobile sizing rules are present.
- The Kannada catalog contains 850 entries; responsive shared dashboard styles
  and mobile navigation are present.
- Advertisement placement dimensions are shared with the upload UI, which
  displays dimensions and previews desktop/mobile artwork.
- Existing local result artifacts report 90 passing Jest tests and 52 UI checks
  with no browser or console errors. These results do not replace a fresh
  validation run after follow-up changes.

## Scope and Guardrails

- Preserve unrelated and in-progress work in the existing worktree.
- Do not repeat completed PostgreSQL-to-MySQL, Hostinger schema, logo, ad-sizing,
  translation, or responsive dashboard implementation.
- Do not delete code based only on low usage or stylistic preference. If usage
  is ambiguous, leave it in place and report it.
- Repair pipeline issues only when reproducible; keep the MySQL/MariaDB CI
  coverage.
- Do not add a new integration-test suite; use the existing project checks.

# Attractive-Home-Web

Ground-up rewrite of [attractivehome.ae](https://www.attractivehome.ae) — **Next.js + PostgreSQL + Prisma** —
replacing the React SPA + S3-JSON architecture in the old repo (`done/6. Attractive-Home`).

## Why this rewrite

1. **SEO** — every product (4,276) and project (41) gets its own crawlable, always-fresh URL in
   4 languages (en / ar / fr / ru), with correct WhatsApp/Facebook link previews and GA4 analytics.
2. **A real database** — replaces JSON files on S3: searchable catalog, stored leads, per-user
   accounts with roles & permissions, audit log, prices ready for data entry.

## Founding documents

- **[docs/DATABASE.md](docs/DATABASE.md)** — the approved database plan. Read this first; the
  schema, module layout, import plan, and verification steps all live there.
- Plain-English companion (diagrams + explanations): https://claude.ai/code/artifact/ee0eb186-3f93-435e-837d-58f60cae6b40
- SEO strategy deck (why Next.js): https://claude.ai/code/artifact/c15b2071-705e-40f0-a4c1-98d8a7b48e69

## Status

- [x] Database plan approved (2026-07-22)
- [x] Scaffold Next.js + Prisma (multi-file schema per docs/DATABASE.md §9)
- [x] First migration + seed (locales, RBAC, settings)
- [x] Import scripts (docs/DATABASE.md §8 — dev run against old-repo copies; cutover re-runs
      them against fresh S3 exports + the live-S3 vs repo `products.json` diff described in §8)
- [ ] App phases (routing/i18n, catalog, portfolio, dashboard, SEO wiring)

**Open decisions before data entry starts:** price unit vocabulary (per m² / box / piece);
first admin email + individual accounts per team member.

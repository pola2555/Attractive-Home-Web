# Catalog cleanup scripts

One-off, re-runnable data-clarity passes over the imported catalog. Built for
the dev DB first; each is idempotent so it can be re-applied to prod after
review. Run with `npx tsx scripts/catalog/<file>.ts`.

| Script | What it does | Destructive? |
|---|---|---|
| `db-inspect.ts` | Prints current facet counts (materials, types, looks, apps) | no |
| `normalize.ts` | Fixes the unambiguous facet mess: "New Retail"→Ceramic Tile/Slab, "Mixed"→Ceramic/Porcelain, drops non-materials "Glossy"/"Straight Tube", merges "Slate"→"Slate Stone" and crackle/pearlescent/glazed variants into their base | yes (merges + deletes orphan facet rows) |
| `apply-rexin.ts <manifest>` | Enriches the 1,152 HPL/Laminate products from the scraped Rexin data: readable name (`"Walnut 91868"`), look (Wood/Stone/Marble/…), collection (the décor family), sheet sizes | yes (updates products) |
| `dedup-report.ts` | **Read-only.** Groups products by name, classifies pure duplicates vs size variants, writes `dedup-candidates.json` + `dedup-pure.html` | no |
| `dedup-merge.ts [--confirm]` | Keeps one product per pure-duplicate group, deletes the rest. Dry-run without `--confirm`. Skips any product referenced by a quote/favorite/lead | **yes — review the report first** |
| `check-mosycle-gap.ts` | Compares our stored Mosycle image counts to the live Shopify store | no |

## Scrapers (live supplier sites)

Run with Node (`node scripts/.../scrape-*.mjs`); they write JSON manifests to
the session scratchpad, not the repo. Polite concurrency, retries, resumable.

- **Rexin** (`scrape-rexin.mjs`) — static WordPress; extracts the décor family
  (`<h2 class="elementor-heading-title">`) + texture/thickness/sizes. Works well
  (≈1,136 / 1,152; the rest are dead product pages).
- **Mosycle** (`scrape-mosycle.mjs`) — Shopify `/products.json`; full attributes.
  Low extra value: no public prices, thin tags/types, images already imported.

## Images — recovery status & the S3 path convention

Investigated per source (see the Catalog Review):

- **Rexin** laminates — genuinely one swatch image per product at the source.
  Nothing to recover automatically.
- **Mosycle** — galleries already imported; live store has only ~21 extra
  single images, none on our one-image products.
- **Eagle** — product pages are **JavaScript-rendered**; the static HTML exposes
  only shared template/boilerplate images, not the per-product gallery. Real
  recovery needs a **headless browser** (Playwright) that renders the page and
  captures the gallery/room-scene requests. Not done (no browser dependency in
  this project yet).

When images ARE pulled, download them to a local mirror whose path equals the
bucket-relative S3 key, so upload is a straight `aws s3 sync`:

```
recovered-media/
  chinas-catalog-media/                         # bucket (source = 'catalog')
    catalog/products/<Type-Slug>/<CODE>-<PID>/<n>-display.webp
  attractive.home.ae/                           # bucket (source = 'attractivehome')
    product-images/<shopify-handle>/<NN>_<file>.webp
```

e.g. a 2nd image for Eagle product P00782 (code E4GFT128E, Ceramic Tile/Slab):
`recovered-media/chinas-catalog-media/catalog/products/Ceramic-Tile-Slab/E4GFT128E-P00782/1-display.webp`

The matching DB row is a new `product_images` record: `s3_key` = that
bucket-relative key, `sort_order` = next index, `supplier_url` = the original
source image URL. The app treats an `s3_key` starting with `http(s)` as an
absolute URL, so externally-hosted images also work without touching S3.

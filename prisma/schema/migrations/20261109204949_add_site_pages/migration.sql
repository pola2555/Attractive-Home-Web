-- CreateTable
CREATE TABLE "site_pages" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "show_in_nav" BOOLEAN NOT NULL DEFAULT true,
    "show_in_footer" BOOLEAN NOT NULL DEFAULT true,
    "nav_sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_page_translations" (
    "id" UUID NOT NULL,
    "site_page_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "nav_label" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "site_page_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_pages_key_key" ON "site_pages"("key");

-- CreateIndex
CREATE INDEX "site_page_translations_locale_code_idx" ON "site_page_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "site_page_translations_site_page_id_locale_code_key" ON "site_page_translations"("site_page_id", "locale_code");

-- AddForeignKey
ALTER TABLE "site_page_translations" ADD CONSTRAINT "site_page_translations_site_page_id_fkey" FOREIGN KEY ("site_page_id") REFERENCES "site_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_page_translations" ADD CONSTRAINT "site_page_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

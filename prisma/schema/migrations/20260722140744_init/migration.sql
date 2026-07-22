-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "permission_effect" AS ENUM ('allow', 'deny');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('new', 'contacted', 'closed');

-- CreateEnum
CREATE TYPE "lead_channel" AS ENUM ('contact_form', 'whatsapp', 'visualizer', 'other');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('create', 'update', 'delete', 'login', 'import');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "security_stamp" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" "permission_effect" NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("user_id","permission_id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_type_translations" (
    "id" UUID NOT NULL,
    "product_type_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "product_type_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_translations" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "material_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "looks" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "looks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "look_translations" (
    "id" UUID NOT NULL,
    "look_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "look_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colors" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "hex" CHAR(7),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color_translations" (
    "id" UUID NOT NULL,
    "color_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "color_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_translations" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "application_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finishes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finish_translations" (
    "id" UUID NOT NULL,
    "finish_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "finish_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_attributes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "performance_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_attribute_translations" (
    "id" UUID NOT NULL,
    "performance_attribute_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "performance_attribute_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_translations" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "collection_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_translations" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "brand_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_translations" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "source_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "legacy_id" TEXT NOT NULL,
    "shopify_product_id" BIGINT,
    "slug" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "brand_id" UUID,
    "code" TEXT,
    "type_id" UUID,
    "material_id" UUID,
    "look_id" UUID,
    "color_id" UUID,
    "finish_id" UUID,
    "collection_id" UUID,
    "size_label" TEXT,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'AED',
    "price_unit" TEXT,
    "selling_type" TEXT,
    "packing" TEXT,
    "weight_label" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "featured_rank" INTEGER,
    "supplier_url" TEXT,
    "legacy_meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "usage_notes" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_applications" (
    "product_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,

    CONSTRAINT "product_applications_pkey" PRIMARY KEY ("product_id","application_id")
);

-- CreateTable
CREATE TABLE "product_performance" (
    "product_id" UUID NOT NULL,
    "performance_attribute_id" UUID NOT NULL,

    CONSTRAINT "product_performance_pkey" PRIMARY KEY ("product_id","performance_attribute_id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "thumb_key" TEXT,
    "supplier_url" TEXT,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "legacy_key" TEXT,
    "slug" TEXT NOT NULL,
    "media_type" "media_type",
    "media_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_translations" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "service_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_blocks" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_block_translations" (
    "id" UUID NOT NULL,
    "content_block_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "content_block_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_rooms" (
    "id" UUID NOT NULL,
    "image_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sample_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "message" TEXT,
    "channel" "lead_channel" NOT NULL DEFAULT 'contact_form',
    "source_path" TEXT,
    "locale_code" VARCHAR(8),
    "product_id" UUID,
    "project_id" UUID,
    "status" "lead_status" NOT NULL DEFAULT 'new',
    "assigned_to" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locales" (
    "code" VARCHAR(8) NOT NULL,
    "name_en" TEXT NOT NULL,
    "native_name" TEXT NOT NULL,
    "is_rtl" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "portfolio_categories" (
    "id" UUID NOT NULL,
    "legacy_key" TEXT,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portfolio_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_category_translations" (
    "id" UUID NOT NULL,
    "portfolio_category_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "portfolio_category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "legacy_id" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "cover_key" TEXT,
    "cover_type" "media_type",
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_translations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "title" TEXT NOT NULL,
    "area_label" TEXT,
    "description" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "project_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_sections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "legacy_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_section_translations" (
    "id" UUID NOT NULL,
    "project_section_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "project_section_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_media" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "section_id" UUID,
    "media_type" "media_type" NOT NULL,
    "base_key" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_media_translations" (
    "id" UUID NOT NULL,
    "project_media_id" UUID NOT NULL,
    "locale_code" VARCHAR(8) NOT NULL,
    "alt" TEXT,
    "caption" TEXT,

    CONSTRAINT "project_media_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "audit_action" NOT NULL,
    "diff" JSONB,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_types_code_key" ON "product_types"("code");

-- CreateIndex
CREATE INDEX "product_type_translations_locale_code_idx" ON "product_type_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_translations_product_type_id_locale_code_key" ON "product_type_translations"("product_type_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");

-- CreateIndex
CREATE INDEX "material_translations_locale_code_idx" ON "material_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "material_translations_material_id_locale_code_key" ON "material_translations"("material_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "looks_code_key" ON "looks"("code");

-- CreateIndex
CREATE INDEX "look_translations_locale_code_idx" ON "look_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "look_translations_look_id_locale_code_key" ON "look_translations"("look_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "colors_code_key" ON "colors"("code");

-- CreateIndex
CREATE INDEX "color_translations_locale_code_idx" ON "color_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "color_translations_color_id_locale_code_key" ON "color_translations"("color_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "applications_code_key" ON "applications"("code");

-- CreateIndex
CREATE INDEX "application_translations_locale_code_idx" ON "application_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "application_translations_application_id_locale_code_key" ON "application_translations"("application_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "finishes_code_key" ON "finishes"("code");

-- CreateIndex
CREATE INDEX "finish_translations_locale_code_idx" ON "finish_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "finish_translations_finish_id_locale_code_key" ON "finish_translations"("finish_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "performance_attributes_code_key" ON "performance_attributes"("code");

-- CreateIndex
CREATE INDEX "performance_attribute_translations_locale_code_idx" ON "performance_attribute_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "performance_attribute_translations_performance_attribute_id_key" ON "performance_attribute_translations"("performance_attribute_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "collections_code_key" ON "collections"("code");

-- CreateIndex
CREATE INDEX "collection_translations_locale_code_idx" ON "collection_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "collection_translations_collection_id_locale_code_key" ON "collection_translations"("collection_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "brands_code_key" ON "brands"("code");

-- CreateIndex
CREATE INDEX "brand_translations_locale_code_idx" ON "brand_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "brand_translations_brand_id_locale_code_key" ON "brand_translations"("brand_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "sources_code_key" ON "sources"("code");

-- CreateIndex
CREATE INDEX "source_translations_locale_code_idx" ON "source_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "source_translations_source_id_locale_code_key" ON "source_translations"("source_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_legacy_id_key" ON "products"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopify_product_id_key" ON "products"("shopify_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_source_id_idx" ON "products"("source_id");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- CreateIndex
CREATE INDEX "products_type_id_idx" ON "products"("type_id");

-- CreateIndex
CREATE INDEX "products_material_id_idx" ON "products"("material_id");

-- CreateIndex
CREATE INDEX "products_look_id_idx" ON "products"("look_id");

-- CreateIndex
CREATE INDEX "products_color_id_idx" ON "products"("color_id");

-- CreateIndex
CREATE INDEX "products_finish_id_idx" ON "products"("finish_id");

-- CreateIndex
CREATE INDEX "products_collection_id_idx" ON "products"("collection_id");

-- CreateIndex
CREATE INDEX "products_is_published_type_id_idx" ON "products"("is_published", "type_id");

-- CreateIndex
CREATE INDEX "product_translations_locale_code_idx" ON "product_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_translations_product_id_locale_code_key" ON "product_translations"("product_id", "locale_code");

-- CreateIndex
CREATE INDEX "product_applications_application_id_idx" ON "product_applications"("application_id");

-- CreateIndex
CREATE INDEX "product_performance_performance_attribute_id_idx" ON "product_performance"("performance_attribute_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_sort_order_key" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "services_legacy_key_key" ON "services"("legacy_key");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "service_translations_locale_code_idx" ON "service_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "service_translations_service_id_locale_code_key" ON "service_translations"("service_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "content_blocks_key_key" ON "content_blocks"("key");

-- CreateIndex
CREATE INDEX "content_block_translations_locale_code_idx" ON "content_block_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "content_block_translations_content_block_id_locale_code_key" ON "content_block_translations"("content_block_id", "locale_code");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_assigned_to_idx" ON "leads"("assigned_to");

-- CreateIndex
CREATE INDEX "lead_notes_lead_id_created_at_idx" ON "lead_notes"("lead_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_categories_legacy_key_key" ON "portfolio_categories"("legacy_key");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_categories_slug_key" ON "portfolio_categories"("slug");

-- CreateIndex
CREATE INDEX "portfolio_category_translations_locale_code_idx" ON "portfolio_category_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_category_translations_portfolio_category_id_local_key" ON "portfolio_category_translations"("portfolio_category_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_legacy_id_key" ON "projects"("legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_category_id_sort_order_idx" ON "projects"("category_id", "sort_order");

-- CreateIndex
CREATE INDEX "project_translations_locale_code_idx" ON "project_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_translations_project_id_locale_code_key" ON "project_translations"("project_id", "locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_sections_legacy_id_key" ON "project_sections"("legacy_id");

-- CreateIndex
CREATE INDEX "project_sections_project_id_sort_order_idx" ON "project_sections"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "project_section_translations_locale_code_idx" ON "project_section_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_section_translations_project_section_id_locale_code_key" ON "project_section_translations"("project_section_id", "locale_code");

-- CreateIndex
CREATE INDEX "project_media_project_id_sort_order_idx" ON "project_media"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "project_media_section_id_idx" ON "project_media"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_media_project_id_base_key_key" ON "project_media"("project_id", "base_key");

-- CreateIndex
CREATE INDEX "project_media_translations_locale_code_idx" ON "project_media_translations"("locale_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_media_translations_project_media_id_locale_code_key" ON "project_media_translations"("project_media_id", "locale_code");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_type_translations" ADD CONSTRAINT "product_type_translations_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_type_translations" ADD CONSTRAINT "product_type_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_translations" ADD CONSTRAINT "material_translations_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_translations" ADD CONSTRAINT "material_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "look_translations" ADD CONSTRAINT "look_translations_look_id_fkey" FOREIGN KEY ("look_id") REFERENCES "looks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "look_translations" ADD CONSTRAINT "look_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_translations" ADD CONSTRAINT "color_translations_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_translations" ADD CONSTRAINT "color_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_translations" ADD CONSTRAINT "application_translations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_translations" ADD CONSTRAINT "application_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finish_translations" ADD CONSTRAINT "finish_translations_finish_id_fkey" FOREIGN KEY ("finish_id") REFERENCES "finishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finish_translations" ADD CONSTRAINT "finish_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_attribute_translations" ADD CONSTRAINT "performance_attribute_translations_performance_attribute_i_fkey" FOREIGN KEY ("performance_attribute_id") REFERENCES "performance_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_attribute_translations" ADD CONSTRAINT "performance_attribute_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_translations" ADD CONSTRAINT "brand_translations_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_translations" ADD CONSTRAINT "brand_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_translations" ADD CONSTRAINT "source_translations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_translations" ADD CONSTRAINT "source_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "product_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_look_id_fkey" FOREIGN KEY ("look_id") REFERENCES "looks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_finish_id_fkey" FOREIGN KEY ("finish_id") REFERENCES "finishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_applications" ADD CONSTRAINT "product_applications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_applications" ADD CONSTRAINT "product_applications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_performance" ADD CONSTRAINT "product_performance_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_performance" ADD CONSTRAINT "product_performance_performance_attribute_id_fkey" FOREIGN KEY ("performance_attribute_id") REFERENCES "performance_attributes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_translations" ADD CONSTRAINT "service_translations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_translations" ADD CONSTRAINT "service_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_block_translations" ADD CONSTRAINT "content_block_translations_content_block_id_fkey" FOREIGN KEY ("content_block_id") REFERENCES "content_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_block_translations" ADD CONSTRAINT "content_block_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_category_translations" ADD CONSTRAINT "portfolio_category_translations_portfolio_category_id_fkey" FOREIGN KEY ("portfolio_category_id") REFERENCES "portfolio_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_category_translations" ADD CONSTRAINT "portfolio_category_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "portfolio_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_translations" ADD CONSTRAINT "project_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sections" ADD CONSTRAINT "project_sections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_section_translations" ADD CONSTRAINT "project_section_translations_project_section_id_fkey" FOREIGN KEY ("project_section_id") REFERENCES "project_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_section_translations" ADD CONSTRAINT "project_section_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "project_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_media_translations" ADD CONSTRAINT "project_media_translations_project_media_id_fkey" FOREIGN KEY ("project_media_id") REFERENCES "project_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_media_translations" ADD CONSTRAINT "project_media_translations_locale_code_fkey" FOREIGN KEY ("locale_code") REFERENCES "locales"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-added SQL (Prisma cannot express these) — docs/DATABASE.md §9:
-- "Trigram GIN + partial indexes: hand-added SQL in the generated migration".
-- ---------------------------------------------------------------------------

-- docs/DATABASE.md §5 products: GIN (code gin_trgm_ops) — substring SKU search
-- via `code ILIKE '%q%'`.
CREATE INDEX "products_code_trgm_idx" ON "products" USING GIN ("code" gin_trgm_ops);

-- docs/DATABASE.md §5 product_translations: GIN (name gin_trgm_ops) — search
-- all locales with one index via `pt.name ILIKE '%q%'`.
CREATE INDEX "product_translations_name_trgm_idx" ON "product_translations" USING GIN ("name" gin_trgm_ops);

-- docs/DATABASE.md §5 products: partial (featured_rank) WHERE NOT NULL —
-- tiny index serving the featured-products query.
CREATE INDEX "products_featured_rank_idx" ON "products" ("featured_rank") WHERE "featured_rank" IS NOT NULL;

-- docs/DATABASE.md §7 leads: PARTIAL (status, created_at DESC) WHERE
-- status <> 'closed' — the open-leads dashboard list.
CREATE INDEX "leads_open_status_created_at_idx" ON "leads" ("status", "created_at" DESC) WHERE "status" <> 'closed';

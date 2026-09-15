import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915195820 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "commune_override" ("id" text not null, "commune_name_fr" text not null, "home_delivery_price" numeric not null, "stop_desk_price" numeric not null, "is_active" boolean not null default true, "wilaya_rate_id" text not null, "raw_home_delivery_price" jsonb not null, "raw_stop_desk_price" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commune_override_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commune_override_wilaya_rate_id" ON "commune_override" ("wilaya_rate_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commune_override_deleted_at" ON "commune_override" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "commune_override" add constraint "commune_override_wilaya_rate_id_foreign" foreign key ("wilaya_rate_id") references "wilaya_rate" ("id") on update cascade;`);

    this.addSql(`alter table if exists "wilaya_rate" add column if not exists "wilaya_name_fr" text not null, add column if not exists "wilaya_name_ar" text not null, add column if not exists "wilaya_name_en" text not null, add column if not exists "delivery_center_id" text null, add column if not exists "is_active" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commune_override" cascade;`);

    this.addSql(`alter table if exists "wilaya_rate" drop column if exists "wilaya_name_fr", drop column if exists "wilaya_name_ar", drop column if exists "wilaya_name_en", drop column if exists "delivery_center_id", drop column if exists "is_active";`);
  }

}

import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010125950 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wilaya_rate" drop constraint if exists "wilaya_rate_wilaya_code_unique";`);
    this.addSql(`create table if not exists "wilaya_rate" ("id" text not null, "wilaya_code" integer not null, "wilaya_name_fr" text not null, "wilaya_name_ar" text not null, "wilaya_name_en" text not null, "desk_price" numeric not null default 0, "home_price" numeric not null default 0, "region_id" text not null, "delivery_center_id" text null, "is_active" boolean not null default true, "raw_desk_price" jsonb not null default '{"value":"0","precision":20}', "raw_home_price" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wilaya_rate_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wilaya_rate_wilaya_code_unique" ON "wilaya_rate" ("wilaya_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wilaya_rate_wilaya_code" ON "wilaya_rate" ("wilaya_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wilaya_rate_region_id" ON "wilaya_rate" ("region_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wilaya_rate_deleted_at" ON "wilaya_rate" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "commune_override" ("id" text not null, "commune_name_fr" text not null, "home_delivery_price" numeric not null, "stop_desk_price" numeric not null, "is_active" boolean not null default true, "wilaya_rate_id" text not null, "raw_home_delivery_price" jsonb not null, "raw_stop_desk_price" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commune_override_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commune_override_wilaya_rate_id" ON "commune_override" ("wilaya_rate_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commune_override_deleted_at" ON "commune_override" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "commune_override" add constraint "commune_override_wilaya_rate_id_foreign" foreign key ("wilaya_rate_id") references "wilaya_rate" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "commune_override" drop constraint if exists "commune_override_wilaya_rate_id_foreign";`);

    this.addSql(`drop table if exists "wilaya_rate" cascade;`);

    this.addSql(`drop table if exists "commune_override" cascade;`);
  }

}

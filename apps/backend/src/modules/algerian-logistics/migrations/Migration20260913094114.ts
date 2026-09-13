import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260913094114 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wilaya_rate" drop constraint if exists "wilaya_rate_wilaya_code_unique";`);
    this.addSql(`create table if not exists "wilaya_rate" ("id" text not null, "wilaya_code" integer not null, "desk_price" numeric not null default 0, "home_price" numeric not null default 0, "region_id" text not null, "raw_desk_price" jsonb not null default '{"value":"0","precision":20}', "raw_home_price" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wilaya_rate_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wilaya_rate_wilaya_code_unique" ON "wilaya_rate" ("wilaya_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wilaya_rate_wilaya_code" ON "wilaya_rate" ("wilaya_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wilaya_rate_region_id" ON "wilaya_rate" ("region_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wilaya_rate_deleted_at" ON "wilaya_rate" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wilaya_rate" cascade;`);
  }

}

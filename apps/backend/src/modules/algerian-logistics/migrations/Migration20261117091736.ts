import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261117091736 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wilaya_rate" add column if not exists "mother_wilaya_code" integer null;`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "desk_price" type numeric using ("desk_price"::numeric);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "desk_price" set default 400;`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "home_price" type numeric using ("home_price"::numeric);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "home_price" set default 700;`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_desk_price" type jsonb using ("raw_desk_price"::jsonb);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_desk_price" set default '{"value":"400","precision":20}';`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_home_price" type jsonb using ("raw_home_price"::jsonb);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_home_price" set default '{"value":"700","precision":20}';`);

    this.addSql(`alter table if exists "commune_override" add column if not exists "commune_name_ar" text not null default '', add column if not exists "commune_key" text not null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commune_override_commune_key" ON "commune_override" ("commune_key") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "wilaya_rate" drop column if exists "mother_wilaya_code";`);

    this.addSql(`alter table if exists "wilaya_rate" alter column "desk_price" type numeric using ("desk_price"::numeric);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "desk_price" set default 0;`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "home_price" type numeric using ("home_price"::numeric);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "home_price" set default 0;`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_desk_price" type jsonb using ("raw_desk_price"::jsonb);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_desk_price" set default '{"value":"0","precision":20}';`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_home_price" type jsonb using ("raw_home_price"::jsonb);`);
    this.addSql(`alter table if exists "wilaya_rate" alter column "raw_home_price" set default '{"value":"0","precision":20}';`);

    this.addSql(`drop index if exists "IDX_commune_override_commune_key";`);
    this.addSql(`alter table if exists "commune_override" drop column if exists "commune_name_ar", drop column if exists "commune_key";`);
  }

}

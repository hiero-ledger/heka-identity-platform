import { Migration } from '@mikro-orm/migrations';

export class Migration20260818120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('create table "oidc_signing_key" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "kid" varchar(255) not null, "alg" varchar(255) not null, "jwk" jsonb not null, "retired_at" timestamptz null, constraint "oidc_signing_key_pkey" primary key ("id"));');
    this.addSql('alter table "oidc_signing_key" add constraint "oidc_signing_key_kid_unique" unique ("kid");');
    this.addSql('create index "oidc_signing_key_alg_index" on "oidc_signing_key" ("alg");');
    this.addSql('create index "oidc_signing_key_retired_at_index" on "oidc_signing_key" ("retired_at");');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "oidc_signing_key" cascade;');
  }
}

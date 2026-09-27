import { Migration } from '@mikro-orm/migrations';

export class Migration20260819100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('create table "oidc_entity" ("name" varchar(64) not null, "id" varchar(255) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "payload" jsonb not null, "grant_id" varchar(255) null, "user_code" varchar(255) null, "uid" varchar(255) null, "expires_at" timestamptz null, "consumed_at" timestamptz null, constraint "oidc_entity_pkey" primary key ("name", "id"));');
    this.addSql('create index "oidc_entity_grant_id_index" on "oidc_entity" ("grant_id");');
    this.addSql('create index "oidc_entity_user_code_index" on "oidc_entity" ("user_code");');
    this.addSql('create index "oidc_entity_uid_index" on "oidc_entity" ("uid");');
    this.addSql('create index "oidc_entity_expires_at_index" on "oidc_entity" ("expires_at");');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "oidc_entity" cascade;');
  }
}

import { Migration } from '@mikro-orm/migrations';

export class Migration20261029130000 extends Migration {

  async up(): Promise<void> {
    this.addSql(`
      create table "oauth_link_attempts" (
        "id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "wallet_id" varchar(255) not null,
        "tenant_id" varchar(255) not null,
        "state_hash" varchar(255) not null,
        "code_verifier" varchar(255) not null,
        "expires_at" timestamptz not null,
        "status" varchar(255) not null default 'pending',
        "created_at" timestamptz not null,
        constraint "oauth_link_attempts_pkey" primary key ("id")
      );
    `);
    this.addSql('alter table "oauth_link_attempts" add constraint "oauth_link_attempts_state_hash_unique" unique ("state_hash");');
    this.addSql('create index "oauth_link_attempts_user_id_index" on "oauth_link_attempts" ("user_id");');
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "oauth_link_attempts" cascade;');
  }

}

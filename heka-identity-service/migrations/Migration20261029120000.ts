import { Migration } from '@mikro-orm/migrations';

// Contributor bindings, audit events, and GPG challenges live in the identity
// database. Auth-service and identity-service do not share a database.
// Existing dev rows in auth-service are not copied: no production bindings exist.
export class Migration20261029120000 extends Migration {

  async up(): Promise<void> {
    this.addSql(`
      create table "contributor_bindings" (
        "id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "wallet_id" varchar(255) not null,
        "tenant_id" varchar(255) not null,
        "github_account_id" varchar(255) not null,
        "github_username" varchar(255) not null,
        "gpg_fingerprint" varchar(255) null,
        "verified_at" timestamptz null,
        "linked_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "contributor_bindings_pkey" primary key ("id")
      );
    `);
    this.addSql('alter table "contributor_bindings" add constraint "contributor_bindings_github_account_id_unique" unique ("github_account_id");');
    this.addSql('alter table "contributor_bindings" add constraint "contributor_bindings_tenant_id_user_id_unique" unique ("tenant_id", "user_id");');
    this.addSql('create index "contributor_bindings_github_username_index" on "contributor_bindings" ("github_username");');

    this.addSql(`
      create table "contributor_onboarding_audit_events" (
        "id" varchar(255) not null,
        "event_type" varchar(255) not null,
        "user_id" varchar(255) not null,
        "tenant_id" varchar(255) not null,
        "github_account_id" varchar(255) null,
        "github_username" varchar(255) null,
        "wallet_id" varchar(255) null,
        "gpg_fingerprint" varchar(255) null,
        "metadata" jsonb null,
        "created_at" timestamptz not null,
        constraint "contributor_onboarding_audit_events_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "contributor_onboarding_audit_events_user_id_index" on "contributor_onboarding_audit_events" ("user_id");');
    this.addSql('create index "contributor_onboarding_audit_events_wallet_id_index" on "contributor_onboarding_audit_events" ("wallet_id");');

    this.addSql(`
      create table "gpg_challenges" (
        "id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "tenant_id" varchar(255) not null,
        "wallet_id" varchar(255) not null,
        "github_account_id" varchar(255) not null,
        "github_username" varchar(255) not null,
        "nonce" varchar(255) not null,
        "expires_at" timestamptz not null,
        "consumed" boolean not null default false,
        "verified_at" timestamptz null,
        "gpg_fingerprint" varchar(255) null,
        "created_at" timestamptz not null,
        constraint "gpg_challenges_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "gpg_challenges_user_id_index" on "gpg_challenges" ("user_id");');
    this.addSql('create index "gpg_challenges_github_username_index" on "gpg_challenges" ("github_username");');
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "gpg_challenges" cascade;');
    this.addSql('drop table if exists "contributor_onboarding_audit_events" cascade;');
    this.addSql('drop table if exists "contributor_bindings" cascade;');
  }

}

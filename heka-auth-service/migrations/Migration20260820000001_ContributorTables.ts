import { Migration } from '@mikro-orm/migrations';

export class Migration20260820000001_ContributorTables extends Migration {

  override async up(): Promise<void> {
    // contributor_bindings — owned by heka-auth-service (moved from identity-service)
    this.addSql(`
      create table "contributor_bindings" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "github_account_id" varchar(255) not null,
        "github_username" varchar(255) not null,
        "wallet_id" varchar(255) not null,
        "gpg_fingerprint" varchar(255) null,
        "verified_at" timestamptz null,
        constraint "contributor_bindings_pkey" primary key ("id")
      );
    `);
    this.addSql('create unique index "contributor_bindings_github_account_id_unique" on "contributor_bindings" ("github_account_id");');
    this.addSql('create unique index "contributor_bindings_wallet_id_unique" on "contributor_bindings" ("wallet_id");');
    this.addSql('create index "contributor_bindings_github_username_index" on "contributor_bindings" ("github_username");');

    // contributor_audit_events — audit trail for onboarding and verification steps
    this.addSql(`
      create table "contributor_audit_events" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "event_type" varchar(255) not null,
        "github_account_id" varchar(255) null,
        "github_username" varchar(255) null,
        "wallet_id" varchar(255) null,
        "gpg_fingerprint" varchar(255) null,
        "metadata" jsonb null,
        constraint "contributor_audit_events_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "contributor_audit_events_event_type_index" on "contributor_audit_events" ("event_type");');
    this.addSql('create index "contributor_audit_events_wallet_id_index" on "contributor_audit_events" ("wallet_id");');

    // gpg_challenges — single-use nonce sessions for GPG key ownership proofs
    this.addSql(`
      create table "gpg_challenges" (
        "id" varchar(255) not null,
        "github_username" varchar(255) not null,
        "nonce" varchar(255) not null,
        "expires_at" timestamptz not null,
        "consumed" boolean not null default false,
        "verified_at" timestamptz null,
        "gpg_fingerprint" varchar(255) null,
        "github_account_id" varchar(255) null,
        constraint "gpg_challenges_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "gpg_challenges_github_username_index" on "gpg_challenges" ("github_username");');
    this.addSql('create index "gpg_challenges_expires_at_index" on "gpg_challenges" ("expires_at");');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "gpg_challenges" cascade;');
    this.addSql('drop table if exists "contributor_audit_events" cascade;');
    this.addSql('drop table if exists "contributor_bindings" cascade;');
  }

}

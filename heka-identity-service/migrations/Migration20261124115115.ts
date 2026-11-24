import { Migration } from '@mikro-orm/migrations';

// Contributor verification (optional feature): its four tables exist whether or not the feature is enabled.
// Generated with `migration:create`; the unrelated drift it also emitted for main's tables (foreign keys,
// user.registered_at precision) is left out.
export class Migration20261124115115 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "contributor_audit_event" ("id" varchar(255) not null, "event_type" text not null, "user_id" varchar(255) not null, "tenant_id" varchar(255) not null, "github_account_id" varchar(255) null, "github_username" varchar(255) null, "wallet_id" varchar(255) null, "gpg_fingerprint" varchar(255) null, "metadata" jsonb null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "contributor_audit_event_user_id_index" on "contributor_audit_event" ("user_id");`);
    this.addSql(`create index "contributor_audit_event_wallet_id_index" on "contributor_audit_event" ("wallet_id");`);

    this.addSql(`create table "contributor_binding" ("id" varchar(255) not null, "user_id" varchar(255) not null, "wallet_id" varchar(255) not null, "tenant_id" varchar(255) not null, "github_account_id" varchar(255) not null, "github_username" varchar(255) not null, "gpg_fingerprint" varchar(255) null, "verified_at" timestamptz null, "linked_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "contributor_binding_github_username_index" on "contributor_binding" ("github_username");`);
    this.addSql(`alter table "contributor_binding" add constraint "contributor_binding_user_id_unique" unique ("user_id");`);
    this.addSql(`alter table "contributor_binding" add constraint "contributor_binding_github_account_id_unique" unique ("github_account_id");`);

    this.addSql(`create table "gpg_challenge" ("id" varchar(255) not null, "user_id" varchar(255) not null, "tenant_id" varchar(255) not null, "wallet_id" varchar(255) not null, "github_account_id" varchar(255) not null, "github_username" varchar(255) not null, "nonce" varchar(255) not null, "expires_at" timestamptz not null, "consumed" boolean not null default false, "verified_at" timestamptz null, "gpg_fingerprint" varchar(255) null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "gpg_challenge_user_id_index" on "gpg_challenge" ("user_id");`);
    this.addSql(`create index "gpg_challenge_github_username_index" on "gpg_challenge" ("github_username");`);

    this.addSql(`create table "oauth_link_attempt" ("id" varchar(255) not null, "user_id" varchar(255) not null, "wallet_id" varchar(255) not null, "tenant_id" varchar(255) not null, "state_hash" varchar(255) not null, "code_verifier" varchar(255) null, "expires_at" timestamptz not null, "status" text not null default 'pending', "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "oauth_link_attempt" add constraint "oauth_link_attempt_state_hash_unique" unique ("state_hash");`);

    this.addSql(`alter table "contributor_audit_event" add constraint "contributor_audit_event_event_type_check" check ("event_type" in ('ChallengeRequested', 'ProofAccepted', 'ProofRejected', 'BindingUpdated', 'BindingRemoved'));`);

    this.addSql(`alter table "oauth_link_attempt" add constraint "oauth_link_attempt_status_check" check ("status" in ('pending', 'consumed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "contributor_audit_event" cascade;`);
    this.addSql(`drop table if exists "contributor_binding" cascade;`);
    this.addSql(`drop table if exists "gpg_challenge" cascade;`);
    this.addSql(`drop table if exists "oauth_link_attempt" cascade;`);
  }

}

import { Migration } from '@mikro-orm/migrations';

export class Migration20260423071729 extends Migration {

  override async up(): Promise<void> {
    this.addSql('alter table "token" alter column "id" drop default;');
    this.addSql('alter table "token" alter column "id" drop default;');
    this.addSql('alter table "token" alter column "id" type uuid using ("id"::text::uuid);');
    this.addSql('alter table "token" alter column "created_at" drop default;');
    this.addSql('alter table "token" alter column "created_at" type timestamptz using ("created_at"::timestamptz);');
    this.addSql('alter table "token" alter column "updated_at" drop default;');
    this.addSql('alter table "token" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);');

    this.addSql('alter table "auth_user" add column "github_id" varchar(255) null, add column "github_username" varchar(255) null, add column "github_email" varchar(255) null, add column "github_avatar_url" varchar(255) null;');
    this.addSql('alter table "auth_user" alter column "id" drop default;');
    this.addSql('alter table "auth_user" alter column "id" drop default;');
    this.addSql('alter table "auth_user" alter column "id" type uuid using ("id"::text::uuid);');
    this.addSql('alter table "auth_user" alter column "created_at" drop default;');
    this.addSql('alter table "auth_user" alter column "created_at" type timestamptz using ("created_at"::timestamptz);');
    this.addSql('alter table "auth_user" alter column "updated_at" drop default;');
    this.addSql('alter table "auth_user" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);');
    this.addSql('alter table "auth_user" add constraint "auth_user_github_id_unique" unique ("github_id");');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "token" alter column "id" drop default;');
    this.addSql('alter table "token" alter column "id" type uuid using ("id"::text::uuid);');
    this.addSql('alter table "token" alter column "id" set default gen_random_uuid();');
    this.addSql('alter table "token" alter column "created_at" type timestamptz using ("created_at"::timestamptz);');
    this.addSql('alter table "token" alter column "created_at" set default now();');
    this.addSql('alter table "token" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);');
    this.addSql('alter table "token" alter column "updated_at" set default now();');

    this.addSql('alter table "auth_user" drop constraint "auth_user_github_id_unique";');
    this.addSql('alter table "auth_user" drop column "github_id", drop column "github_username", drop column "github_email", drop column "github_avatar_url";');

    this.addSql('alter table "auth_user" alter column "id" drop default;');
    this.addSql('alter table "auth_user" alter column "id" type uuid using ("id"::text::uuid);');
    this.addSql('alter table "auth_user" alter column "id" set default gen_random_uuid();');
    this.addSql('alter table "auth_user" alter column "created_at" type timestamptz using ("created_at"::timestamptz);');
    this.addSql('alter table "auth_user" alter column "created_at" set default now();');
    this.addSql('alter table "auth_user" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);');
    this.addSql('alter table "auth_user" alter column "updated_at" set default now();');
  }

}

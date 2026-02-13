import { Migration } from '@mikro-orm/migrations';

export class Migration20240823095621 extends Migration {

  override async up(): Promise<void> {
    this.addSql('create table "token" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "type" varchar(255) not null, "subject" varchar(255) not null, "token" text not null, "payload" text null, "is_revoked" boolean not null default false, "expire_in" timestamptz null, constraint "token_pkey" primary key ("id"));');
    this.addSql('create index "token_type_index" on "token" ("type");');
    this.addSql('create index "token_subject_index" on "token" ("subject");');
    this.addSql('create index "token_token_index" on "token" ("token");');
    this.addSql('create index "token_is_revoked_index" on "token" ("is_revoked");');
    this.addSql('create index "token_expire_in_index" on "token" ("expire_in");');

    this.addSql('create table "auth_user" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "name" varchar(255) not null, "password" text not null, "role" varchar(255) not null, constraint "auth_user_pkey" primary key ("id"));');
    this.addSql('create index "auth_user_name_index" on "auth_user" ("name");');
    this.addSql('alter table "auth_user" add constraint "auth_user_name_unique" unique ("name");');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "token" cascade;');

    this.addSql('drop table if exists "auth_user" cascade;');
  }

}

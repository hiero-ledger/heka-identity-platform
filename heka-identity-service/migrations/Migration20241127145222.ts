import { Migration } from '@mikro-orm/migrations';

export class Migration20241127145222 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table "schema_registration" ("id" varchar(255) not null, "schema_id" varchar(255) not null, "protocol" varchar(255) not null, "credential_format" varchar(255) not null, "network" varchar(255) not null, "credentials" jsonb not null, constraint "schema_registration_pkey" primary key ("id"));');

    this.addSql('alter table "schema_registration" add constraint "schema_registration_schema_id_foreign" foreign key ("schema_id") references "schema" ("id") on update cascade;');

    this.addSql('drop table if exists "schema_publication" cascade;');
  }

  async down(): Promise<void> {
    this.addSql('create table "schema_publication" ("id" varchar(255) not null, "schema_id" varchar(255) not null, "protocol" varchar(255) not null, "credential_format" varchar(255) not null, "network" varchar(255) not null, "credentials" jsonb not null, constraint "schema_publication_pkey" primary key ("id"));');

    this.addSql('alter table "schema_publication" add constraint "schema_publication_schema_id_foreign" foreign key ("schema_id") references "schema" ("id") on update cascade;');

    this.addSql('drop table if exists "schema_registration" cascade;');
  }

}

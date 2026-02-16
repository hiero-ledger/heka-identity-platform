import { Migration } from '@mikro-orm/migrations';

export class Migration20241118173619 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table "schema" ("id" varchar(255) not null, "owner_id" varchar(255) not null, "name" varchar(500) not null, "logo" varchar(4000) null, "bg_color" varchar(8) null, "order_index" int null, "is_hidden" varchar(255) not null default false, constraint "schema_pkey" primary key ("id"));');

    this.addSql('create table "schema_field" ("id" varchar(255) not null, "schema_id" varchar(255) not null, "name" varchar(250) not null, "order_index" int null, constraint "schema_field_pkey" primary key ("id"));');

    this.addSql('create table "issuance_template" ("id" varchar(255) not null, "owner_id" varchar(255) not null, "name" varchar(500) not null, "protocol" varchar(255) not null, "credential_format" varchar(255) not null, "network" varchar(255) not null, "did" varchar(255) not null, "schema_id" varchar(255) not null, "credential_id" varchar(1000) null, "is_pinned" varchar(255) not null default false, "order_index" int null, constraint "issuance_template_pkey" primary key ("id"));');

    this.addSql('create table "issuance_template_field" ("id" varchar(255) not null, "template_id" varchar(255) not null, "schema_field_id" varchar(255) not null, "value" varchar(255) null, constraint "issuance_template_field_pkey" primary key ("id"));');

    this.addSql('create table "verification_template" ("id" varchar(255) not null, "owner_id" varchar(255) not null, "name" varchar(500) not null, "protocol" varchar(255) not null, "credential_format" varchar(255) not null, "network" varchar(255) not null, "did" varchar(255) not null, "schema_id" varchar(255) not null, "is_pinned" varchar(255) not null default false, "order_index" int null, constraint "verification_template_pkey" primary key ("id"));');

    this.addSql('create table "verification_template_field" ("id" varchar(255) not null, "template_id" varchar(255) not null, "schema_field_id" varchar(255) not null, constraint "verification_template_field_pkey" primary key ("id"));');

    this.addSql('alter table "schema" add constraint "schema_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;');

    this.addSql('alter table "schema_field" add constraint "schema_field_schema_id_foreign" foreign key ("schema_id") references "schema" ("id") on update cascade;');

    this.addSql('alter table "issuance_template" add constraint "issuance_template_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;');
    this.addSql('alter table "issuance_template" add constraint "issuance_template_schema_id_foreign" foreign key ("schema_id") references "schema" ("id") on update cascade;');

    this.addSql('alter table "issuance_template_field" add constraint "issuance_template_field_template_id_foreign" foreign key ("template_id") references "issuance_template" ("id") on update cascade;');
    this.addSql('alter table "issuance_template_field" add constraint "issuance_template_field_schema_field_id_foreign" foreign key ("schema_field_id") references "schema_field" ("id") on update cascade;');

    this.addSql('alter table "verification_template" add constraint "verification_template_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;');
    this.addSql('alter table "verification_template" add constraint "verification_template_schema_id_foreign" foreign key ("schema_id") references "schema" ("id") on update cascade;');

    this.addSql('alter table "verification_template_field" add constraint "verification_template_field_template_id_foreign" foreign key ("template_id") references "verification_template" ("id") on update cascade;');
    this.addSql('alter table "verification_template_field" add constraint "verification_template_field_schema_field_id_foreign" foreign key ("schema_field_id") references "schema_field" ("id") on update cascade;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "schema_field" drop constraint "schema_field_schema_id_foreign";');

    this.addSql('alter table "issuance_template" drop constraint "issuance_template_schema_id_foreign";');

    this.addSql('alter table "verification_template" drop constraint "verification_template_schema_id_foreign";');

    this.addSql('alter table "issuance_template_field" drop constraint "issuance_template_field_schema_field_id_foreign";');

    this.addSql('alter table "verification_template_field" drop constraint "verification_template_field_schema_field_id_foreign";');

    this.addSql('alter table "issuance_template_field" drop constraint "issuance_template_field_template_id_foreign";');

    this.addSql('alter table "verification_template_field" drop constraint "verification_template_field_template_id_foreign";');

    this.addSql('drop table if exists "schema" cascade;');

    this.addSql('drop table if exists "schema_field" cascade;');

    this.addSql('drop table if exists "issuance_template" cascade;');

    this.addSql('drop table if exists "issuance_template_field" cascade;');

    this.addSql('drop table if exists "verification_template" cascade;');

    this.addSql('drop table if exists "verification_template_field" cascade;');
  }

}

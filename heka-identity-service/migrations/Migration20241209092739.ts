import { Migration } from '@mikro-orm/migrations';

export class Migration20241209092739 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "issuance_template" drop constraint "issuance_template_schema_id_foreign";');

    this.addSql('alter table "issuance_template_field" drop constraint "issuance_template_field_field_id_foreign";');

    this.addSql('alter table "issuance_template" alter column "protocol" type varchar(255) using ("protocol"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "protocol" set not null;');
    this.addSql('alter table "issuance_template" alter column "credential_format" type varchar(255) using ("credential_format"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "credential_format" set not null;');
    this.addSql('alter table "issuance_template" alter column "network" type varchar(255) using ("network"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "network" set not null;');
    this.addSql('alter table "issuance_template" alter column "did" type varchar(255) using ("did"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "did" set not null;');
    this.addSql('alter table "issuance_template" alter column "schema_id" type varchar(255) using ("schema_id"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "schema_id" set not null;');
    this.addSql('alter table "issuance_template" add constraint "issuance_template_schema_id_foreign" foreign key ("schema_id") references "schema" ("id") on update cascade;');

    this.addSql('alter table "issuance_template_field" add column "schema_field_id" varchar(255) not null;');
    this.addSql('alter table "issuance_template_field" add constraint "issuance_template_field_schema_field_id_foreign" foreign key ("schema_field_id") references "schema_field" ("id") on update cascade;');
    this.addSql('alter table "issuance_template_field" drop column "field_id";');
    this.addSql('alter table "issuance_template_field" drop column "name";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "issuance_template" drop constraint "issuance_template_schema_id_foreign";');

    this.addSql('alter table "issuance_template_field" drop constraint "issuance_template_field_schema_field_id_foreign";');

    this.addSql('alter table "issuance_template" alter column "protocol" type varchar(255) using ("protocol"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "protocol" drop not null;');
    this.addSql('alter table "issuance_template" alter column "credential_format" type varchar(255) using ("credential_format"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "credential_format" drop not null;');
    this.addSql('alter table "issuance_template" alter column "network" type varchar(255) using ("network"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "network" drop not null;');
    this.addSql('alter table "issuance_template" alter column "did" type varchar(255) using ("did"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "did" drop not null;');
    this.addSql('alter table "issuance_template" alter column "schema_id" type varchar(255) using ("schema_id"::varchar(255));');
    this.addSql('alter table "issuance_template" alter column "schema_id" drop not null;');
    this.addSql('alter table "issuance_template" add constraint "issuance_template_schema_id_foreign" foreign key ("schema_id") references "schema" ("id") on update cascade on delete set null;');

    this.addSql('alter table "issuance_template_field" add column "field_id" varchar(255) null, add column "name" varchar(255) null;');
    this.addSql('alter table "issuance_template_field" add constraint "issuance_template_field_field_id_foreign" foreign key ("field_id") references "schema_field" ("id") on update cascade on delete set null;');
    this.addSql('alter table "issuance_template_field" drop column "schema_field_id";');
  }

}

import { Migration } from '@mikro-orm/migrations';

export class Migration20241128190252 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "schema_registration" alter column "credential_format" type varchar(255) using ("credential_format"::varchar(255));');
    this.addSql('alter table "schema_registration" alter column "credential_format" drop not null;');
    this.addSql('alter table "schema_registration" alter column "network" type varchar(255) using ("network"::varchar(255));');
    this.addSql('alter table "schema_registration" alter column "network" drop not null;');
    this.addSql('alter table "schema_registration" alter column "credentials" type jsonb using ("credentials"::jsonb);');
    this.addSql('alter table "schema_registration" alter column "credentials" drop not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "schema_registration" alter column "credential_format" type varchar(255) using ("credential_format"::varchar(255));');
    this.addSql('alter table "schema_registration" alter column "credential_format" set not null;');
    this.addSql('alter table "schema_registration" alter column "network" type varchar(255) using ("network"::varchar(255));');
    this.addSql('alter table "schema_registration" alter column "network" set not null;');
    this.addSql('alter table "schema_registration" alter column "credentials" type jsonb using ("credentials"::jsonb);');
    this.addSql('alter table "schema_registration" alter column "credentials" set not null;');
  }

}

import { Migration } from '@mikro-orm/migrations';

export class Migration20241207142302 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "issuance_template_field" drop constraint "issuance_template_field_schema_field_id_foreign";');

    this.addSql('alter table "issuance_template_field" add column "field_id" varchar(255) null, add column "name" varchar(255) null;');
    this.addSql('alter table "issuance_template_field" add constraint "issuance_template_field_field_id_foreign" foreign key ("field_id") references "schema_field" ("id") on update cascade on delete set null;');
    this.addSql('alter table "issuance_template_field" drop column "schema_field_id";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "issuance_template_field" drop constraint "issuance_template_field_field_id_foreign";');

    this.addSql('alter table "issuance_template_field" add column "schema_field_id" varchar(255) not null;');
    this.addSql('alter table "issuance_template_field" add constraint "issuance_template_field_schema_field_id_foreign" foreign key ("schema_field_id") references "schema_field" ("id") on update cascade;');
    this.addSql('alter table "issuance_template_field" drop column "field_id";');
    this.addSql('alter table "issuance_template_field" drop column "name";');
  }

}

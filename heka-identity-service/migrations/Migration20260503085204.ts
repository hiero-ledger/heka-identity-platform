import { Migration } from '@mikro-orm/migrations';

export class Migration20260503085204 extends Migration {

  async up(): Promise<void> {
    this.addSql('create index "schema_owner_id_index" on "schema" ("owner_id");');

    this.addSql('create index "schema_registration_schema_id_index" on "schema_registration" ("schema_id");');

    this.addSql('create index "schema_field_schema_id_index" on "schema_field" ("schema_id");');

    this.addSql('create index "issuance_template_owner_id_index" on "issuance_template" ("owner_id");');
    this.addSql('create index "issuance_template_schema_id_index" on "issuance_template" ("schema_id");');

    this.addSql('create index "issuance_template_field_template_id_index" on "issuance_template_field" ("template_id");');
    this.addSql('create index "issuance_template_field_schema_field_id_index" on "issuance_template_field" ("schema_field_id");');

    this.addSql('create index "verification_template_owner_id_index" on "verification_template" ("owner_id");');
    this.addSql('create index "verification_template_schema_id_index" on "verification_template" ("schema_id");');

    this.addSql('create index "verification_template_field_template_id_index" on "verification_template_field" ("template_id");');
    this.addSql('create index "verification_template_field_schema_field_id_index" on "verification_template_field" ("schema_field_id");');
  }

  async down(): Promise<void> {
    this.addSql('drop index "schema_owner_id_index";');

    this.addSql('drop index "schema_registration_schema_id_index";');

    this.addSql('drop index "schema_field_schema_id_index";');

    this.addSql('drop index "issuance_template_owner_id_index";');
    this.addSql('drop index "issuance_template_schema_id_index";');

    this.addSql('drop index "issuance_template_field_template_id_index";');
    this.addSql('drop index "issuance_template_field_schema_field_id_index";');

    this.addSql('drop index "verification_template_owner_id_index";');
    this.addSql('drop index "verification_template_schema_id_index";');

    this.addSql('drop index "verification_template_field_template_id_index";');
    this.addSql('drop index "verification_template_field_schema_field_id_index";');
  }

}

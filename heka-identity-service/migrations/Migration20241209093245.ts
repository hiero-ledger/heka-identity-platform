import { Migration } from '@mikro-orm/migrations';

export class Migration20241209093245 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "issuance_template_field" alter column "value" type varchar(255) using ("value"::varchar(255));');
    this.addSql('alter table "issuance_template_field" alter column "value" set not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "issuance_template_field" alter column "value" type varchar(255) using ("value"::varchar(255));');
    this.addSql('alter table "issuance_template_field" alter column "value" drop not null;');
  }

}

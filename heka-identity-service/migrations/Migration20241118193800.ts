import { Migration } from '@mikro-orm/migrations';

export class Migration20241118193800 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "schema" alter column "is_hidden" type boolean using ("is_hidden"::boolean);');
  }

  async down(): Promise<void> {
    this.addSql('alter table "schema" alter column "is_hidden" type varchar(255) using ("is_hidden"::varchar(255));');
  }

}

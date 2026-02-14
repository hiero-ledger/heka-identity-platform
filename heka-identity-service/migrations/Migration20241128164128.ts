import { Migration } from '@mikro-orm/migrations';

export class Migration20241128164128 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "schema_registration" add column "did" varchar(255) not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "schema_registration" drop column "did";');
  }

}

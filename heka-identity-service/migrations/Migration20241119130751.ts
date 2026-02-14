import { Migration } from '@mikro-orm/migrations';

export class Migration20241119130751 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "user" add column "name" varchar(255) null, add column "logo" varchar(255) null, add column "background_color" varchar(255) null, add column "registered_at" timestamptz(0) null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "user" drop column "name";');
    this.addSql('alter table "user" drop column "logo";');
    this.addSql('alter table "user" drop column "background_color";');
    this.addSql('alter table "user" drop column "registered_at";');
  }

}

import { Migration } from '@mikro-orm/migrations';

export class Migration20241118194030 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "issuance_template" alter column "is_pinned" type boolean using ("is_pinned"::boolean);');

    this.addSql('alter table "verification_template" alter column "is_pinned" type boolean using ("is_pinned"::boolean);');
  }

  async down(): Promise<void> {
    this.addSql('alter table "issuance_template" alter column "is_pinned" type varchar(255) using ("is_pinned"::varchar(255));');

    this.addSql('alter table "verification_template" alter column "is_pinned" type varchar(255) using ("is_pinned"::varchar(255));');
  }

}

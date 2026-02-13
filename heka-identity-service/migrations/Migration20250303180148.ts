import { Migration } from '@mikro-orm/migrations';

export class Migration20250303180148 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "schema_registration" rename column "credential_format" to "registration_type";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "schema_registration" rename column "registration_type" to "credential_format";');
  }

}

import { Migration } from '@mikro-orm/migrations';

export class Migration20250313195439 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "schema_registration" rename column "registration_type" to "credential_format";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "schema_registration" rename column "credential_format" to "registration_type";');
  }

}

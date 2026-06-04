import { Migration } from '@mikro-orm/migrations';

export class Migration20260430201419 extends Migration {

  async up(): Promise<void> {
    this.addSql('create index "wallet_tenant_id_index" on "wallet" ("tenant_id");');
    this.addSql('create index "wallet_public_did_index" on "wallet" ("public_did");');
  }

  async down(): Promise<void> {
    this.addSql('drop index "wallet_tenant_id_index";');
    this.addSql('drop index "wallet_public_did_index";');
  }

}

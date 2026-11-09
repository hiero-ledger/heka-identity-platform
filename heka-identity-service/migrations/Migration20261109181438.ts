import { Migration } from '@mikro-orm/migrations';

// Token status lists are looked up by (tenant context, signing key) on every SD-JWT VC offer.
export class Migration20261109181438 extends Migration {

  async up(): Promise<void> {
    this.addSql(`create index "token_status_list_tenant_context_id_signer_key_id_index" on "token_status_list" ("tenant_context_id", "signer_key_id");`);
  }

  async down(): Promise<void> {
    this.addSql(`drop index if exists "token_status_list_tenant_context_id_signer_key_id_index";`);
  }

}

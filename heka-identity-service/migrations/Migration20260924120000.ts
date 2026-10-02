import { Migration } from '@mikro-orm/migrations';

// Schemas, templates and credential status lists are owned by the wallet (identity) instead of the
// user (actor). Existing rows cannot be mapped to a wallet and are dropped: backward compatibility
// is not required.
const OWNED_TABLES = ['schema', 'issuance_template', 'verification_template', 'credential_status_list'];

const DELETE_OWNED_ROWS = [
  'delete from "issuance_template_field";',
  'delete from "issuance_template";',
  'delete from "verification_template_field";',
  'delete from "verification_template";',
  'delete from "schema_registration";',
  'delete from "schema_field";',
  'delete from "schema";',
  'delete from "credential_status_list";',
];

export class Migration20260924120000 extends Migration {

  async up(): Promise<void> {
    DELETE_OWNED_ROWS.forEach((sql) => this.addSql(sql));

    for (const table of OWNED_TABLES) {
      this.addSql(`alter table "${table}" drop constraint "${table}_owner_id_foreign";`);
      this.addSql(`alter table "${table}" add constraint "${table}_owner_id_foreign" foreign key ("owner_id") references "wallet" ("id") on update cascade;`);
    }

    this.addSql('alter table "wallet" add column "display_name" varchar(255) null;');
  }

  async down(): Promise<void> {
    DELETE_OWNED_ROWS.forEach((sql) => this.addSql(sql));

    for (const table of OWNED_TABLES) {
      this.addSql(`alter table "${table}" drop constraint "${table}_owner_id_foreign";`);
      this.addSql(`alter table "${table}" add constraint "${table}_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;`);
    }

    this.addSql('alter table "wallet" drop column "display_name";');
  }

}

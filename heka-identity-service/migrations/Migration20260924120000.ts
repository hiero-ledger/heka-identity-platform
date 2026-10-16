import { Migration } from '@mikro-orm/migrations';

// Schemas are owned by the wallet instead of the user, so everyone acting in a shared wallet (e.g. the members
// of an organization) sees the same schemas. The user who created a schema is kept in `created_by_id`.
//
// Existing schemas move to a wallet of their creator: the wallet whose main DID registered the schema, otherwise
// the creator's wallet whose ID sorts first alphabetically (wallets have no creation date). Users who never changed
// role have exactly one wallet. No rows are deleted.
export class Migration20260924120000 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "schema" add column "created_by_id" varchar(255) null;');
    this.addSql('update "schema" set "created_by_id" = "owner_id";');
    this.addSql('alter table "schema" alter column "created_by_id" set not null;');
    this.addSql('alter table "schema" add constraint "schema_created_by_id_foreign" foreign key ("created_by_id") references "user" ("id") on update cascade;');

    this.addSql('alter table "schema" drop constraint "schema_owner_id_foreign";');
    this.addSql(`update "schema" s set "owner_id" = coalesce(
      (select w."id" from "wallet" w
        join "user_wallets" uw on uw."wallet_id" = w."id"
        join "schema_registration" r on r."did" = w."public_did"
        where uw."user_id" = s."created_by_id" and r."schema_id" = s."id"
        limit 1),
      (select min(uw."wallet_id") from "user_wallets" uw where uw."user_id" = s."created_by_id")
    );`);
    this.addSql('alter table "schema" add constraint "schema_owner_id_foreign" foreign key ("owner_id") references "wallet" ("id") on update cascade;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "schema" drop constraint "schema_owner_id_foreign";');
    this.addSql('update "schema" set "owner_id" = "created_by_id";');
    this.addSql('alter table "schema" add constraint "schema_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;');

    this.addSql('alter table "schema" drop constraint "schema_created_by_id_foreign";');
    this.addSql('alter table "schema" drop column "created_by_id";');
  }

}

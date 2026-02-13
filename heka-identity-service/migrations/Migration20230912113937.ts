import { Migration } from '@mikro-orm/migrations';

export class Migration20230912113937 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table "user" ("id" varchar(255) not null, "message_delivery_type" text check ("message_delivery_type" in (\'WebHook\', \'WebSocket\')) null, "web_hook" varchar(255) null, constraint "user_pkey" primary key ("id"));');

    this.addSql('create table "wallet" ("id" varchar(255) not null, "tenant_id" varchar(255) not null, "public_did" varchar(255) null, constraint "wallet_pkey" primary key ("id"));');

    this.addSql('create table "user_wallets" ("user_id" varchar(255) not null, "wallet_id" varchar(255) not null, constraint "user_wallets_pkey" primary key ("user_id", "wallet_id"));');

    this.addSql('alter table "user_wallets" add constraint "user_wallets_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "user_wallets" add constraint "user_wallets_wallet_id_foreign" foreign key ("wallet_id") references "wallet" ("id") on update cascade on delete cascade;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "user_wallets" drop constraint "user_wallets_user_id_foreign";');

    this.addSql('alter table "user_wallets" drop constraint "user_wallets_wallet_id_foreign";');

    this.addSql('drop table if exists "user" cascade;');

    this.addSql('drop table if exists "wallet" cascade;');

    this.addSql('drop table if exists "user_wallets" cascade;');
  }

}

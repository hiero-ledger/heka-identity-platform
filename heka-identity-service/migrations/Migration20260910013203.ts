import { Migration } from '@mikro-orm/migrations';

export class Migration20260910013203 extends Migration {

  async up(): Promise<void> {
    this.addSql(`create table "token_status_list" ("id" varchar(255) not null, "issuer" varchar(255) not null, "signer_key_id" varchar(255) not null, "tenant_context_id" varchar(255) not null, "signer" jsonb not null, "bits_per_status" int not null, "size" int not null, "allocated_count" int not null, "allocated_bitmap" text not null, "encoded_statuses" text not null, "token" text null, "token_issued_at" timestamptz null, "owner_id" varchar(255) not null, primary key ("id"));`);
    this.addSql(`alter table "token_status_list" add constraint "token_status_list_owner_id_foreign" foreign key ("owner_id") references "user" ("id");`);
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "token_status_list" cascade;`);
  }

}

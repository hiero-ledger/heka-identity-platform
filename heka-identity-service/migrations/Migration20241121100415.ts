import { Migration } from '@mikro-orm/migrations';

export class Migration20241121100415 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table "credential_status_list" ("id" varchar(255) not null, "issuer" varchar(255) not null, "encoded_list" varchar(255) not null, "size" int not null, "last_index" int not null, "purpose" varchar(255) not null, "owner_id" varchar(255) not null, constraint "credential_status_list_pkey" primary key ("id"));');

    this.addSql('alter table "credential_status_list" add constraint "credential_status_list_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;');
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "credential_status_list" cascade;');
  }

}

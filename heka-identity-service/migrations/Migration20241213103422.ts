import { Migration } from '@mikro-orm/migrations';

export class Migration20241213103422 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "verification_template" alter column "network" type varchar(255) using ("network"::varchar(255));');
    this.addSql('alter table "verification_template" alter column "network" drop not null;');
    this.addSql('alter table "verification_template" alter column "did" type varchar(255) using ("did"::varchar(255));');
    this.addSql('alter table "verification_template" alter column "did" drop not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "verification_template" alter column "network" type varchar(255) using ("network"::varchar(255));');
    this.addSql('alter table "verification_template" alter column "network" set not null;');
    this.addSql('alter table "verification_template" alter column "did" type varchar(255) using ("did"::varchar(255));');
    this.addSql('alter table "verification_template" alter column "did" set not null;');
  }

}

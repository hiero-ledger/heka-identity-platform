/**
 * Removes every schema of every account from the identity service database, together with what
 * hangs off them: schema fields, schema registrations, and the issuance / verification templates
 * built on those schemas (with their fields). Everything is deleted in one transaction.
 *
 * The identity service has no API for deleting schemas, so this talks to its Postgres directly.
 * Already issued credentials, ledger / registry objects and uploaded logo files are left as they
 * are. Run `yarn prepare-demo-user` afterwards to bring the demo schemas back.
 *
 * Environment (same names and defaults as the identity service):
 *   MIKRO_ORM_HOST      database host (default localhost)
 *   MIKRO_ORM_PORT      database port (default 5432)
 *   MIKRO_ORM_USER      database user (default heka)
 *   MIKRO_ORM_PASSWORD  database password (default: the local docker-compose one)
 *   MIKRO_ORM_DATABASE  database name (default heka-identity-service)
 *
 * Run: yarn remove-all-schemas [--yes]
 *   Without --yes it only prints what would be deleted.
 */
import { Client } from 'pg';

const confirmed = process.argv.includes('--yes');

/** Tables in deletion order: each one only references tables further down the list. */
const tables = [
  'issuance_template_field',
  'verification_template_field',
  'issuance_template',
  'verification_template',
  'schema_registration',
  'schema_field',
  'schema',
];

async function main() {
  const client = new Client({
    host: process.env.MIKRO_ORM_HOST || 'localhost',
    port: process.env.MIKRO_ORM_PORT
      ? parseInt(process.env.MIKRO_ORM_PORT, 10)
      : 5432,
    user: process.env.MIKRO_ORM_USER || 'heka',
    password: process.env.MIKRO_ORM_PASSWORD || 'heka1',
    database: process.env.MIKRO_ORM_DATABASE || 'heka-identity-service',
  });
  await client.connect();

  try {
    if (!confirmed) {
      for (const table of tables) {
        const { rows } = await client.query<{ count: string }>(
          `SELECT count(*) FROM "${table}"`,
        );
        console.log(`${table}: ${rows[0].count} row(s) would be deleted`);
      }
      console.log('Dry run. Re-run with --yes to delete.');
      return;
    }

    await client.query('BEGIN');
    try {
      for (const table of tables) {
        const { rowCount } = await client.query(`DELETE FROM "${table}"`);
        console.log(`${table}: ${rowCount ?? 0} row(s) deleted`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

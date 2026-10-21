/**
 * Deletes every schema of every account from the identity service database, with their fields,
 * registrations and the templates built on them, in one transaction. Uses SQL because the API
 * cannot delete schemas. Issued credentials, ledger objects and logo files stay.
 * Then run `yarn prepare-demo-user` to bring the demo schemas back.
 *
 * Env (identity service names): MIKRO_ORM_PASSWORD (required), MIKRO_ORM_HOST (local only,
 * default localhost), MIKRO_ORM_PORT (5432), MIKRO_ORM_USER (heka), MIKRO_ORM_DATABASE (heka-identity-service).
 *
 * Run: yarn remove-all-schemas [--yes] [--allow-remote]
 *   Without --yes it only prints what would be deleted; --allow-remote permits a non-local host.
 */
import { Client } from 'pg';

import { describeTarget, resolveOptions } from './remove-all-schemas.target';

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
  const { target, confirmed } = resolveOptions(process.env, process.argv);
  console.log(`Database: ${describeTarget(target)}`);

  const client = new Client(target);
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

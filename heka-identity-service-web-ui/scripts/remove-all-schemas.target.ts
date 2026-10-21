/** Database target of `remove-all-schemas`, kept apart from the script so it can be tested without Postgres. */
export interface RemoveAllSchemasTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface RemoveAllSchemasOptions {
  target: RemoveAllSchemasTarget;
  confirmed: boolean;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

/**
 * Reads the target from the identity service's MIKRO_ORM_* variables. Throws when the password is
 * unset or the host is not local without --allow-remote, so a stray env var can't aim it at a shared database.
 */
export const resolveOptions = (
  env: NodeJS.ProcessEnv,
  argv: string[],
): RemoveAllSchemasOptions => {
  const password = env.MIKRO_ORM_PASSWORD;
  if (!password) {
    throw new Error(
      'MIKRO_ORM_PASSWORD is not set: set it to the identity service database password',
    );
  }

  const host = env.MIKRO_ORM_HOST || 'localhost';
  if (!LOCAL_HOSTS.includes(host) && !argv.includes('--allow-remote')) {
    throw new Error(
      `Refusing to run against non-local host "${host}": pass --allow-remote if this is intended`,
    );
  }

  const port = env.MIKRO_ORM_PORT ? Number(env.MIKRO_ORM_PORT) : 5432;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `MIKRO_ORM_PORT is not a valid port: "${env.MIKRO_ORM_PORT}"`,
    );
  }

  return {
    target: {
      host,
      port,
      user: env.MIKRO_ORM_USER || 'heka',
      password,
      database: env.MIKRO_ORM_DATABASE || 'heka-identity-service',
    },
    confirmed: argv.includes('--yes'),
  };
};

/** The target without the password, for the log. */
export const describeTarget = ({
  user,
  host,
  port,
  database,
}: RemoveAllSchemasTarget): string => `${user}@${host}:${port}/${database}`;

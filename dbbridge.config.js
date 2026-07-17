import dotenv from 'dotenv';

dotenv.config();

const migrationPrefix = process.env.MIGRATION_PREFIX || 'service';

// In production the compiled migrations under dist/ are used (see Dockerfile);
// during development the TypeScript sources are loaded directly via tsx.
const isProduction = process.env.NODE_ENV === 'production';
const baseDir = isProduction ? './dist' : './src';

/** @type {import('db-bridge').DBBridgeConfig} */
const config = {
  connection: {
    dialect: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'microservice_dev',
  },
  migrations: {
    directory: `${baseDir}/infra/db/migrations`,
    tableName: `db_bridge_migrations_${migrationPrefix}`,
    prefix: migrationPrefix,
  },
  seeds: {
    directory: `${baseDir}/infra/db/seeds`,
    prefix: migrationPrefix,
  },
};

export default config;

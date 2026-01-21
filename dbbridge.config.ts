import type { DBBridgeConfig } from 'db-bridge';
import dotenv from 'dotenv';

dotenv.config();

const migrationPrefix = process.env.MIGRATION_PREFIX || 'service';

const config: DBBridgeConfig = {
  connection: {
    dialect: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'microservice_dev',
  },
  migrations: {
    directory: './src/infra/db/migrations',
    tableName: `db_bridge_migrations_${migrationPrefix}`,
    prefix: migrationPrefix,
  },
  seeds: {
    directory: './src/infra/db/seeds',
    prefix: migrationPrefix,
  },
};

export default config;

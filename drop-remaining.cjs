const { Client } = require('pg');
require('dotenv').config();

(async () => {
  // SECURITY: Use environment variables instead of hardcoded credentials
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT || 6543;
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME || 'postgres';

  if (!dbHost || !dbUser || !dbPassword) {
    console.error('ERROR: Missing required database environment variables.');
    console.error('Required: DB_HOST, DB_USER, DB_PASSWORD');
    console.error('Optional: DB_PORT (default: 6543), DB_NAME (default: postgres)');
    process.exit(1);
  }

  const client = new Client({
    host: dbHost,
    port: parseInt(dbPort, 10),
    user: dbUser,
    password: dbPassword,
    database: dbName,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const tables = ['listens', 'clips', 'topics', 'reports', 'moderation_flags', 'devices', 'profiles'];
    for (const table of tables) {
      await client.query(`DROP TABLE IF EXISTS public.${table} CASCADE`);
    }
    console.log('Dropped remaining tables.');
  } catch (error) {
    console.error('Error dropping tables:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();

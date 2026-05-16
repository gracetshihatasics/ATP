/**
 * Database connector
 * Connects to Postgres / MySQL / MongoDB and fetches:
 * - Schema / collections overview
 * - Sample test data (users, products, etc.)
 * - Row counts
 *
 * Uses dynamic imports so only the needed driver is loaded.
 */

export async function dbConnector(config) {
  const { type, host, port, database, username, password, connectionString, sampleLimit = 5 } = config;
  const dbType = type || "postgres";

  switch (dbType) {
    case "postgres": return connectPostgres(config, sampleLimit);
    case "mysql":    return connectMySQL(config, sampleLimit);
    case "mongodb":  return connectMongo(config, sampleLimit);
    default: throw new Error(`Unsupported DB type: ${dbType}`);
  }
}

async function connectPostgres(config, sampleLimit) {
  let pg;
  try { pg = await import("pg"); } catch { throw new Error("pg not installed — run: npm install pg"); }

  const { Client } = pg.default || pg;
  const client = new Client({
    connectionString: config.connectionString,
    host:     config.host,
    port:     parseInt(config.port) || 5432,
    database: config.database,
    user:     config.username,
    password: config.password,
    ssl:      config.ssl ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  // Get tables
  const tablesRes = await client.query(`
    SELECT table_name, 
           (SELECT COUNT(*) FROM information_schema.columns WHERE table_name=t.table_name AND table_schema='public') as col_count
    FROM information_schema.tables t
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
    LIMIT 30
  `);

  const tables  = [];
  for (const row of tablesRes.rows) {
    const countRes = await client.query(`SELECT COUNT(*) FROM "${row.table_name}"`).catch(() => ({ rows:[{count:0}] }));
    const count    = parseInt(countRes.rows[0].count);

    // Get columns
    const colRes = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position LIMIT 15
    `, [row.table_name]);

    // Get sample rows (only for small-ish tables)
    let sample = [];
    if (count > 0 && count < 100_000) {
      const sampleRes = await client.query(`SELECT * FROM "${row.table_name}" LIMIT ${sampleLimit}`).catch(() => ({ rows:[] }));
      sample = sampleRes.rows;
    }

    tables.push({
      name:    row.table_name,
      count,
      columns: colRes.rows.map(c => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === "YES" })),
      sample,
    });
  }

  await client.end();
  return { type: "postgres", tables, summary: `${tables.length} tables, ${tables.reduce((s,t) => s+t.count, 0)} total rows` };
}

async function connectMySQL(config, sampleLimit) {
  let mysql;
  try { mysql = await import("mysql2/promise"); } catch { throw new Error("mysql2 not installed — run: npm install mysql2"); }

  const conn = await mysql.default.createConnection({
    host:     config.host,
    port:     parseInt(config.port) || 3306,
    database: config.database,
    user:     config.username,
    password: config.password,
  });

  const [tableRows] = await conn.query("SHOW TABLES");
  const tables      = [];
  const tableKey    = Object.keys(tableRows[0] || {})[0];

  for (const row of tableRows.slice(0, 20)) {
    const tableName = row[tableKey];
    const [[{count}]] = await conn.query(`SELECT COUNT(*) as count FROM \`${tableName}\``).catch(() => [[{count:0}]]);
    const [cols]    = await conn.query(`DESCRIBE \`${tableName}\``).catch(() => [[]]);
    const [sample]  = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT ${sampleLimit}`).catch(() => [[]]);

    tables.push({
      name:    tableName,
      count:   parseInt(count),
      columns: cols.map(c => ({ name: c.Field, type: c.Type, nullable: c.Null === "YES" })),
      sample,
    });
  }

  await conn.end();
  return { type: "mysql", tables, summary: `${tables.length} tables` };
}

async function connectMongo(config, sampleLimit) {
  let mongo;
  try { mongo = await import("mongodb"); } catch { throw new Error("mongodb not installed — run: npm install mongodb"); }

  const { MongoClient } = mongo;
  const uri    = config.connectionString || `mongodb://${config.username}:${config.password}@${config.host}:${config.port || 27017}/${config.database}`;
  const client = new MongoClient(uri);
  await client.connect();

  const db          = client.db(config.database);
  const collections = await db.listCollections().toArray();
  const tables      = [];

  for (const col of collections.slice(0, 20)) {
    const collection = db.collection(col.name);
    const count      = await collection.countDocuments().catch(() => 0);
    const sample     = await collection.find().limit(sampleLimit).toArray().catch(() => []);
    tables.push({ name: col.name, count, columns: [], sample });
  }

  await client.close();
  return { type: "mongodb", tables, summary: `${tables.length} collections` };
}

export function dbToContext(data) {
  if (!data?.tables?.length) return "";
  const lines = [`Database (${data.type}) — ${data.summary}:`];
  for (const t of data.tables) {
    const cols   = t.columns.slice(0, 5).map(c => c.name).join(", ");
    const sample = t.sample?.[0] ? ` | sample: ${JSON.stringify(t.sample[0]).slice(0, 80)}` : "";
    lines.push(`- ${t.name} (${t.count} rows) — columns: ${cols}${sample}`);
  }
  return lines.join("\n");
}

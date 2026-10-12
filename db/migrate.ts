// applies every pending migration in db/migrations, sets the role's statement timeout, then exits
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/neon-serverless/migrator"
import { connectionPool, db } from "./index"

// how long one statement may run before Postgres cancels it
const STATEMENT_TIMEOUT_SECONDS = 30

// resolve the folder against this file, so the job does not depend on the working directory it was started from
const migrationsFolder = join(import.meta.dir, "migrations")

// drizzle records what it has applied in its own table, so an already-migrated database is a no-op
await migrate(db, { migrationsFolder })
console.log(`migrations applied from ${migrationsFolder}`)

// set the role's statement timeout in this database alone, and log a role that may not set it
try {
	const { rows: currentDatabaseRows } = await db.execute<{ databaseName: string }>(
		sql`select current_database() as "databaseName"`,
	)
	const databaseName = currentDatabaseRows[0]?.databaseName ?? ""
	const statementTimeout = `${STATEMENT_TIMEOUT_SECONDS}s`
	await db.execute(
		sql`alter role current_user in database ${sql.identifier(databaseName)} set statement_timeout = ${sql.raw(`'${statementTimeout}'`)}`,
	)
	console.log(`statement_timeout set to ${statementTimeout} for the role in ${databaseName}`)
} catch (error) {
	console.warn("statement_timeout was not set for the role", error)
}

// close the pool so the process exits on its own
await connectionPool.end()

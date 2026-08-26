// applies every pending migration in db/migrations, then exits
import { join } from "node:path"
import { migrate } from "drizzle-orm/neon-serverless/migrator"
import { connectionPool, db } from "./index"

// resolve the folder against this file, so the job does not depend on the working directory it was started from
const migrationsFolder = join(import.meta.dir, "migrations")

// drizzle records what it has applied in its own table, so an already-migrated database is a no-op
await migrate(db, { migrationsFolder })
console.log(`migrations applied from ${migrationsFolder}`)

// close the pool so the process exits on its own
await connectionPool.end()

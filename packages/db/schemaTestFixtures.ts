// the migrations folder and its SQL that the schema tests read
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// the folder of the generated migrations
export const migrationsDirectory = join(import.meta.dir, "migrations")

// the generated initial migration, read once for SQL-level assertions
export const initialSql = readFileSync(join(migrationsDirectory, firstMigrationFile()), "utf8")

/**
 * Returns every migration's SQL concatenated, for asserting on statements added after the initial migration.
 */
export function allMigrationsSql(): string {
	const sqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"))
	return sqlFiles.map((file) => readFileSync(join(migrationsDirectory, file), "utf8")).join("\n")
}

// the file name of the initial migration, the first .sql file in sort order
function firstMigrationFile(): string {
	const sqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"))
	return sqlFiles.sort()[0] ?? ""
}

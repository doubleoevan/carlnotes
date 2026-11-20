// tests that pin the rules every migration follows: pgvector first, the lock timeout, and the previous release's schema
import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { initialSql, migrationsDirectory } from "./schemaTestFixtures"

// pgvector must be enabled before the resources table that uses the vector embedding is created
test("the initial migration enables pgvector before the vector column", () => {
	expect(initialSql).toContain("CREATE EXTENSION IF NOT EXISTS vector")
	expect(initialSql.indexOf("CREATE EXTENSION IF NOT EXISTS vector")).toBeLessThan(initialSql.indexOf("vector(768)"))
})

// a migration waits on a table's lock for at most the lock timeout. the migrations before 0155 were written without it
test("every migration from 0155 on opens with the lock timeout", () => {
	const laterSqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql") && file >= "0155")
	expect(laterSqlFiles.length).toBeGreaterThan(0)
	for (const file of laterSqlFiles) {
		const firstLine = readFileSync(join(migrationsDirectory, file), "utf8").split("\n")[0]
		expect(`${file}: ${firstLine}`).toBe(`${file}: SET LOCAL lock_timeout = '3s';--> statement-breakpoint`)
	}
})

// a service rolled back one release still runs against the schema, so a migration that drops or renames says in its
// first comment that the previous release no longer reads what it removes. the migrations before 0169 were written
// without the comment
test("every migration from 0169 on that drops or renames says the previous release no longer reads it", () => {
	// a rename and a drop with no comment about the previous release are not safe to run
	const lockTimeoutLine = "SET LOCAL lock_timeout = '3s';--> statement-breakpoint"
	const renameSql = `${lockTimeoutLine}\nALTER TABLE "users" RENAME COLUMN "name" TO "full_name";`
	const dropSql = `${lockTimeoutLine}\n-- tidy up\nALTER TABLE "users" DROP COLUMN "name";`
	expect(isSafeForPreviousRelease(renameSql)).toBe(false)
	expect(isSafeForPreviousRelease(dropSql)).toBe(false)
	expect(isSafeForPreviousRelease(`${lockTimeoutLine}\nDROP TABLE "feeds";`)).toBe(false)

	// the same drop passes once its first comment says so, and a migration that only adds needs no comment
	const commentLine = `-- the previous release no longer reads users.name`
	expect(isSafeForPreviousRelease(`${lockTimeoutLine}\n${commentLine}\nALTER TABLE "users" DROP COLUMN "name";`)).toBe(
		true,
	)
	expect(isSafeForPreviousRelease(`${lockTimeoutLine}\nALTER TABLE "users" ADD COLUMN "nickname" text;`)).toBe(true)

	// every migration from this one on, named in the failure
	const laterSqlFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql") && file >= "0169")
	expect(laterSqlFiles.length).toBeGreaterThan(0)
	for (const file of laterSqlFiles) {
		const isSafe = isSafeForPreviousRelease(readFileSync(join(migrationsDirectory, file), "utf8"))
		expect(`${file}: ${isSafe}`).toBe(`${file}: true`)
	}
})

// whether a migration leaves the schema the previous release reads: it drops and renames nothing, or its first
// comment says the previous release no longer reads what it removes. a statement breakpoint is not a comment
function isSafeForPreviousRelease(migrationSql: string): boolean {
	if (!/\b(?:DROP COLUMN|DROP TABLE|RENAME)\b/i.test(migrationSql)) {
		return true
	}
	const firstComment = migrationSql.split("\n").find((line) => /^\s*--(?!>)/.test(line))
	return /previous release no longer reads/i.test(firstComment ?? "")
}

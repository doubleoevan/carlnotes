// the part of bun.lock the dependency checks read: each installed package under its key
import { readFileSync } from "node:fs"
import { z } from "zod"

// the lockfile's path
const LOCKFILE_PATH = "bun.lock"

// one package name in a lockfile key, with its scope if it has one
const PACKAGE_NAME_PATTERN = /(?:@[^/]+\/)?[^/]+/g

// the packages by key. a package's entry starts with its name and version, as name@version
const lockfileSchema = z.object({
	packages: z.record(z.string(), z.tuple([z.string()], z.unknown())),
})

/** The lockfile's installed packages. */
export type Lockfile = z.infer<typeof lockfileSchema>

/** One installed copy of a package: the lockfile key it sits under, and its version. */
export type InstalledPackageCopy = { packageKey: string; version: string }

/**
 * Returns the repo's lockfile. Throws an error if the file has another shape.
 */
export function readLockfile(): Lockfile {
	return toLockfile(readFileSync(LOCKFILE_PATH, "utf8"))
}

/**
 * Returns the installed packages in a lockfile's text. Throws an error if the text has another shape.
 */
export function toLockfile(lockfileText: string): Lockfile {
	return lockfileSchema.parse(Bun.JSONC.parse(lockfileText))
}

/**
 * Returns every package version the lockfile installs, each as name@version.
 */
export function toInstalledPackageVersions(lockfile: Lockfile): Set<string> {
	return new Set(Object.values(lockfile.packages).map(([packageVersion]) => packageVersion))
}

/**
 * Returns every copy of a package that the lockfile installs: the top-level copy, and each copy nested under a
 * workspace or under another package, with the key it sits under.
 */
export function toInstalledPackageCopies(lockfile: Lockfile, packageName: string): InstalledPackageCopy[] {
	// a copy's entry starts with the package's name and the at sign
	const versionPrefix = `${packageName}@`
	const packageCopyEntries = Object.entries(lockfile.packages).filter(([, [packageVersion]]) =>
		packageVersion.startsWith(versionPrefix),
	)

	// each copy's key, and its version, the text after the name and the at sign
	return packageCopyEntries.map(([packageKey, [packageVersion]]) => ({
		packageKey,
		version: packageVersion.slice(versionPrefix.length),
	}))
}

/**
 * Returns the names of the packages that a lockfile key nests its package under, the outermost first. A top-level
 * package's key names none.
 */
export function toParentPackageNames(packageKey: string): string[] {
	// a key is a path of package names, where a scoped name holds a slash of its own
	const packageNames = packageKey.match(PACKAGE_NAME_PATTERN) ?? []
	return packageNames.slice(0, -1)
}

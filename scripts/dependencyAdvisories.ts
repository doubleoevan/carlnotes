// the dependency advisory rules: the advisories `bun audit --json` lists, the reviewed allowlist, and one line for each
// high or critical advisory the allowlist does not name, each allowlist entry that matches no advisory, and each
// installed zod outside the development tools' own that an allowlisted advisory covers
import { readFileSync } from "node:fs"
import { z } from "zod"
import { type InstalledPackageCopy, type Lockfile, toInstalledPackageCopies, toParentPackageNames } from "./lockfile"

// where the reviewed allowlist lives
const ALLOWLIST_PATH = "dependency-advisories.json"

// the severities that fail a run
const FAILING_SEVERITIES = new Set(["high", "critical"])

// the package whose allowlist entry covers only the copies that development tools install
const ZOD_PACKAGE_NAME = "zod"

// the development tools whose own zod the allowlist's zod entry is for, as that entry's reason names them
export const ZOD_DEVELOPMENT_TOOL_NAMES = ["expo-mcp", "@expo/mcp-tunnel"]

// an advisory's GHSA id, the last part of its url. the registry's own number for an advisory changes over time, and
// its GHSA id stays
const GHSA_ID_PATTERN = /GHSA(?:-[0-9a-z]{4}){3}$/

// one advisory as the audit prints it, under its package's name
const auditAdvisorySchema = z.object({
	id: z.number(),
	url: z.string(),
	title: z.string(),
	severity: z.enum(["info", "low", "moderate", "high", "critical"]),
	vulnerable_versions: z.string(),
})

// the audit's output: each package's name over its advisories
const auditOutputSchema = z.record(z.string(), z.array(auditAdvisorySchema))

// the allowlist: for each reviewed advisory its GHSA id, its package, why it does not apply, and the day of the review
const allowlistSchema = z.array(
	z.strictObject({
		advisoryId: z.string().min(1),
		packageName: z.string().min(1),
		reason: z.string().min(1),
		reviewedAt: z.iso.date(),
	}),
)

// an advisory the audit lists: its GHSA id, its package, its severity, the versions it covers, its title, and its url
type DependencyAdvisory = {
	advisoryId: string
	packageName: string
	severity: z.infer<typeof auditAdvisorySchema>["severity"]
	vulnerableVersions: string
	title: string
	url: string
}

// one reviewed advisory on the allowlist
type AllowlistEntry = z.infer<typeof allowlistSchema>[number]

// the audit's advisories, the allowlist's entries, and the lockfile
type ToDependencyAdvisoryViolationsOptions = {
	advisories: DependencyAdvisory[]
	allowlist: AllowlistEntry[]
	lockfile: Lockfile
}

/**
 * Returns the repo's reviewed allowlist. Throws an error if an entry lacks a field or has an unknown one.
 */
export function readAllowlist(): AllowlistEntry[] {
	return toAllowlist(readFileSync(ALLOWLIST_PATH, "utf8"))
}

/**
 * Returns the entries in an allowlist's text. Throws an error if an entry lacks a field or has an unknown one.
 */
export function toAllowlist(allowlistText: string): AllowlistEntry[] {
	return allowlistSchema.parse(JSON.parse(allowlistText))
}

/**
 * Returns every advisory in the audit's JSON output, or undefined if the text is not that output.
 */
export function toDependencyAdvisories(auditOutputText: string): DependencyAdvisory[] | undefined {
	// read the text as JSON. a failed audit prints none
	let auditOutput: unknown
	try {
		auditOutput = JSON.parse(auditOutputText)
	} catch {
		return undefined
	}

	// reject output of another shape
	const auditOutputResult = auditOutputSchema.safeParse(auditOutput)
	if (!auditOutputResult.success) {
		return undefined
	}

	// list each package's advisories under its name. an advisory whose url names no GHSA id goes by the registry's number
	return Object.entries(auditOutputResult.data).flatMap(([packageName, auditAdvisories]) =>
		auditAdvisories.map((auditAdvisory) => ({
			advisoryId: GHSA_ID_PATTERN.exec(auditAdvisory.url)?.[0] ?? String(auditAdvisory.id),
			packageName,
			severity: auditAdvisory.severity,
			vulnerableVersions: auditAdvisory.vulnerable_versions,
			title: auditAdvisory.title,
			url: auditAdvisory.url,
		})),
	)
}

/**
 * Returns one line for each high or critical advisory the allowlist does not name, each allowlist entry that matches
 * no advisory the audit lists, and each installed zod outside the development tools' own that an allowlisted advisory
 * covers.
 */
export function toDependencyAdvisoryViolations({
	advisories,
	allowlist,
	lockfile,
}: ToDependencyAdvisoryViolationsOptions): string[] {
	// the high and critical advisories, split by whether the allowlist names them
	const allowlistKeys = new Set(allowlist.map(toAdvisoryKey))
	const failingAdvisories = advisories.filter((advisory) => FAILING_SEVERITIES.has(advisory.severity))
	const allowlistedAdvisories = failingAdvisories.filter((advisory) => allowlistKeys.has(toAdvisoryKey(advisory)))
	const openAdvisories = failingAdvisories.filter((advisory) => !allowlistKeys.has(toAdvisoryKey(advisory)))

	// the allowlist entries that match no advisory the audit lists
	const listedAdvisoryKeys = new Set(advisories.map(toAdvisoryKey))
	const staleAllowlistEntries = allowlist.filter(
		(allowlistEntry) => !listedAdvisoryKeys.has(toAdvisoryKey(allowlistEntry)),
	)

	// one line for each
	return [
		...openAdvisories.map(toOpenAdvisoryViolation),
		...staleAllowlistEntries.map(toStaleAllowlistEntryViolation),
		...toInstalledZodViolations(allowlistedAdvisories, lockfile),
	]
}

// the key an advisory and its allowlist entry share: the advisory's id and its package's name
function toAdvisoryKey({ advisoryId, packageName }: { advisoryId: string; packageName: string }): string {
	return `${advisoryId} ${packageName}`
}

// the line for a high or critical advisory the allowlist does not name
function toOpenAdvisoryViolation(advisory: DependencyAdvisory): string {
	return `${advisory.packageName} ${advisory.vulnerableVersions} has a ${advisory.severity} advisory that is not on the allowlist: ${advisory.advisoryId}, ${advisory.title}. ${advisory.url}`
}

// the line for an allowlist entry that matches no advisory the audit lists
function toStaleAllowlistEntryViolation(allowlistEntry: AllowlistEntry): string {
	return `the allowlist entry ${allowlistEntry.advisoryId} for ${allowlistEntry.packageName} matches no advisory the audit lists. remove it from ${ALLOWLIST_PATH}`
}

// one line for each installed zod outside the development tools' own that an allowlisted zod advisory covers
function toInstalledZodViolations(allowlistedAdvisories: DependencyAdvisory[], lockfile: Lockfile): string[] {
	// the allowlisted zod advisories, and each zod the lockfile installs for anything but a development tool
	const zodAdvisories = allowlistedAdvisories.filter((advisory) => advisory.packageName === ZOD_PACKAGE_NAME)
	const checkedZodCopies = toInstalledPackageCopies(lockfile, ZOD_PACKAGE_NAME).filter(
		(zodCopy) => !isDevelopmentToolCopy(zodCopy),
	)

	// one line for each copy an advisory covers
	return zodAdvisories.flatMap((zodAdvisory) =>
		checkedZodCopies
			.filter((zodCopy) => Bun.semver.satisfies(zodCopy.version, zodAdvisory.vulnerableVersions))
			.map(
				(zodCopy) =>
					`zod ${zodCopy.version} at the lockfile key ${zodCopy.packageKey} is among the versions ${zodAdvisory.advisoryId} covers, ${zodAdvisory.vulnerableVersions}. the allowlist entry is for the zod that ${ZOD_DEVELOPMENT_TOOL_NAMES.join(" and ")} install. move this zod past the fix`,
			),
	)
}

// whether the lockfile nests a copy under one of the development tools, at any depth
function isDevelopmentToolCopy(zodCopy: InstalledPackageCopy): boolean {
	return toParentPackageNames(zodCopy.packageKey).some((parentPackageName) =>
		ZOD_DEVELOPMENT_TOOL_NAMES.includes(parentPackageName),
	)
}

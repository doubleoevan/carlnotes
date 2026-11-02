// the feature roots, adopted examples, and exact primitive exceptions for the component convention
import { existsSync, readdirSync } from "node:fs"
import { posix, resolve } from "node:path"
import { isInsideFolder } from "./workspaces"

/** The feature-component roots covered by this rollout. */
export const COMPONENT_ROOTS = [
	"apps/web/src/components",
	"apps/web/src/pages",
	"apps/mobile/src/components",
	"packages/core/components",
]

/** The components whose conventions preflight enforces. */
export const ADOPTED_COMPONENTS = [
	"apps/web/src/components/common/IconButton.tsx",
	"apps/web/src/components/common/LinkPreviewCard.tsx",
	"apps/web/src/components/common/LinkPreviewLoading.tsx",
	"apps/web/src/components/common/ThinkingLine.tsx",
	"apps/mobile/src/components/common/ThinkingLine.tsx",
	"packages/core/components/ThinkingLine.tsx",
]

/** An exact exception and the API that requires its exports to stay together. */
export type ComponentException = { filePath: string; reason: string }

// the compound component families with shared public APIs
const COMPOUND_PRIMITIVES: ComponentException[] = [
	{ filePath: "apps/web/src/components/primitives/accordion.tsx", reason: "Radix accordion family" },
	{ filePath: "apps/web/src/components/primitives/dialog.tsx", reason: "Radix dialog family" },
	{ filePath: "apps/web/src/components/primitives/popover.tsx", reason: "Radix popover family" },
	{ filePath: "apps/web/src/components/primitives/select.tsx", reason: "Radix select family" },
	{ filePath: "apps/web/src/components/primitives/tooltip.tsx", reason: "Radix tooltip family" },
	{ filePath: "apps/mobile/src/components/primitives/select.tsx", reason: "Native select family" },
]

/**
 * Lists candidate paths without reading generated, excluded, or installed source.
 */
export function listComponentFiles(): string[] {
	return COMPONENT_ROOTS.flatMap(listFolder).sort()
}

/**
 * Resolves contracted implementations and the explicitly designated compound families.
 */
export async function readComponentExceptions(): Promise<ComponentException[]> {
	// read the same trusted contract metadata used by the existing parity check
	const exceptions = [...COMPOUND_PRIMITIVES]
	const contractFolder = "packages/nightshift/components"
	for (const fileName of readdirSync(contractFolder).sort()) {
		if (!fileName.endsWith(".ts") || fileName.endsWith(".test.ts")) {
			continue
		}
		// derive implementation paths from the contract's supported platforms
		const contract = await import(resolve(contractFolder, fileName))
		const componentName = fileName.slice(0, -3)
		for (const platform of contract.platforms ?? []) {
			if (platform !== "web" && platform !== "mobile") {
				throw new Error(`Unknown contract platform: ${fileName}: ${platform}`)
			}
			// retain the contract path as the exception's reason
			exceptions.push({
				filePath: `apps/${platform}/src/components/primitives/${componentName}.tsx`,
				reason: `Nightshift contract: ${contractFolder}/${fileName}`,
			})
		}
	}
	// reject stale or repeated implementation designations
	validateComponentPaths(exceptions)
	return exceptions
}

/**
 * Returns the exclusion reason, or null for a feature-component candidate.
 */
export function componentExclusion(filePath: string, exceptions: ComponentException[]): string | null {
	// classify known framework files before the feature-root boundary
	if (filePath.startsWith("apps/web/src/routes/") || filePath.startsWith("apps/mobile/app/")) {
		return "framework route"
	}
	if (/\/(?:client|router|index|main)\.tsx$/.test(filePath)) {
		return "entrypoint"
	}
	// leave stories under their own conventions
	if (/\.stories\.tsx$/.test(filePath)) {
		return "story"
	}
	// exclude tests and their supporting fixtures
	if (
		/(?:\.(?:test|spec)\.tsx|TestFixtures\.tsx)$/.test(filePath) ||
		/\/(?:__tests__|__fixtures__|fixtures)\//.test(filePath)
	) {
		return "test or fixture"
	}
	// exclude generated source and paths outside the rollout
	if (/\.(?:gen|generated)\.tsx?$/.test(filePath) || /\/(?:generated|__generated__)\//.test(filePath)) {
		return "generated source"
	}
	if (!filePath.endsWith(".tsx") || !COMPONENT_ROOTS.some((folder) => isInsideFolder(filePath, folder))) {
		return "outside feature-component roots"
	}
	// apply exact contract and compound exceptions within the feature roots
	return exceptions.find((exception) => exception.filePath === filePath)?.reason ?? null
}

/**
 * Rejects missing, repeated, or undocumented exact paths before a check can lose coverage.
 */
export function validateComponentPaths(entries: ComponentException[]): void {
	// each designation names a real path once and explains its purpose
	const paths = new Set<string>()
	for (const { filePath, reason } of entries) {
		if (!reason.trim() || paths.has(filePath) || !existsSync(filePath)) {
			throw new Error(`Invalid component designation: ${filePath} (missing path, duplicate, or empty reason)`)
		}
		paths.add(filePath)
	}
}

// collect candidate paths from source folders
function listFolder(folder: string): string[] {
	const paths: string[] = []
	for (const entry of readdirSync(folder, { withFileTypes: true })) {
		const filePath = posix.join(folder, entry.name)
		// skip installed and built output while descending through source
		if (entry.isDirectory() && !["node_modules", "dist", ".expo", ".tsbuild"].includes(entry.name)) {
			paths.push(...listFolder(filePath))
		} else if (entry.isFile() && entry.name.endsWith(".tsx")) {
			paths.push(filePath)
		}
	}
	return paths
}

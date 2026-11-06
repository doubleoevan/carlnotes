// what bun run mcp-views:freeze changes in the repo: the version manifest, and the current version one above it
import { MCP_VIEWS, type McpView } from "@carlnotes/contracts/mcpViews"
import type { StoredMcpViewVersion } from "@carlnotes/contracts/mcpViewVersions"

// the manifest the api registers its stored versions from, and the module that holds the current version
export const MCP_VIEW_VERSIONS_PATH = "packages/contracts/mcpViewVersions.json"
export const MCP_VIEWS_SOURCE_PATH = "packages/contracts/mcpViews.ts"

/**
 * Returns the manifest's text with a version added.
 */
export function toFrozenManifestText(
	storedMcpViewVersions: StoredMcpViewVersion[],
	frozenVersion: StoredMcpViewVersion,
): string {
	return `${JSON.stringify([...storedMcpViewVersions, frozenVersion], null, "\t")}\n`
}

/**
 * Returns the module's source with the current version raised past the frozen one, or throws an error if the module no
 * longer names the frozen version.
 */
export function toRaisedVersionSource(mcpViewsSource: string, frozenVersionNumber: number): string {
	const versionLine = `export const MCP_VIEW_VERSION = ${frozenVersionNumber}\n`
	if (!mcpViewsSource.includes(versionLine)) {
		throw new Error(`${MCP_VIEWS_SOURCE_PATH} does not name version ${frozenVersionNumber}`)
	}
	return mcpViewsSource.replace(versionLine, `export const MCP_VIEW_VERSION = ${frozenVersionNumber + 1}\n`)
}

/**
 * Returns the MCP views a frozen bundle holds: the comma list a run names, or every current MCP view. Throws an error
 * on a name no MCP view has.
 */
export function toFrozenMcpViews(mcpViewList: string | undefined): McpView[] {
	if (mcpViewList === undefined) {
		return [...MCP_VIEWS]
	}
	// read the comma list and throw an error on an unknown name
	return mcpViewList.split(",").map((mcpViewName) => {
		const mcpView = MCP_VIEWS.find((knownMcpView) => knownMcpView === mcpViewName)
		if (!mcpView) {
			throw new Error(`${mcpViewName} is not an MCP view`)
		}
		return mcpView
	})
}

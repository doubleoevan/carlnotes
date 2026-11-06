// store the MCP view bundle a host locks to: upload it to this environment's object storage, add it to the version
// manifest, and raise the current version. --bundle names a folder built from another commit, and --mcp-views the MCP
// views that bundle holds, if they are not the current ones

import { parseArgs } from "node:util"
import { MCP_VIEW_VERSION } from "@carlnotes/contracts/mcpViews"
import { STORED_MCP_VIEW_VERSIONS } from "@carlnotes/contracts/mcpViewVersions"
import { toMcpViewBundleKey, uploadAttachment } from "@carlnotes/db/store"
import { MCP_VIEWS_BUNDLE_ROOT } from "../apps/api/bundlePaths"
import {
	MCP_VIEW_VERSIONS_PATH,
	MCP_VIEWS_SOURCE_PATH,
	toFrozenManifestText,
	toFrozenMcpViews,
	toRaisedVersionSource,
} from "./mcpViewFreeze"

// the bundle to store, and the MCP views it holds
const { values: freezeOptions } = parseArgs({
	options: { bundle: { type: "string" }, "mcp-views": { type: "string" } },
})
const frozenVersion = { version: MCP_VIEW_VERSION, mcpViews: toFrozenMcpViews(freezeOptions["mcp-views"]) }

// check the module before anything uploads
const raisedVersionSource = toRaisedVersionSource(await Bun.file(MCP_VIEWS_SOURCE_PATH).text(), MCP_VIEW_VERSION)

// build the current bundle, unless the run names one
if (!freezeOptions.bundle) {
	const buildExitCode = await Bun.spawn(["bun", "run", "--cwd", "apps/web", "build:mcp-views"], {
		stdout: "inherit",
		stderr: "inherit",
	}).exited
	if (buildExitCode !== 0) {
		process.exit(buildExitCode)
	}
}

// upload the bundle's two files
const bundleRoot = freezeOptions.bundle ?? MCP_VIEWS_BUNDLE_ROOT
const mcpViewScript = await Bun.file(`${bundleRoot}/mcpViews.js`).bytes()
const mcpViewStylesheet = await Bun.file(`${bundleRoot}/mcpViews.css`).bytes()
await uploadAttachment(toMcpViewBundleKey(MCP_VIEW_VERSION, "mcpViews.js"), mcpViewScript, "text/javascript")
await uploadAttachment(toMcpViewBundleKey(MCP_VIEW_VERSION, "mcpViews.css"), mcpViewStylesheet, "text/css")

// name the stored version in the manifest, and move the current version past it
await Bun.write(MCP_VIEW_VERSIONS_PATH, toFrozenManifestText(STORED_MCP_VIEW_VERSIONS, frozenVersion))
await Bun.write(MCP_VIEWS_SOURCE_PATH, raisedVersionSource)
console.log(
	`mcp views freeze: stored version ${MCP_VIEW_VERSION} from ${bundleRoot}, current is ${MCP_VIEW_VERSION + 1}`,
)

// the workspace folders, package names, and types the repo checks share: both apps, the app packages, the api and its
// type-only importers, the universal packages, and a test file's path
import { posix } from "node:path"

/** The web app's folder. */
export const WEB_APP_FOLDER = "apps/web"

/** The mobile app's folder. */
export const MOBILE_APP_FOLDER = "apps/mobile"

/** The app's Expo Router routes, where a walk of what the app reaches starts. */
export const MOBILE_ROUTES_FOLDER = `${MOBILE_APP_FOLDER}/app`

/** The app's Expo config, which declares the app version. */
export const MOBILE_APP_CONFIG_PATH = `${MOBILE_APP_FOLDER}/app.config.ts`

/** The app packages' names. */
export const APP_PACKAGE_NAMES = new Set([
	"@carlnotes/web",
	"@carlnotes/api",
	"@carlnotes/worker",
	"@carlnotes/docs",
	"@carlnotes/mobile",
])

/** The api package's name. */
export const API_PACKAGE_NAME = "@carlnotes/api"

/** The workspaces that import the api as types only: the api client package and the web app. */
export const TYPE_ONLY_API_IMPORTERS = new Set(["packages/client", WEB_APP_FOLDER])

/** The universal packages: a browser, a phone, and the server all load them. */
export const UNIVERSAL_WORKSPACE_FOLDERS = new Set([
	"packages/contracts",
	"packages/client",
	"packages/core",
	"packages/nightshift",
])

/** The universal packages by name: each folder's basename under the @carlnotes scope. */
export const UNIVERSAL_PACKAGE_NAMES = new Set(
	[...UNIVERSAL_WORKSPACE_FOLDERS].map((folder) => `@carlnotes/${posix.basename(folder)}`),
)

/** A test file or a test fixtures module, matched by the end of its path. */
export const TEST_FILE_PATTERN = /(?:\.test\.tsx?|TestFixtures\.ts)$/

/** A story file, which no app ships. */
export const STORY_FILE_PATTERN = /\.stories\.tsx?$/

/**
 * A workspace's package.json and tsconfig: its repo folder, its name, its dependency names, and the folders its tsconfig
 * references.
 */
export type Workspace = {
	folder: string
	name: string
	dependencies: string[]
	devDependencies: string[]
	references: string[]
}

/** A source file under a workspace: its path from the repo root, and its text. */
export type SourceFile = { filePath: string; fileText: string }

/**
 * Returns whether a repo-relative path is the folder or sits inside it.
 */
export function isInsideFolder(path: string, folder: string): boolean {
	return path === folder || path.startsWith(`${folder}/`)
}

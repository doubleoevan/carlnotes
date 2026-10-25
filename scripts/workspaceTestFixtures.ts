// a small workspace map for the boundary tests: two universal packages, a server package, and three apps
import type { Workspace } from "./workspaces"

/** The contracts package, universal, with no workspace dependency. */
export const CONTRACTS_WORKSPACE: Workspace = {
	folder: "packages/contracts",
	name: "@carlnotes/contracts",
	dependencies: ["zod"],
	devDependencies: [],
	references: [],
}

/** The api client package, universal, with the api as a type-only dev dependency. */
export const CLIENT_WORKSPACE: Workspace = {
	folder: "packages/client",
	name: "@carlnotes/client",
	dependencies: ["@carlnotes/contracts", "hono"],
	devDependencies: ["@carlnotes/api"],
	references: ["apps/api", "packages/contracts"],
}

/** The database package, a server package. */
export const DB_WORKSPACE: Workspace = {
	folder: "packages/db",
	name: "@carlnotes/db",
	dependencies: ["@carlnotes/contracts", "drizzle-orm"],
	devDependencies: [],
	references: ["packages/contracts"],
}

/** The api app. */
export const API_WORKSPACE: Workspace = {
	folder: "apps/api",
	name: "@carlnotes/api",
	dependencies: ["@carlnotes/contracts", "@carlnotes/db"],
	devDependencies: [],
	references: ["packages/contracts", "packages/db"],
}

/** The web app. */
export const WEB_WORKSPACE: Workspace = {
	folder: "apps/web",
	name: "@carlnotes/web",
	dependencies: ["@carlnotes/client", "@carlnotes/contracts"],
	devDependencies: [],
	references: ["packages/client", "packages/contracts"],
}

/** The mobile app, which depends on the universal packages only. */
export const MOBILE_WORKSPACE: Workspace = {
	folder: "apps/mobile",
	name: "@carlnotes/mobile",
	dependencies: ["@carlnotes/client", "@carlnotes/contracts"],
	devDependencies: [],
	references: ["packages/client", "packages/contracts"],
}

/** Every fixture workspace. */
export const FIXTURE_WORKSPACES = [
	CONTRACTS_WORKSPACE,
	CLIENT_WORKSPACE,
	DB_WORKSPACE,
	API_WORKSPACE,
	WEB_WORKSPACE,
	MOBILE_WORKSPACE,
]

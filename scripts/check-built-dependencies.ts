// fail on a package the web server build leaves external that apps/web does not declare in dependencies. the
// production image links only those, so an undeclared one fails every page render. the rule lives in
// builtDependencies.ts. run it after build:ui
import { existsSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { UI_SERVER_ENTRY } from "../apps/api/bundlePaths"
import { toUndeclaredBuiltImports } from "./builtDependencies"
import { WEB_APP_FOLDER } from "./workspaces"

// the web server build's folder, and the web app's runtime dependency names
const webServerBuildFolder = posix.dirname(UI_SERVER_ENTRY)
const webPackageJson = JSON.parse(readFileSync(`${WEB_APP_FOLDER}/package.json`, "utf8")) as {
	dependencies?: Record<string, string>
}
const dependencyNames = new Set(Object.keys(webPackageJson.dependencies ?? {}))

// list every built JavaScript file, and fail if build:ui never wrote the folder or any file in it
const builtFilePaths = existsSync(webServerBuildFolder)
	? [...new Bun.Glob("**/*.js").scanSync(webServerBuildFolder)].sort()
	: []
if (builtFilePaths.length === 0) {
	console.error(`built dependencies: ${webServerBuildFolder} holds no JavaScript. run bun run build:ui first`)
	process.exit(1)
}

// pair each file's repo path with its text
const builtFiles = builtFilePaths.map((builtFilePath) => {
	const filePath = posix.join(webServerBuildFolder, builtFilePath)
	return { filePath, fileText: readFileSync(filePath, "utf8") }
})

// report every undeclared package, then fail
const undeclaredImports = toUndeclaredBuiltImports({ builtFiles, dependencyNames })
if (undeclaredImports.length > 0) {
	console.error(
		`built dependencies: the web server build imports packages ${WEB_APP_FOLDER}/package.json does not declare:`,
	)
	for (const undeclaredImport of undeclaredImports) {
		console.error(`  ${undeclaredImport}`)
	}
	process.exit(1)
}

// report a clean run
console.log(`built dependencies: ${builtFiles.length} built files import only declared packages`)

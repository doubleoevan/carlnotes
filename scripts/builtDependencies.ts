// the built output rule: every package a built file leaves external is declared in the app's dependencies
import { isPackageImportPath, toPackageName } from "./importBoundaries"

/** A built file: its path, and its JavaScript. */
export type BuiltFile = { filePath: string; fileText: string }

// the built files, and the app's runtime dependency names
type ToUndeclaredBuiltImportsOptions = { builtFiles: BuiltFile[]; dependencyNames: Set<string> }

/**
 * Returns one line for each package a built file imports that the app does not declare, naming the first file.
 */
export function toUndeclaredBuiltImports({ builtFiles, dependencyNames }: ToUndeclaredBuiltImportsOptions): string[] {
	// the first built file that imports each package, read by Bun's transpiler, which skips strings and comments
	const transpiler = new Bun.Transpiler({ loader: "js" })
	const importFilePathByPackageName = new Map<string, string>()
	for (const builtFile of builtFiles) {
		for (const scannedImport of transpiler.scanImports(builtFile.fileText)) {
			// keep a package import, skipping relative paths and built-in modules
			const packageName = toPackageName(scannedImport.path)
			if (isPackageImportPath(scannedImport.path) && !importFilePathByPackageName.has(packageName)) {
				importFilePathByPackageName.set(packageName, builtFile.filePath)
			}
		}
	}

	// name each package the app does not declare
	const undeclaredImports = [...importFilePathByPackageName].filter(
		([packageName]) => !dependencyNames.has(packageName),
	)
	return undeclaredImports.map(([packageName, filePath]) => `${filePath} imports ${packageName}`)
}

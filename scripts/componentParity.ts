// the component parity rules the check script runs over the Nightshift contracts and the apps' files. every contract
// has an implementation at the mirrored path in each app it names, each implementation imports a value from its
// contract and has a story, and an app imports a contract only from its implementation, a story, or a test
import type { ComponentPlatform } from "@carlnotes/nightshift/componentPlatforms"
import { COMPONENT_CONTRACT_IMPORT_PREFIX, STORY_FILE_SUFFIX, toParsedImports } from "./importBoundaries"
import { MOBILE_APP_FOLDER, type SourceFile, TEST_FILE_PATTERN, WEB_APP_FOLDER } from "./workspaces"

/** The folder that holds one contract module per component. */
export const COMPONENT_CONTRACTS_FOLDER = "packages/nightshift/components"

// the folder of each app's primitives, where an app's implementation of each component contract lives
const APP_PRIMITIVES_FOLDER = "src/components/primitives"

// the app folder each platform's implementation lives in, and the platforms in that order
const APP_FOLDERS: Record<ComponentPlatform, string> = { web: WEB_APP_FOLDER, mobile: MOBILE_APP_FOLDER }
const COMPONENT_PLATFORMS = Object.keys(APP_FOLDERS) as ComponentPlatform[]

/** A contract: its component's name, and the platforms it exports, or undefined if it exports none. */
export type ComponentContract = { componentName: string; platforms: ComponentPlatform[] | undefined }

// the contracts and the apps' source files the check runs on
type CheckComponentParityOptions = { contracts: ComponentContract[]; sourceFiles: SourceFile[] }

/**
 * Returns every parity violation, one line each, naming the contract or the file it concerns.
 */
export function checkComponentParity({ contracts, sourceFiles }: CheckComponentParityOptions): string[] {
	// the files by path, and each contract's own rules
	const sourceFilesByPath = new Map(sourceFiles.map((sourceFile) => [sourceFile.filePath, sourceFile]))
	const contractViolations = contracts.flatMap((contract) => toContractViolations({ contract, sourceFilesByPath }))

	// the imports of a contract from anywhere but its implementation, a story, or a test
	const contractsByName = new Map(contracts.map((contract) => [contract.componentName, contract]))
	const importViolations = sourceFiles.flatMap((sourceFile) =>
		toContractImportViolations({ sourceFile, contractsByName }),
	)
	return [...contractViolations, ...importViolations]
}

// one contract, and the apps' files by path
type ToContractViolationsOptions = { contract: ComponentContract; sourceFilesByPath: Map<string, SourceFile> }

// one contract's violations: no platforms, a missing implementation, an implementation without its import or its
// story, and an orphan
function toContractViolations({ contract, sourceFilesByPath }: ToContractViolationsOptions): string[] {
	// a contract names the apps that keep an implementation of it
	const contractPath = toContractPath(contract.componentName)
	if (!contract.platforms) {
		return [`${contractPath} exports no platforms. a contract names the apps that keep an implementation of it`]
	}

	// check each app. an implementation is an orphan if the contract does not name its app, and a named app has the
	// implementation, its import, and its story
	const violations: string[] = []
	const namedPlatforms = new Set(contract.platforms)
	for (const platform of COMPONENT_PLATFORMS) {
		const implementationPath = toImplementationPath({ platform, componentName: contract.componentName })
		const implementationFile = sourceFilesByPath.get(implementationPath)

		// an implementation for a platform the contract does not name is an orphan
		if (!namedPlatforms.has(platform)) {
			if (implementationFile) {
				violations.push(`${implementationPath} is an orphan. ${contractPath} names no ${platform} implementation`)
			}
			continue
		}

		// a named platform has its implementation, which imports its contract and has a story beside it
		if (!implementationFile) {
			violations.push(`${contractPath} has no ${platform} implementation. expected ${implementationPath}`)
			continue
		}
		violations.push(
			...toImplementationViolations({ implementationFile, componentName: contract.componentName, sourceFilesByPath }),
		)
	}
	return violations
}

// an implementation, its component's name, and the apps' files by path
type ToImplementationViolationsOptions = {
	implementationFile: SourceFile
	componentName: string
	sourceFilesByPath: Map<string, SourceFile>
}

// an implementation's violations: it imports no value from its contract, or it has no story beside it
function toImplementationViolations({
	implementationFile,
	componentName,
	sourceFilesByPath,
}: ToImplementationViolationsOptions): string[] {
	// a value import from the contract. an implementation that imports only its types builds its own classes
	const violations: string[] = []
	const contractImportPath = `${COMPONENT_CONTRACT_IMPORT_PREFIX}${componentName}`
	const isImportingContract = toParsedImports(implementationFile.fileText).some(
		(parsedImport) => parsedImport.importPath === contractImportPath && !parsedImport.isTypeOnly,
	)
	if (!isImportingContract) {
		violations.push(`${implementationFile.filePath} imports no value from ${contractImportPath}, its contract`)
	}

	// the story beside the implementation
	const storyPath = implementationFile.filePath.replace(/\.tsx$/, STORY_FILE_SUFFIX)
	if (!sourceFilesByPath.has(storyPath)) {
		violations.push(`${implementationFile.filePath} has no story. expected ${storyPath}`)
	}
	return violations
}

// one file, and the contracts that exist by component name
type ToContractImportViolationsOptions = { sourceFile: SourceFile; contractsByName: Map<string, ComponentContract> }

// one file's contract imports that break a rule: a contract that does not exist, or a contract imported from a file
// other than its implementation, a story, or a test
function toContractImportViolations({ sourceFile, contractsByName }: ToContractImportViolationsOptions): string[] {
	const violations: string[] = []
	for (const { importPath } of toParsedImports(sourceFile.fileText)) {
		// skip an import of anything but a contract
		if (!importPath.startsWith(COMPONENT_CONTRACT_IMPORT_PREFIX)) {
			continue
		}

		// an import of a contract that does not exist
		const componentName = importPath.slice(COMPONENT_CONTRACT_IMPORT_PREFIX.length)
		const contract = contractsByName.get(componentName)
		if (!contract) {
			violations.push(
				`${sourceFile.filePath} imports ${importPath}, and ${toContractPath(componentName)} does not exist`,
			)
			continue
		}

		// a story, a test, and the implementation itself may import the contract
		const isStoryOrTest = sourceFile.filePath.endsWith(STORY_FILE_SUFFIX) || TEST_FILE_PATTERN.test(sourceFile.filePath)
		if (isStoryOrTest || isImplementationPath({ filePath: sourceFile.filePath, componentName })) {
			continue
		}
		violations.push(
			`${sourceFile.filePath} imports ${importPath}. an app imports a contract only from its implementation, a story, or a test. ${toImporterImplementationHint({ filePath: sourceFile.filePath, contract })}`,
		)
	}
	return violations
}

// the file that imports a contract, and that contract
type ToImporterImplementationHintOptions = { filePath: string; contract: ComponentContract }

// what the importing file reaches the contract through instead: its own app's implementation, if the contract names
// that app
function toImporterImplementationHint({ filePath, contract }: ToImporterImplementationHintOptions): string {
	// the app the importing file sits in
	const importerPlatform = COMPONENT_PLATFORMS.find((platform) => filePath.startsWith(`${APP_FOLDERS[platform]}/`))
	if (!importerPlatform || !contract.platforms?.includes(importerPlatform)) {
		return `${toContractPath(contract.componentName)} names no implementation in this app`
	}

	// the implementation in that app
	return `import ${toImplementationPath({ platform: importerPlatform, componentName: contract.componentName })} instead`
}

// the path of a contract's module
function toContractPath(componentName: string): string {
	return `${COMPONENT_CONTRACTS_FOLDER}/${componentName}.ts`
}

// the platform and the component whose implementation path is built
type ToImplementationPathOptions = { platform: ComponentPlatform; componentName: string }

// the mirrored path of a contract's implementation in one platform's app
function toImplementationPath({ platform, componentName }: ToImplementationPathOptions): string {
	return `${APP_FOLDERS[platform]}/${APP_PRIMITIVES_FOLDER}/${componentName}.tsx`
}

// the file and the component whose implementation paths it is checked against
type IsImplementationPathOptions = { filePath: string; componentName: string }

// whether a file is the implementation of a component in either app
function isImplementationPath({ filePath, componentName }: IsImplementationPathOptions): boolean {
	return COMPONENT_PLATFORMS.some((platform) => toImplementationPath({ platform, componentName }) === filePath)
}

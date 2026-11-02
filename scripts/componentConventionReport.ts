// combine structural findings with the built-in Biome diagnostics
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "bun"
import { z } from "zod"
import { type ComponentException, componentExclusion } from "./componentConventionFiles"
import { type ComponentAnalysis, type ComponentDiagnostic, checkComponentConventions } from "./componentConventions"

// only these Biome diagnostics represent expected convention findings
const BIOME_RULES = [
	"style/useComponentExportOnlyModules",
	"style/useFilenamingConvention",
	"correctness/noNestedComponentDefinitions",
]
const BIOME_PATH = fileURLToPath(new URL("../node_modules/.bin/biome", import.meta.url))

// validate the tool response before normalizing its exit status
const biomeResultSchema = z.object({
	summary: z.object({ diagnosticsNotPrinted: z.number(), skipped: z.number() }),
	diagnostics: z.array(
		z.object({
			category: z.string(),
			message: z.string(),
			location: z.object({ path: z.string(), start: z.object({ line: z.number(), column: z.number() }) }),
		}),
	),
})

/** The classification and findings for one candidate path. */
type ComponentFileReport = {
	filePath: string
	classification: "checked" | "excluded" | "review"
	reason?: string
	primaryName?: string
	diagnostics: ComponentDiagnostic[]
}

/** The deterministic inventory and its independently counted file and diagnostic totals. */
export type ComponentReport = {
	files: ComponentFileReport[]
	counts: { checked: number; excluded: number; review: number; violating: number; diagnostics: number }
}

/**
 * Checks selected files and reports both syntax findings and the delegated lint diagnostics.
 */
export function buildComponentReport({
	filePaths,
	exceptions,
}: {
	filePaths: string[]
	exceptions: ComponentException[]
}): ComponentReport {
	// classify paths before reading their source
	const files = [...filePaths].sort().map((filePath): ComponentFileReport => {
		const reason = componentExclusion(filePath, exceptions)
		if (reason) {
			return { filePath, classification: "excluded", reason, diagnostics: [] }
		}
		const analysis = readComponentAnalysis(filePath)
		return { filePath, ...analysis }
	})
	// unknown component identities still receive the built-in lint checks
	const checkedPaths = files.filter((file) => file.classification !== "excluded").map((file) => file.filePath)
	const lintFindings = readBiomeFindings(checkedPaths)
	for (const file of files) {
		mergeFindings(file, lintFindings.get(file.filePath) ?? [])
	}
	return { files, counts: reportCounts(files) }
}

/**
 * Returns whether strict validation found a violation or an unresolved identity.
 */
export function hasComponentFindings(report: ComponentReport): boolean {
	return report.counts.violating > 0 || report.counts.review > 0
}

/**
 * Formats the same classifications and findings emitted by the JSON report.
 */
export function formatComponentReport(report: ComponentReport): string {
	const lines = report.files.flatMap((file) => [
		`${file.filePath}: ${file.classification}${file.reason ? ` (${file.reason})` : ""}`,
		...file.diagnostics.map(
			(diagnostic) => `  ${diagnostic.line}:${diagnostic.column} ${diagnostic.rule}: ${diagnostic.message}`,
		),
	])
	const { checked, excluded, review, violating, diagnostics } = report.counts
	lines.push(
		`components: ${checked} checked, ${excluded} excluded, ${review} require review, ${violating} violating files, ${diagnostics} diagnostics`,
	)
	return lines.join("\n")
}

// parser failures name the affected source even when no inventory can be completed
function readComponentAnalysis(filePath: string): ComponentAnalysis {
	try {
		return checkComponentConventions({ filePath, fileText: readFileSync(filePath, "utf8") })
	} catch (error) {
		throw new Error(`${filePath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
	}
}

// run a focused lint pass, preserving operational errors instead of turning them into success
function readBiomeFindings(filePaths: string[]): Map<string, ComponentDiagnostic[]> {
	const findings = new Map<string, ComponentDiagnostic[]>()
	if (!filePaths.length) {
		return findings
	}
	const command = [
		BIOME_PATH,
		"lint",
		"--config-path=biome.components.json",
		"--reporter=json",
		"--max-diagnostics=none",
		...BIOME_RULES.map((rule) => `--only=${rule}`),
		...filePaths,
	]
	const lint = spawnSync(command, { stdout: "pipe", stderr: "pipe" })
	const parsed = biomeResultSchema.safeParse(parseLintJson(lint.stdout.toString()))
	if (!parsed.success || lint.exitCode > 1 || lint.signalCode) {
		throw new Error(`Biome component scan failed: ${lint.stderr.toString() || parsed.error?.message}`)
	}
	// reject truncated reports and incomplete scans
	const { summary, diagnostics } = parsed.data
	if (summary.diagnosticsNotPrinted || summary.skipped || (lint.exitCode !== 0 && !diagnostics.length)) {
		throw new Error("Biome component scan was incomplete")
	}
	// accept only the delegated convention categories
	for (const diagnostic of diagnostics) {
		if (!BIOME_RULES.some((rule) => diagnostic.category === `lint/${rule}`)) {
			throw new Error(`Biome component scan failed: ${diagnostic.message}`)
		}
		// match diagnostics to the selected repository paths
		const filePath = filePaths.find((candidate) => resolve(candidate) === resolve(diagnostic.location.path))
		if (!filePath) {
			throw new Error(`Biome reported an unselected path: ${diagnostic.location.path}`)
		}
		// normalize locations and group findings by file
		const entries = findings.get(filePath) ?? []
		entries.push({
			rule: diagnostic.category,
			line: Math.max(1, diagnostic.location.start.line),
			column: Math.max(1, diagnostic.location.start.column),
			message: diagnostic.message,
		})
		findings.set(filePath, entries)
	}
	return findings
}

// a malformed response is a tool error even when no source violation was printed
function parseLintJson(output: string): unknown {
	try {
		return JSON.parse(output)
	} catch {
		throw new Error("Biome did not return a valid JSON report")
	}
}

// avoid repeating a filename violation already handled by the built-in rule
function mergeFindings(file: ComponentFileReport, lintFindings: ComponentDiagnostic[]): void {
	const hasFilenameFinding = lintFindings.some((finding) => finding.rule === "lint/style/useFilenamingConvention")
	const structuralFindings = file.diagnostics.filter(
		(finding) => !hasFilenameFinding || finding.rule !== "component/primary-name",
	)
	file.diagnostics = [...structuralFindings, ...lintFindings].sort(
		(left, right) => left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule),
	)
}

// count files once even when several rules report them
function reportCounts(files: ComponentFileReport[]): ComponentReport["counts"] {
	return {
		checked: files.filter((file) => file.classification === "checked").length,
		excluded: files.filter((file) => file.classification === "excluded").length,
		review: files.filter((file) => file.classification === "review").length,
		violating: files.filter((file) => file.diagnostics.some((diagnostic) => diagnostic.rule !== "component/review"))
			.length,
		diagnostics: files.reduce((count, file) => count + file.diagnostics.length, 0),
	}
}

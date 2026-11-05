// exercise the actual command and Biome binary against an isolated feature tree
import { afterAll, beforeAll, expect, test } from "bun:test"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "bun"
import { ADOPTED_COMPONENTS, COMPONENT_ROOTS, readComponentExceptions } from "./componentConventionFiles"
import type { ComponentReport } from "./componentConventionReport"

// the command always uses the repository's installed Biome, even in a fixture root
const COMMAND_PATH = resolve("scripts/check-component-conventions.ts")
const fixtureRoot = mkdtempSync(join(tmpdir(), "carlnotes-component-conventions-"))
const probePath = "apps/web/src/components/common/FeatureCard.tsx"
const validComponent = "export function FeatureCard() { return <div /> }"

beforeAll(async () => {
	// retain real configuration while supplying only the fixture's source files
	const rootConfig = JSON.parse(readFileSync("biome.json", "utf8"))
	rootConfig.vcs.enabled = false
	writeFixture("biome.json", JSON.stringify(rootConfig))
	copyFileSync("biome.components.json", join(fixtureRoot, "biome.components.json"))
	writeFixture("package.json", JSON.stringify({ dependencies: { react: "19.3.1" } }))
	for (const folder of COMPONENT_ROOTS) {
		mkdirSync(join(fixtureRoot, folder), { recursive: true })
	}
	// contract fixtures preserve the mapping while keeping application modules out of the test
	for (const name of ["button", "badge", "expandable-row"]) {
		writeFixture(`packages/nightshift/components/${name}.ts`, 'export const platforms = ["web", "mobile"]')
	}
	for (const exception of await readComponentExceptions()) {
		writeFixture(exception.filePath, "invalid source deliberately excluded")
	}
	// populate the strict selection with valid components
	for (const filePath of ADOPTED_COMPONENTS) {
		const name = filePath.split("/").at(-1)?.replace(".tsx", "")
		writeFixture(filePath, `export function ${name}() { return <div /> }`)
	}
})

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }))

// report mode keeps the same findings without blocking legacy files
test("report and strict modes agree on findings and differ only in status", () => {
	writeFixture(probePath, "export function FeatureCard() { return <div /> }; export function Row() { return <span /> }")
	const reported = runCommand(["--report", "--json", probePath])
	const checked = runCommand(["--check", "--json", probePath])
	expect(reported.exitCode, reported.stderr).toBe(0)
	expect(checked.exitCode).toBe(1)
	expect(JSON.parse(reported.stdout)).toEqual(JSON.parse(checked.stdout))
	expect(JSON.parse(reported.stdout).files[0].diagnostics).toContainEqual(
		expect.objectContaining({ rule: "component/primary-count" }),
	)
})

// built-in rules own export purity and nested component identity
test("delegates runtime exports and unstable child definitions to Biome", () => {
	const cases = [
		{ source: `${validComponent}; export function label() { return "label" }`, rule: "useComponentExportOnlyModules" },
		{
			source: `${validComponent}; export function useLabel() { return "label" }`,
			rule: "useComponentExportOnlyModules",
		},
		{ source: `${validComponent}; export const LABEL = "label"`, rule: "useComponentExportOnlyModules" },
		{
			source: "export function FeatureCard() { function Child() { return <span /> }; return <Child /> }",
			rule: "noNestedComponentDefinitions",
		},
		{
			source:
				'import {memo} from "react"; export function FeatureCard() { const Child = memo(() => <span />); return <Child /> }',
			rule: "noNestedComponentDefinitions",
		},
	]
	for (const { source, rule } of cases) {
		writeFixture(probePath, source)
		const checked = runCommand(["--check", "--json", probePath])
		expect(checked.exitCode).toBe(1)
		// preserve the built-in rule identifier and source location
		const report: ComponentReport = JSON.parse(checked.stdout)
		expect(report.files[0]?.diagnostics.some((finding) => finding.rule.endsWith(rule))).toBe(true)
		expect(report.files[0]?.diagnostics.every((finding) => finding.line >= 1 && finding.column >= 1)).toBe(true)
	}
})

// private support and render callbacks retain their valid identities
test("accepts private support, supplied adapters, and ordinary callbacks", () => {
	writeFixture(
		probePath,
		'const LABEL = "label"; function Child() { return <span>{LABEL}</span> }; export function FeatureCard({Text}: {Text: React.ComponentType}) { const handleClick = () => {}; return <div onClick={handleClick}><Child /><Text />{[1].map(number => <span key={number}>{number}</span>)}</div> }',
	)
	expect(runCommand(["--check", "--json", probePath]).exitCode).toBe(0)
})

// a matching type cannot satisfy the primary component's filename
test("structural name and props diagnostics cover the built-in gaps without duplicate names", () => {
	writeFixture(
		probePath,
		"export type FeatureCard = string; type Props = {label: string}; export function Wrong(props: Props) { return <div /> }",
	)
	const report: ComponentReport = JSON.parse(runCommand(["--report", "--json", probePath]).stdout)
	expect(report.files[0]?.diagnostics.map((finding) => finding.rule)).toEqual([
		"component/primary-name",
		"component/props-name",
	])
	// let Biome own a filename mismatch it can identify directly
	writeFixture(probePath, "export function Wrong() { return <div /> }")
	const mismatch: ComponentReport = JSON.parse(runCommand(["--report", "--json", probePath]).stdout)
	expect(mismatch.files[0]?.diagnostics.map((finding) => finding.rule)).toEqual(["lint/style/useFilenamingConvention"])
})

// the default strict set remains independent of unrelated legacy findings
test("limits strict defaults to adopted files and keeps inventory deterministic", () => {
	writeFixture(probePath, "export function FeatureCard() { return <div /> }; export function Row() { return <span /> }")
	expect(runCommand(["--check", "--json"]).exitCode).toBe(0)
	const first = runCommand(["--report", "--json"])
	const second = runCommand(["--report", "--json"])
	expect(first.exitCode).toBe(0)
	expect(first.stdout).toBe(second.stdout)
	// count each candidate once and keep machine-specific paths out of the report
	const report: ComponentReport = JSON.parse(first.stdout)
	expect(report.counts.checked + report.counts.excluded + report.counts.review).toBe(report.files.length)
	expect(report.counts.violating).toBe(1)
	expect(first.stdout).not.toContain(fixtureRoot)
	// the same default selection fails if an adopted component regresses
	const adoptedPath = ADOPTED_COMPONENTS[0]
	if (!adoptedPath) {
		throw new Error("The adopted fixture set is empty")
	}
	// restore the adopted fixture after checking its failure
	const original = readFileSync(join(fixtureRoot, adoptedPath), "utf8")
	writeFixture(adoptedPath, `${original}; export function Extra() { return <div /> }`)
	try {
		expect(runCommand(["--check", "--json"]).exitCode).toBe(1)
	} finally {
		writeFixture(adoptedPath, original)
	}
})

// keep unknown wrappers visible in report and strict modes
test("requires review for opaque wrappers", () => {
	writeFixture(probePath, "export const FeatureCard = enhance(() => <div />)")
	expect(runCommand(["--report", "--json", probePath]).exitCode).toBe(0)
	const checked = runCommand(["--check", "--json", probePath])
	expect(checked.exitCode).toBe(1)
	expect(JSON.parse(checked.stdout).counts.review).toBe(1)
})

// source and configuration failures are operational failures in both modes
test("rejects parse errors, missing files, bad options, and empty strict selections", () => {
	writeFixture(probePath, "export function {")
	const malformed = runCommand(["--report", probePath])
	expect(malformed.exitCode).toBe(2)
	expect(malformed.stderr).toContain(probePath)
	expect(runCommand(["--check", "missing.tsx"]).exitCode).toBe(2)
	expect(runCommand(["--check", "--unknown"]).exitCode).toBe(2)
	expect(runCommand(["--check", "--report"]).exitCode).toBe(2)
	// reject selections with no checked source or repeated paths
	writeFixture("apps/web/src/components/common/FeatureCard.test.tsx", "malformed but excluded")
	expect(runCommand(["--check", "apps/web/src/components/common/FeatureCard.test.tsx"]).exitCode).toBe(2)
	writeFixture(probePath, validComponent)
	expect(runCommand(["--check", probePath, probePath]).exitCode).toBe(2)
})

// propagate failures in the lint configuration and exact exceptions
test("propagates invalid Biome configuration and missing compound designations", () => {
	const configPath = join(fixtureRoot, "biome.components.json")
	const config = readFileSync(configPath, "utf8")
	writeFileSync(configPath, '{"linter": {"invalid": true}}')
	// restore the configuration after verifying the operational error
	try {
		expect(runCommand(["--report", probePath]).exitCode).toBe(2)
	} finally {
		writeFileSync(configPath, config)
	}
	// reject a compound exception whose designated file is missing
	const compoundPath = "apps/web/src/components/primitives/dialog.tsx"
	rmSync(join(fixtureRoot, compoundPath))
	expect(runCommand(["--report", probePath]).exitCode).toBe(2)
	writeFixture(compoundPath, "excluded")
})

// write only temporary fixture source, with its repository-relative path
function writeFixture(filePath: string, contents: string): void {
	const target = join(fixtureRoot, filePath)
	mkdirSync(dirname(target), { recursive: true })
	writeFileSync(target, contents)
}

// execute the real command in the fixture repository
function runCommand(args: string[]): { exitCode: number; stdout: string; stderr: string } {
	const command = spawnSync([process.execPath, COMMAND_PATH, ...args], {
		cwd: fixtureRoot,
		stdout: "pipe",
		stderr: "pipe",
	})
	return { exitCode: command.exitCode, stdout: command.stdout.toString(), stderr: command.stderr.toString() }
}

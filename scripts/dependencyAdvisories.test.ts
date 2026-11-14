// the dependency advisory rules on a saved audit: an allowlisted high advisory passes, an open one fails, a stale
// allowlist entry fails, lower severities pass, a zod outside the development tools' own inside an allowlisted advisory
// fails, and CI runs the check in a job of its own
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
	readAllowlist,
	toAllowlist,
	toDependencyAdvisories,
	toDependencyAdvisoryViolations,
	ZOD_DEVELOPMENT_TOOL_NAMES,
} from "./dependencyAdvisories"
import { type Lockfile, toLockfile } from "./lockfile"

// a trimmed copy of what `bun audit --json` printed for this repo on 2026-11-13: three high advisories beside a
// moderate and a low one
const AUDIT_OUTPUT_TEXT = JSON.stringify({
	"@tiptap/core": [
		{
			id: 1158508,
			url: "https://github.com/advisories/GHSA-cp6q-959q-f8rh",
			title: "Tiptap: mergeAttributes() turns an own __proto__ key into inherited executable DOM attributes",
			severity: "moderate",
			vulnerable_versions: ">=2.0.0-alpha.0 <3.30.4",
			cwe: ["CWE-79", "CWE-1321"],
			cvss: { score: 0, vectorString: null },
		},
		{
			id: 1193728,
			url: "https://github.com/advisories/GHSA-j95f-988m-3j2f",
			title: "Tiptap: Quadratic ReDoS in block and inline Markdown attribute parsing",
			severity: "high",
			vulnerable_versions: ">=3.7.0 <3.30.5",
			cwe: ["CWE-400", "CWE-1333"],
			cvss: { score: 0, vectorString: null },
		},
	],
	"basic-ftp": [
		{
			id: 1240853,
			url: "https://github.com/advisories/GHSA-c475-qrg2-pj4r",
			title: "basic-ftp: Quadratic-time CPU denial of service in Client.list() Unix directory-listing parser",
			severity: "high",
			vulnerable_versions: "<=6.2.0",
			cwe: ["CWE-1333"],
			cvss: { score: 0, vectorString: null },
		},
	],
	deepmerge: [
		{
			id: 1243505,
			url: "https://github.com/advisories/GHSA-gcqx-w48m-w2h4",
			title: "deepmerge mergeObject() allows prototype poisoning of returned objects",
			severity: "low",
			vulnerable_versions: ">=4.2.0 <=4.3.1",
			cwe: ["CWE-1321"],
			cvss: { score: 5.3, vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N" },
		},
	],
	zod: [
		{
			id: 1243066,
			url: "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
			title: "Zod can exhaust memory while validating oversized constrained collections",
			severity: "high",
			vulnerable_versions: "<4.6.6",
			cwe: ["CWE-770"],
			cvss: { score: 7.5, vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" },
		},
	],
})

// the saved audit's advisories
const ADVISORIES = toDependencyAdvisories(AUDIT_OUTPUT_TEXT) ?? []

// an allowlist that names the saved audit's three high advisories
const ALLOWLIST = [
	{ advisoryId: "GHSA-j95f-988m-3j2f", packageName: "@tiptap/core", reason: "no parser", reviewedAt: "2026-11-13" },
	{ advisoryId: "GHSA-c475-qrg2-pj4r", packageName: "basic-ftp", reason: "evals only", reviewedAt: "2026-11-13" },
	{ advisoryId: "GHSA-mrhx-c7xc-m3w5", packageName: "zod", reason: "a dev tool's zod", reviewedAt: "2026-11-13" },
]

// a lockfile whose workspaces install one zod as their own, beside the zod 3 a development tool installs
function toLockfileWithZod(workspaceZodVersion: string): Lockfile {
	return toLockfile(`{
  "lockfileVersion": 2,
  "workspaces": {
    "": { "name": "carlnotes" },
    "apps/api": { "name": "@carlnotes/api" },
  },
  "packages": {
    "zod": ["zod@${workspaceZodVersion}", "", {}, "sha512-g8W2=="],
    "@expo/mcp-tunnel/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
  }
}`)
}

// the lockfile as the repo has it: the workspaces' own zod past the fix
const LOCKFILE = toLockfileWithZod("4.6.7")

test("the saved audit reads as one advisory per package and id, each under its GHSA id", () => {
	// five advisories in all, and zod's with its package, its GHSA id, and the versions it covers
	expect(ADVISORIES).toHaveLength(5)
	expect(ADVISORIES.find((advisory) => advisory.packageName === "zod")).toEqual({
		advisoryId: "GHSA-mrhx-c7xc-m3w5",
		packageName: "zod",
		severity: "high",
		vulnerableVersions: "<4.6.6",
		title: "Zod can exhaust memory while validating oversized constrained collections",
		url: "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5",
	})
})

test("an audit with no advisory reads as an empty list, and output that is not the audit's JSON as none", () => {
	// a clean audit prints an empty object
	expect(toDependencyAdvisories("{}\n")).toEqual([])

	// a failed request prints nothing, and other shapes are not the audit's
	expect(toDependencyAdvisories("")).toBeUndefined()
	expect(toDependencyAdvisories("error: POST /-/npm/v1/security/advisories/bulk - ConnectionRefused")).toBeUndefined()
	expect(toDependencyAdvisories("[]")).toBeUndefined()
	expect(toDependencyAdvisories('{ "zod": [{ "id": 1243066, "severity": "severe" }] }')).toBeUndefined()
})

test("every high advisory on the allowlist passes", () => {
	expect(toDependencyAdvisoryViolations({ advisories: ADVISORIES, allowlist: ALLOWLIST, lockfile: LOCKFILE })).toEqual(
		[],
	)
})

test("a high advisory the allowlist does not name fails, listing the advisory", () => {
	// the allowlist without its basic-ftp entry
	const allowlist = ALLOWLIST.filter((allowlistEntry) => allowlistEntry.packageName !== "basic-ftp")
	const violations = toDependencyAdvisoryViolations({ advisories: ADVISORIES, allowlist, lockfile: LOCKFILE })
	expect(violations).toEqual([
		"basic-ftp <=6.2.0 has a high advisory that is not on the allowlist: GHSA-c475-qrg2-pj4r, basic-ftp: Quadratic-time CPU denial of service in Client.list() Unix directory-listing parser. https://github.com/advisories/GHSA-c475-qrg2-pj4r",
	])
})

test("a critical advisory fails as a high one does", () => {
	// the saved audit with its low advisory raised to critical
	const advisories = toDependencyAdvisories(AUDIT_OUTPUT_TEXT.replace('"low"', '"critical"')) ?? []
	const violations = toDependencyAdvisoryViolations({ advisories, allowlist: ALLOWLIST, lockfile: LOCKFILE })
	expect(violations).toHaveLength(1)
	expect(violations[0]).toStartWith("deepmerge >=4.2.0 <=4.3.1 has a critical advisory that is not on the allowlist")
})

test("an allowlist entry that matches no advisory the audit lists fails naming the entry", () => {
	// an entry for an advisory the audit no longer lists, and one that names the wrong package for its advisory
	const allowlist = [
		...ALLOWLIST,
		{ advisoryId: "GHSA-5x38-2vff-x55p", packageName: "node-forge", reason: "build tooling", reviewedAt: "2026-11-13" },
		{ advisoryId: "GHSA-c475-qrg2-pj4r", packageName: "get-uri", reason: "evals only", reviewedAt: "2026-11-13" },
	]
	expect(toDependencyAdvisoryViolations({ advisories: ADVISORIES, allowlist, lockfile: LOCKFILE })).toEqual([
		"the allowlist entry GHSA-5x38-2vff-x55p for node-forge matches no advisory the audit lists. remove it from dependency-advisories.json",
		"the allowlist entry GHSA-c475-qrg2-pj4r for get-uri matches no advisory the audit lists. remove it from dependency-advisories.json",
	])
})

test("an audit that lists only moderate and low advisories passes with an empty allowlist", () => {
	// the saved audit without its high advisories
	const advisories = ADVISORIES.filter((advisory) => advisory.severity !== "high")
	expect(advisories.map((advisory) => advisory.severity)).toEqual(["moderate", "low"])
	expect(toDependencyAdvisoryViolations({ advisories, allowlist: [], lockfile: LOCKFILE })).toEqual([])
})

test("a workspace's own zod that the allowlisted advisory covers fails, although the advisory is allowlisted", () => {
	// the workspaces' zod one patch below the fix
	const violations = toDependencyAdvisoryViolations({
		advisories: ADVISORIES,
		allowlist: ALLOWLIST,
		lockfile: toLockfileWithZod("4.6.5"),
	})
	expect(violations).toHaveLength(1)
	expect(violations[0]).toStartWith(
		"zod 4.6.5 at the lockfile key zod is among the versions GHSA-mrhx-c7xc-m3w5 covers, <4.6.6.",
	)

	// the first fixed version passes
	expect(
		toDependencyAdvisoryViolations({
			advisories: ADVISORIES,
			allowlist: ALLOWLIST,
			lockfile: toLockfileWithZod("4.6.6"),
		}),
	).toEqual([])
})

test("a copy of zod that one workspace installs under its own name fails too", () => {
	// the api keeps an old zod of its own while the top-level copy is past the fix
	const lockfile = toLockfile(`{
  "workspaces": { "": { "name": "carlnotes" }, "apps/api": { "name": "@carlnotes/api" } },
  "packages": {
    "zod": ["zod@4.6.7", "", {}, "sha512-g8W2=="],
    "@carlnotes/api/zod": ["zod@4.5.0", "", {}, "sha512-old0=="],
    "@expo/mcp-tunnel/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
  }
}`)

	// the api's copy fails, and the top-level copy and the development tool's do not
	const violations = toDependencyAdvisoryViolations({ advisories: ADVISORIES, allowlist: ALLOWLIST, lockfile })
	expect(violations).toHaveLength(1)
	expect(violations[0]).toStartWith("zod 4.5.0 at the lockfile key @carlnotes/api/zod is among the versions")
})

test("a zod that a package outside the development tools installs fails, although the advisory is allowlisted", () => {
	// a production package keeps a zod 3 of its own, and so does a package whose name only ends as a development tool's
	const lockfile = toLockfile(`{
  "workspaces": { "": { "name": "carlnotes" }, "apps/api": { "name": "@carlnotes/api" } },
  "packages": {
    "zod": ["zod@4.6.7", "", {}, "sha512-g8W2=="],
    "@modelcontextprotocol/sdk/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
    "@other/expo-mcp/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
    "@expo/mcp-tunnel/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
  }
}`)

	// each of the two fails under its lockfile key, and the development tool's copy does not
	const violations = toDependencyAdvisoryViolations({ advisories: ADVISORIES, allowlist: ALLOWLIST, lockfile })
	expect(violations).toEqual([
		"zod 3.25.76 at the lockfile key @modelcontextprotocol/sdk/zod is among the versions GHSA-mrhx-c7xc-m3w5 covers, <4.6.6. the allowlist entry is for the zod that expo-mcp and @expo/mcp-tunnel install. move this zod past the fix",
		"zod 3.25.76 at the lockfile key @other/expo-mcp/zod is among the versions GHSA-mrhx-c7xc-m3w5 covers, <4.6.6. the allowlist entry is for the zod that expo-mcp and @expo/mcp-tunnel install. move this zod past the fix",
	])
})

test("the zod that a development tool installs passes at any depth", () => {
	// each development tool's own zod 3, a copy two packages deep, and a copy under a workspace's own install of a tool
	const lockfile = toLockfile(`{
  "workspaces": { "": { "name": "carlnotes" }, "apps/mobile": { "name": "@carlnotes/mobile" } },
  "packages": {
    "zod": ["zod@4.6.7", "", {}, "sha512-g8W2=="],
    "expo-mcp/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
    "@expo/mcp-tunnel/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
    "expo-mcp/@expo/mcp-tunnel/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
    "@carlnotes/mobile/expo-mcp/zod": ["zod@3.25.76", "", {}, "sha512-gzUt=="],
  }
}`)
	expect(toDependencyAdvisoryViolations({ advisories: ADVISORIES, allowlist: ALLOWLIST, lockfile })).toEqual([])
})

test("the repo's allowlist entry for zod names each development tool whose zod the check leaves out", () => {
	// the reason of each zod entry on the repo's allowlist names every one of the tools
	const zodAllowlistEntries = readAllowlist().filter((allowlistEntry) => allowlistEntry.packageName === "zod")
	for (const zodAllowlistEntry of zodAllowlistEntries) {
		for (const developmentToolName of ZOD_DEVELOPMENT_TOOL_NAMES) {
			expect(zodAllowlistEntry.reason).toContain(developmentToolName)
		}
	}
})

test("an allowlist entry names its advisory, its package, a reason, and the day it was reviewed", () => {
	// a complete entry reads back as written
	const allowlistEntry = {
		advisoryId: "GHSA-c475-qrg2-pj4r",
		packageName: "basic-ftp",
		reason: "evals only",
		reviewedAt: "2026-11-13",
	}
	expect(toAllowlist(JSON.stringify([allowlistEntry]))).toEqual([allowlistEntry])

	// an entry with no reason, a date that is not a day, or a field the allowlist does not have throws an error
	expect(() => toAllowlist(JSON.stringify([{ ...allowlistEntry, reason: "" }]))).toThrow()
	expect(() => toAllowlist(JSON.stringify([{ ...allowlistEntry, reviewedAt: "last week" }]))).toThrow()
	expect(() => toAllowlist(JSON.stringify([{ ...allowlistEntry, severity: "high" }]))).toThrow()
})

test("the repo's allowlist reads, and every entry is complete", () => {
	expect(() => readAllowlist()).not.toThrow()
})

// the CI workflow as written: the advisory check has a job of its own that fails visibly, and no other job waits on it
// or audits the lockfile
test("CI runs the advisory check in a job of its own, apart from the gate", () => {
	// the workflow's jobs, each with the jobs it waits on and its steps
	const workflow = Bun.YAML.parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
		jobs: Record<string, { needs?: string | string[]; steps: { run?: string }[] }>
	}

	// the advisories job runs the check, and nothing in it continues on error
	const advisoriesJob = workflow.jobs.advisories
	expect(advisoriesJob?.steps.map((step) => step.run)).toContain("bun run check:advisories")
	expect(JSON.stringify(advisoriesJob)).not.toContain("continue-on-error")

	// no other job waits on it, and none runs an audit of its own
	const otherJobs = Object.entries(workflow.jobs).filter(([jobName]) => jobName !== "advisories")
	for (const [jobName, job] of otherJobs) {
		const neededJobNames = [job.needs ?? []].flat()
		const stepCommands = job.steps.map((step) => step.run ?? "").join("\n")
		expect({ jobName, neededJobNames }).toEqual({ jobName, neededJobNames: expect.not.arrayContaining(["advisories"]) })
		expect({ jobName, stepCommands }).toEqual({ jobName, stepCommands: expect.not.stringContaining("bun audit") })
	}
})

// fail on a high or critical advisory that `bun audit` lists and the reviewed allowlist in dependency-advisories.json
// does not name, on an allowlist entry that matches no advisory, and on an installed zod that an allowlisted advisory
// covers anywhere but under expo-mcp or @expo/mcp-tunnel. the rules live in dependencyAdvisories.ts
import { readAllowlist, toDependencyAdvisories, toDependencyAdvisoryViolations } from "./dependencyAdvisories"
import { readLockfile } from "./lockfile"

// audit the lockfile against the GitHub Advisory Database and read the output whatever the exit code. the audit exits
// 1 on any advisory and on a failed request alike
const auditResult = Bun.spawnSync(["bun", "audit", "--json"], { stdout: "pipe", stderr: "pipe" })
const auditOutputText = auditResult.stdout.toString()
const advisories = toDependencyAdvisories(auditOutputText)

// fail if the audit printed no advisory list, with what it printed instead
if (!advisories) {
	console.error(
		`dependency advisories: bun audit --json printed no advisory list\n${auditOutputText}${auditResult.stderr.toString()}`,
	)
	process.exit(1)
}

// run the rules over the audit, the allowlist, and the lockfile
const allowlist = readAllowlist()
const violations = toDependencyAdvisoryViolations({ advisories, allowlist, lockfile: readLockfile() })

// report every violation, then fail
if (violations.length > 0) {
	console.error(`dependency advisories: ${violations.length} violation(s)\n${violations.join("\n")}`)
	process.exit(1)
}

// report a clean run
console.log(
	`dependency advisories: the audit lists ${advisories.length} advisories, and each high or critical one is among the ${allowlist.length} on the allowlist`,
)

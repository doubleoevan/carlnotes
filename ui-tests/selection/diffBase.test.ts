// the diff base over stubbed repo lookups: a push after a green run, several commits in one push, a superseded or failed
// run, a first run, a rewritten history, a failed lookup, a scheduled run, and dispatches on main and on a branch
import { expect, test } from "bun:test"
import { type ToDiffBaseOptions, toDiffBase, toNameStatusPaths, ZERO_COMMIT } from "./diffBase"

// a linear history: green, then three pushed commits, with the head last
const COMMIT_ORDER = ["green", "first", "second", "head"]

// a push of the last three commits onto the green commit, with lookups that follow the linear history
function toPushOptions(overrides: Partial<ToDiffBaseOptions> = {}): ToDiffBaseOptions {
	return {
		eventName: "push",
		ref: "refs/heads/main",
		headCommit: "head",
		beforeCommit: "green",
		isAffectedDispatch: false,
		findLastGreenCommit: async () => "green",
		isAncestor: async (ancestorCommit, descendantCommit) =>
			COMMIT_ORDER.indexOf(ancestorCommit) >= 0 &&
			COMMIT_ORDER.indexOf(ancestorCommit) < COMMIT_ORDER.indexOf(descendantCommit),
		findMergeBaseWithMain: async () => "branch-point",
		...overrides,
	}
}

// a push of three commits diffs from the green commit before all three
test("a push of three commits diffs against the last green commit", async () => {
	expect(await toDiffBase(toPushOptions())).toMatchObject({ baseCommit: "green" })
})

// a cancelled or failed run never moves the green commit, so the next push still diffs from it
test("a superseded or failed run leaves the base at the last green commit", async () => {
	const nextPushOptions = toPushOptions({ beforeCommit: "second" })
	expect(await toDiffBase(nextPushOptions)).toMatchObject({ baseCommit: "green" })
})

// with no green run, the push's previous commit is the base, and the zero commit of a new branch is never one
test("without a green run the previous commit is used, and the zero commit selects everything", async () => {
	const noGreenOptions = toPushOptions({ findLastGreenCommit: async () => null, beforeCommit: "second" })
	expect(await toDiffBase(noGreenOptions)).toMatchObject({ baseCommit: "second" })
	const firstPushOptions = toPushOptions({ findLastGreenCommit: async () => null, beforeCommit: ZERO_COMMIT })
	expect(await toDiffBase(firstPushOptions)).toMatchObject({ baseCommit: null })
})

// a green commit that is no longer an ancestor, after a rewritten history, is never the base
test("a rewritten history selects everything", async () => {
	const rewrittenOptions = toPushOptions({ findLastGreenCommit: async () => "orphan", beforeCommit: "orphan" })
	expect(await toDiffBase(rewrittenOptions)).toMatchObject({ baseCommit: null })
})

// a commit that the clone no longer has, as after a force push, is not an ancestor, so the run selects everything
test("a commit that git cannot find selects everything instead of failing", async () => {
	const missingCommitOptions = toPushOptions({
		beforeCommit: "gone",
		isAncestor: async () => {
			throw new Error("Not a valid commit name green")
		},
	})
	expect(await toDiffBase(missingCommitOptions)).toMatchObject({ baseCommit: null })
})

// a lookup that fails selects everything instead of falling back to a narrower base
test("a failed green-run lookup selects everything", async () => {
	const failedLookupOptions = toPushOptions({
		findLastGreenCommit: async () => {
			throw new Error("gh is not signed in")
		},
	})
	const diffBase = await toDiffBase(failedLookupOptions)
	expect(diffBase.baseCommit).toBeNull()
	expect(diffBase.reason).toContain("gh is not signed in")
})

// a scheduled run and a plain dispatch check everything, and an affected dispatch on a branch uses its merge base
test("scheduled and dispatched runs choose their own bases", async () => {
	expect(await toDiffBase(toPushOptions({ eventName: "schedule" }))).toMatchObject({ baseCommit: null })
	expect(await toDiffBase(toPushOptions({ eventName: "workflow_dispatch" }))).toMatchObject({ baseCommit: null })
	const branchDispatchOptions = toPushOptions({
		eventName: "workflow_dispatch",
		ref: "refs/heads/demo",
		isAffectedDispatch: true,
	})
	expect(await toDiffBase(branchDispatchOptions)).toMatchObject({ baseCommit: "branch-point" })
	const mainDispatchOptions = toPushOptions({ eventName: "workflow_dispatch", isAffectedDispatch: true })
	expect(await toDiffBase(mainDispatchOptions)).toMatchObject({ baseCommit: "green" })
})

// a rename names both paths, and a change names one
test("the name-status listing gives every path, both names of a rename included", () => {
	const nameStatusText = "M\tapps/web/src/a.tsx\nR092\tapps/web/src/old.tsx\tapps/web/src/new.tsx\nD\tbun.lock\n"
	expect(toNameStatusPaths(nameStatusText)).toEqual([
		"apps/web/src/a.tsx",
		"apps/web/src/old.tsx",
		"apps/web/src/new.tsx",
		"bun.lock",
	])
})

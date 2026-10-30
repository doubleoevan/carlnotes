// the commit that a selection diffs against: the last commit that this workflow checked green, the push's previous
// commit, or a branch's merge base with main. no base at all selects every image capture
import { toErrorText } from "../errorText"

/** The commit that git writes as a push's previous commit if the branch is new. */
export const ZERO_COMMIT = "0000000000000000000000000000000000000000"

/** The commit that a selection diffs against and why, or no commit and why every image capture is selected. */
export type DiffBase = { baseCommit: string; reason: string } | { baseCommit: null; reason: string }

/** The run that asks for a base: its event, its ref, its commits, and the repo lookups that the choice needs. */
export type ToDiffBaseOptions = {
	// the run's event, its ref, its commits, and whether a dispatch asked for affected image captures
	eventName: string
	ref: string
	headCommit: string
	beforeCommit: string | null
	isAffectedDispatch: boolean
	// the repo lookups
	findLastGreenCommit: () => Promise<string | null>
	isAncestor: (ancestorCommit: string, descendantCommit: string) => Promise<boolean>
	findMergeBaseWithMain: () => Promise<string>
}

// the ref that every push and every scheduled run checks
const MAIN_REF = "refs/heads/main"

/**
 * Returns the commit that a run's selection diffs against, or no commit if the run selects every image capture.
 */
export async function toDiffBase(options: ToDiffBaseOptions): Promise<DiffBase> {
	// a scheduled run, and a dispatch that does not ask for affected image captures, check everything
	if (options.eventName === "schedule") {
		return { baseCommit: null, reason: "a scheduled run selects every image capture" }
	}
	if (options.eventName === "workflow_dispatch" && !options.isAffectedDispatch) {
		return { baseCommit: null, reason: "a dispatched run selects every image capture unless it asks for affected ones" }
	}

	// an affected dispatch on a branch diffs against where the branch left main
	if (options.eventName === "workflow_dispatch" && options.ref !== MAIN_REF) {
		return toMergeBase(options)
	}
	return toMainBase(options)
}

// the base on main: the last green run's commit if it is an ancestor, then the push's previous commit
async function toMainBase(options: ToDiffBaseOptions): Promise<DiffBase> {
	// the last commit that this workflow checked green. a failed lookup selects everything instead of guessing
	let lastGreenCommit: string | null
	try {
		lastGreenCommit = await options.findLastGreenCommit()
	} catch (error) {
		return { baseCommit: null, reason: `the last green run could not be read: ${toErrorText(error)}` }
	}

	// diff against the last green commit if this commit builds on it
	if (lastGreenCommit && (await isKnownAncestor(options, lastGreenCommit))) {
		return { baseCommit: lastGreenCommit, reason: `the last green UI tests run checked ${lastGreenCommit}` }
	}

	// the push's previous commit, if it is a real commit that this push builds on
	const beforeCommit = options.beforeCommit
	const isBeforeCommitUsable = beforeCommit !== null && beforeCommit !== ZERO_COMMIT
	if (isBeforeCommitUsable && (await isKnownAncestor(options, beforeCommit))) {
		return { baseCommit: beforeCommit, reason: `no green run is an ancestor, so the push's previous commit is used` }
	}
	return { baseCommit: null, reason: "no green run and no previous commit is an ancestor of this commit" }
}

// whether a commit is an ancestor of the run's commit.
// a commit that git cannot find, as after a rewritten history, is not an ancestor
async function isKnownAncestor(options: ToDiffBaseOptions, ancestorCommit: string): Promise<boolean> {
	try {
		return await options.isAncestor(ancestorCommit, options.headCommit)
	} catch {
		return false
	}
}

// the base of a branch: its merge base with main, or everything if git cannot find a merge base
async function toMergeBase(options: ToDiffBaseOptions): Promise<DiffBase> {
	try {
		const mergeBaseCommit = await options.findMergeBaseWithMain()
		return { baseCommit: mergeBaseCommit, reason: `the branch left main at ${mergeBaseCommit}` }
	} catch (error) {
		return { baseCommit: null, reason: `the branch's merge base with main could not be read: ${toErrorText(error)}` }
	}
}

/**
 * Returns every path that a `git diff --name-status` listing names, both names of a rename or a copy included.
 */
export function toNameStatusPaths(nameStatusText: string): string[] {
	// each line is a status, then one path, or two for a rename or a copy, separated by tabs
	return nameStatusText
		.split("\n")
		.filter(Boolean)
		.flatMap((nameStatusLine) => nameStatusLine.split("\t").slice(1))
}

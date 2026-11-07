// the plain elements and renders the shared reaction row and comment thread tests go through
import { mock } from "bun:test"
import { configureApiClient } from "@carlnotes/client/apiClient"
import type { ReactionWriteResult } from "@carlnotes/client/socialClient"
import { toProfilePath } from "@carlnotes/contracts/seo"
import { EMPTY_REACTION_SUMMARY } from "@carlnotes/contracts/social"
import { toTestComment, toTestCommentThread, toTestReactionSummary } from "@carlnotes/contracts/socialTestFixtures"
import { CommentThread, type CommentThreadProps } from "@carlnotes/core/components/CommentThread"
import { ReactionRow, type ReactionRowProps } from "@carlnotes/core/components/ReactionRow"
import type { TextComposerElementProps } from "@carlnotes/core/components/TextComposer"
import type { SocialElements } from "@carlnotes/core/lib/socialElements"
import { toReportLabel } from "@carlnotes/core/lib/socialLabels"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, type PropsWithChildren, type ReactNode } from "react"
import { type HookTestHarness, renderTestHook } from "@/lib/hookTestHarness"

// keep each test's browser environment and transport isolated
export const cleanups: (() => Promise<void>)[] = []
const originalFetch = globalThis.fetch

/**
 * Closes each render a test left open and restores the transport.
 */
export async function closeSocialTests(): Promise<void> {
	for (const close of cleanups.splice(0)) {
		await close()
	}
	globalThis.fetch = originalFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
}
// the composer's props as last rendered, which a test types into and submits through
let composer: TextComposerElementProps | null = null

/**
 * Returns the composer's props as last rendered.
 */
export function toComposer(): TextComposerElementProps | null {
	return composer
}

// plain elements: each control is a button a test finds by its label, and a comment's replies nest inside its row
const Wrap = ({ children }: PropsWithChildren) => <div>{children}</div>
const LabelButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
	<button type="button" onClick={onPress}>
		{label}
	</button>
)
export const ELEMENTS: SocialElements = {
	Container: Wrap,
	Message: Wrap,
	List: Wrap,
	Row: ({ children }) => <article>{children}</article>,
	Header: Wrap,
	Author: ({ author }) => <b>{author?.username ?? "Carl"}</b>,
	Age: () => null,
	Body: ({ isScrolling, children }) => <p data-scrolling={isScrolling}>{children}</p>,
	Replies: ({ children }) => <div className="replies">{children}</div>,
	ComposerShareSwitch: ({ label, isChecked, disabledReason, onChange }) => (
		<button
			type="button"
			role="switch"
			aria-checked={isChecked}
			disabled={Boolean(disabledReason)}
			title={disabledReason}
			onClick={() => onChange(!isChecked)}
		>
			{label}
		</button>
	),
	ShareToggle: ({ label, isShared, isDisabled, onPress }) => (
		<button type="button" aria-pressed={isShared} disabled={isDisabled || !onPress} onClick={onPress}>
			{label}
		</button>
	),
	Controls: Wrap,
	ReplyButton: LabelButton,
	RowControl: ({ label, disabledReason, onPress }) => (
		<button type="button" disabled={Boolean(disabledReason)} title={disabledReason} onClick={onPress}>
			{label}
		</button>
	),
	Report: ({ label, isReported, onPress }) => (
		<LabelButton label={isReported ? `${label} (reported)` : label} onPress={onPress} />
	),
	Loading: () => null,
	More: LabelButton,
	MoreToggle: ({ isExpanded, moreLabel, onToggle }) => (
		<button type="button" onClick={onToggle}>
			{isExpanded ? LESS_LABEL : moreLabel}
		</button>
	),
	Confirm: ({ title, onConfirm }) => <LabelButton label={title} onPress={() => void onConfirm()} />,
	ComposerRow: Wrap,
	SharedCommentSlotsLabel: Wrap,
	ComposerButton: LabelButton,
	ComposerFrame: ({ title, children }) => <section aria-label={title}>{children}</section>,
	Composer: (props) => {
		composer = props
		return (
			<>
				{props.footerStart}
				{props.message && <p role="alert">{props.message}</p>}
			</>
		)
	},
	ReactionGroup: Wrap,
	ReactionOption: ({ label, count, moreUsersLabel, isOwn, isDisabled, onPress }) => (
		<button type="button" aria-pressed={isOwn} disabled={isDisabled} onClick={onPress}>
			{[label, count, moreUsersLabel].filter((part) => part !== null).join(" ")}
		</button>
	),
	Mention: ({ userId, children }) => <a href={toProfilePath(userId)}>{children}</a>,
	ChapterTag: ({ chapter, onPress }) => <LabelButton label={`tag ${chapter.title}`} onPress={() => onPress?.()} />,
	ChapterSelect: ({ chapters, onChange }) => (
		<LabelButton label="pick last chapter" onPress={() => onChange(chapters.at(-1)?.position ?? null)} />
	),
}

// a Finding both components hang on, and the report flag's label before a report
export const TARGET = { kind: "finding", id: "finding-1" } as const
export const REPORT_LABEL = toReportLabel(false)
export const LESS_LABEL = "show less"

// press the first button inside a root whose text starts with a label
export async function press(root: ParentNode, label: string): Promise<void> {
	const button = [...root.querySelectorAll("button")].find((candidate) => candidate.textContent?.startsWith(label))
	if (!button) {
		throw new Error(`no button starts with ${label}`)
	}
	await act(async () => button.click())
}

// the text of every button inside a root, in order
export function toButtonLabels(root: ParentNode): string[] {
	return [...root.querySelectorAll("button")].map((button) => button.textContent ?? "")
}

// the thread's rows, each a top-level comment or a reply
export function toRows(harness: HookTestHarness<null>): HTMLElement[] {
	return [...harness.container.querySelectorAll("article")]
}

// the query cache a row's flag reads, which a sent report writes
export const queryClient = new QueryClient()
function withQueryClient(children: ReactNode): ReactNode {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

// render the reaction row over a client whose saves a test can read
export async function renderReactionRow(
	props: Partial<ReactionRowProps> & { saveResult?: ReactionWriteResult },
): Promise<{
	harness: HookTestHarness<null>
	save: ReturnType<typeof mock<() => Promise<ReactionWriteResult>>>
	signIns: number[]
}> {
	const { saveResult = { status: "saved", summary: EMPTY_REACTION_SUMMARY }, ...rowProps } = props
	const signIns: number[] = []
	const save = mock(async (): Promise<ReactionWriteResult> => saveResult)
	const harness = await renderTestHook(
		() => null,
		() => (
			<ReactionRow
				target={TARGET}
				summary={toTestReactionSummary()}
				isSignedIn
				onSignIn={() => signIns.push(1)}
				onError={() => {}}
				client={{ save }}
				elements={ELEMENTS}
				{...rowProps}
			/>
		),
	)
	cleanups.push(harness.close)
	return { harness, save, signIns }
}

// one request the thread sent, as the test's api recorded it
type RecordedRequest = { method: string; url: string; body: unknown }

// render the comment thread over an api whose requests a test records and returns
export async function renderCommentThread(
	props: Partial<CommentThreadProps>,
	respond: (request: RecordedRequest) => Response | Promise<Response> = () => Response.json({}),
): Promise<{ harness: HookTestHarness<null>; requests: RecordedRequest[]; signIns: number[] }> {
	const requests: RecordedRequest[] = []
	const signIns: number[] = []
	configureApiClient({ apiBaseUrl: "https://carlnotes.test", showError: () => {} })
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		// record the request and return its response
		const fetchRequest = new Request(input, init)
		const body = fetchRequest.method === "GET" ? null : await fetchRequest.json().catch(() => null)
		const request = { method: fetchRequest.method, url: fetchRequest.url, body }
		requests.push(request)
		return respond(request)
	}) as typeof fetch
	composer = null
	const harness = await renderTestHook(
		() => null,
		() =>
			withQueryClient(
				<CommentThread
					target={TARGET}
					firstPage={toTestCommentThread()}
					isSignedIn
					onSignIn={() => signIns.push(1)}
					onError={() => {}}
					onReport={() => {}}
					elements={ELEMENTS}
					{...props}
				/>,
			),
	)
	cleanups.push(harness.close)
	return { harness, requests, signIns }
}

// the option of one reaction type inside a root
export function toOption(root: ParentNode, label: string): HTMLButtonElement {
	const option = [...root.querySelectorAll("button")].find((button) => button.textContent?.startsWith(label))
	if (!option) {
		throw new Error(`no option starts with ${label}`)
	}
	return option
}

// comments with the ids comment-1 and up
export function toNumberedComments(commentCount: number) {
	return Array.from({ length: commentCount }, (_, index) => toTestComment({ id: `comment-${index + 1}` }))
}

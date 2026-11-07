import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react"

// how a submit ended: accepted, or not, with Carl's words if the text was rejected
export type TextComposerResult = { isAccepted: true } | { isAccepted: false; message: string | null }

// what a platform's composer renders from: the draft, the submit, and the optional words around them
export type TextComposerElementProps = {
	value: string
	onChange: (value: string) => void
	onSubmit: () => void
	isPending: boolean
	canSubmit: boolean
	maxLength: number
	placeholder: string
	// what the box is called for a screen reader, the placeholder if left out
	inputLabel?: string
	submitLabel: string
	// what the submit button is called for a mobile screen reader, the submit label if left out
	submitAccessibilityLabel?: string
	// whether the box takes focus as it opens
	isAutoFocused?: boolean
	// Carl's words about a rejected text, shown with the box
	message?: string | null
	// the users a trailing @ mention suggests, and the pick of one
	suggestions?: ProfileIdentity[]
	onPickSuggestion?: (user: ProfileIdentity) => void
	// what sits at the left of the submit button
	footerStart?: ReactNode
}

// the words and the focus that pass through to the platform's composer
type TextComposerInputProps = Pick<
	TextComposerElementProps,
	"placeholder" | "inputLabel" | "submitAccessibilityLabel" | "isAutoFocused"
>

// the composer's limits, words, and what a submit does
export type TextComposerProps = TextComposerInputProps & {
	Composer: ComponentType<TextComposerElementProps>
	maxLength: number
	isEnabled?: boolean
	// the text an edit starts from
	initialText?: string
	submitLabel: string
	// what the submit button says during a submit, the submit label if left out
	pendingLabel?: string
	onSubmit: (text: string) => Promise<TextComposerResult>
	// called with the failure's words, or null for a failure with none
	onFailure?: (message: string | null) => void
	// loads the users whose usernames start with a prefix, which turns mention suggestions on
	loadSuggestions?: (prefix: string) => Promise<ProfileIdentity[]>
	// what sits at the left of the submit button
	footerStart?: ReactNode
}

// the @ token a draft ends with, which suggestions complete
const TRAILING_MENTION_PATTERN = /(^|\s)@([\p{L}\p{N}_-]{1,40})$/u

// how long typing pauses before suggestions load
const SUGGESTION_DELAY_MS = 200

/**
 * Shares one composer's behavior between the note thread and the comment thread: a failed submit
 * keeps its draft, an accepted one clears only what was submitted, a second submit waits for the first, and a
 * trailing @ token suggests users.
 */
export function TextComposer({
	Composer,
	maxLength,
	isEnabled = true,
	initialText = "",
	submitLabel,
	pendingLabel = submitLabel,
	onSubmit,
	onFailure,
	loadSuggestions,
	footerStart,
	...composerInputProps
}: TextComposerProps) {
	// keep a failed submit's draft and block a second submit before a render
	const [draft, setDraft] = useState(initialText)
	const [isPending, setIsPending] = useState(false)
	const isPendingRef = useRef(false)
	const [message, setMessage] = useState<string | null>(null)
	const [suggestions, setSuggestions] = useState<ProfileIdentity[]>([])
	const trimmedLength = draft.trim().length
	const canSubmit = isEnabled && trimmedLength > 0 && trimmedLength <= maxLength

	// suggest users for the @ token the draft ends with, after a pause in typing
	const mentionPrefix = loadSuggestions ? (TRAILING_MENTION_PATTERN.exec(draft)?.[2] ?? null) : null
	useEffect(() => {
		if (!mentionPrefix || !loadSuggestions) {
			setSuggestions([])
			return
		}

		// a slower response for a prefix no longer typed is dropped
		let isCurrent = true
		const timer = setTimeout(() => {
			void loadSuggestions(mentionPrefix).then((users) => {
				if (isCurrent) {
					setSuggestions(users)
				}
			})
		}, SUGGESTION_DELAY_MS)
		return () => {
			isCurrent = false
			clearTimeout(timer)
		}
	}, [mentionPrefix, loadSuggestions])

	// clear only the submitted draft once the text is accepted, and keep text typed during the request
	async function handleSubmit(): Promise<void> {
		if (!canSubmit || isPendingRef.current) {
			return
		}
		const submittedDraft = draft
		isPendingRef.current = true
		setIsPending(true)
		setMessage(null)
		const submitResult = await onSubmit(submittedDraft.trim()).catch(
			(): TextComposerResult => ({ isAccepted: false, message: null }),
		)
		if (submitResult.isAccepted) {
			setDraft((currentDraft) => (currentDraft === submittedDraft ? "" : currentDraft))
		} else {
			setMessage(submitResult.message)
			onFailure?.(submitResult.message)
		}
		isPendingRef.current = false
		setIsPending(false)
	}

	// complete the trailing @ token with the picked user's name
	function handlePickSuggestion(user: ProfileIdentity): void {
		setDraft((currentDraft) => currentDraft.replace(TRAILING_MENTION_PATTERN, `$1@${user.username} `))
		setSuggestions([])
	}

	return (
		<Composer
			{...composerInputProps}
			value={draft}
			onChange={setDraft}
			onSubmit={() => void handleSubmit()}
			isPending={isPending}
			canSubmit={canSubmit}
			maxLength={maxLength}
			submitLabel={isPending ? pendingLabel : submitLabel}
			message={message}
			suggestions={suggestions}
			onPickSuggestion={handlePickSuggestion}
			footerStart={footerStart}
		/>
	)
}

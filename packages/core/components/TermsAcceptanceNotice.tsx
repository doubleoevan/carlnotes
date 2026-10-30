import { authClient } from "@carlnotes/client/authClient"
import { sendTermsAcceptance } from "@carlnotes/client/termsClient"
import { isTermsVersionCurrent, TERMS_VERSION } from "@carlnotes/contracts/terms"
import { type ComponentType, type ReactNode, useState } from "react"
import { REQUEST_FAILED_TEXT, TERMS_AGREEMENT_COPY } from "../lib/sessionCopy"
import {
	clearTermsAcceptanceRequest,
	dismissTermsAcceptance,
	useIsTermsAcceptanceOpen,
} from "../stores/termsAcceptanceStore"

// the dialog's words: the title, what accepting means, and the two choices
export const TERMS_ACCEPTANCE_COPY = {
	title: "The Terms have changed",
	body: "Carl keeps the room classy, and the Terms now say how: what you can post, how reports work, and when content comes down. Read them, then accept to keep posting.",
	accept: "Accept the Terms",
	dismiss: "Not now",
	termsLink: TERMS_AGREEMENT_COPY.termsLink,
	privacyLink: TERMS_AGREEMENT_COPY.privacyLink,
} as const

// the platform controls the notice renders through
export type TermsAcceptanceElements = {
	Root: ComponentType<{ title: string; onClose: () => void; children: ReactNode }>
	Text: ComponentType<{ children: ReactNode }>
	Links: ComponentType<{ children: ReactNode }>
	Link: ComponentType<{ href: string; children: string }>
	Error: ComponentType<{ children: ReactNode }>
	Actions: ComponentType<{ children: ReactNode }>
	Button: ComponentType<{ label: string; onPress: () => void; isDisabled?: boolean; isPrimary?: boolean }>
}

/**
 * Returns whether the Terms dialog is open for the signed-in user: their accepted version is older than the published
 * one and they have not put the dialog off, or a write came back rejected for it. A visitor, and a session from an api
 * that reports no version, never see it.
 */
export function useIsTermsAcceptanceDialogOpen(): boolean {
	const { data: session } = authClient().useSession()
	const isOpen = useIsTermsAcceptanceOpen({
		userId: session?.user.id ?? "",
		isVersionOutdated: session ? !isTermsVersionCurrent(session.user.termsAcceptedVersion) : false,
	})
	return Boolean(session) && isOpen
}

/**
 * Asks the signed-in user to accept the published Terms or put it off. Accepting records the version and refreshes
 * the session.
 */
export function TermsAcceptanceNotice({
	elements: { Root, Text, Links, Link, Error: ErrorText, Actions, Button },
}: {
	elements: TermsAcceptanceElements
}) {
	const { data: session, refetch } = authClient().useSession()
	const [isAccepting, setIsAccepting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// record the acceptance, then read the session back with the version on it
	async function handleAccept(): Promise<void> {
		if (isAccepting) {
			return
		}
		setIsAccepting(true)
		setError(null)
		try {
			await sendTermsAcceptance()
			await refetch()
			clearTermsAcceptanceRequest()
		} catch {
			setError(REQUEST_FAILED_TEXT)
		} finally {
			setIsAccepting(false)
		}
	}

	// put the dialog off for this user
	function handleDismiss(): void {
		dismissTermsAcceptance(session?.user.id ?? "")
	}
	return (
		<Root title={TERMS_ACCEPTANCE_COPY.title} onClose={handleDismiss}>
			<Text>{TERMS_ACCEPTANCE_COPY.body}</Text>
			<Links>
				<Link href="/terms">{TERMS_ACCEPTANCE_COPY.termsLink}</Link>
				<Link href="/privacy">{TERMS_ACCEPTANCE_COPY.privacyLink}</Link>
			</Links>
			<Text>{`Version ${TERMS_VERSION}`}</Text>
			{error && <ErrorText>{error}</ErrorText>}
			<Actions>
				<Button label={TERMS_ACCEPTANCE_COPY.dismiss} onPress={handleDismiss} isDisabled={isAccepting} />
				<Button
					label={TERMS_ACCEPTANCE_COPY.accept}
					onPress={() => void handleAccept()}
					isDisabled={isAccepting}
					isPrimary
				/>
			</Actions>
		</Root>
	)
}

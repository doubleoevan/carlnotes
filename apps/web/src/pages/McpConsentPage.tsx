import { authClient } from "@carlnotes/client/authClient"
import { fetchMcpConsentClient, sendMcpConsent } from "@carlnotes/client/mcpClient"
import type { McpConsentClient } from "@carlnotes/contracts/aiAgentIdentity"
import { useEffect, useState } from "react"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { usePageTitle } from "@/hooks/usePageTitle"
import { useSearchParams } from "@/hooks/useSearchParams"
import { PAGE_CLASS } from "@/lib/styleClasses"

/**
 * Renders the consent step of an mcp client's sign-in.
 */
export function McpConsentPage() {
	usePageTitle("Connect to AI")
	// whether Better Auth's redirect to this page signed its query, and the mcp client id and redirect address from it
	const searchParams = useSearchParams()
	const isQuerySigned = searchParams.has("sig")
	const mcpClientId = searchParams.get("client_id")
	const redirectUri = searchParams.get("redirect_uri")
	const { data: session, isPending } = authClient().useSession()
	const [mcpConsentClient, setMcpConsentClient] = useState<McpConsentClient | null | undefined>(undefined)
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	// fetch the client asking for consent. undefined while it loads, null for a client CarlNotes does not know
	useEffect(() => {
		if (!mcpClientId || !session) {
			return
		}
		fetchMcpConsentClient(mcpClientId, redirectUri)
			.then(setMcpConsentClient)
			.catch(() => setMcpConsentClient(null))
	}, [mcpClientId, redirectUri, session])

	// send the consent, then follow Better Auth's redirect out of the app
	const handleConsent = async (isAccepted: boolean): Promise<void> => {
		if (!isQuerySigned) {
			setError("This connect link has expired. Start again from your AI.")
			return
		}
		setIsSubmitting(true)
		try {
			// send the address bar's own query. the router's copy keeps one value of a repeated parameter, which breaks the
			// signature
			window.location.href = await sendMcpConsent(window.location.search.slice(1), isAccepted)
		} catch (consentError) {
			console.error("mcp consent failed", consentError)
			setError("That didn't go through. Try again, or start over from your AI.")
			setIsSubmitting(false)
		}
	}

	// render nothing while the session loads
	if (isPending || !session) {
		return null
	}
	const clientDisplayName = mcpConsentClient?.name ?? "your AI"
	const isClientKnown = Boolean(mcpConsentClient)
	// a link without a client id names no client CarlNotes can know
	const isClientMissing = !mcpClientId || mcpConsentClient === null
	return (
		<main className={PAGE_CLASS}>
			{/* the question as a modal the user answers: no close, and no way out but the two buttons */}
			<Dialog open>
				<DialogContent
					hideCloseButton
					onEscapeKeyDown={(event) => event.preventDefault()}
					onInteractOutside={(event) => event.preventDefault()}
					className="top-44 translate-y-0 sm:max-w-md"
				>
					<DialogTitle>{`Share CarlNotes with ${clientDisplayName}?`}</DialogTitle>
					<DialogDescription>
						Carl can share your topics and take its questions. It only changes what you can change yourself.
					</DialogDescription>
					{/* the host the answer returns to, only if CarlNotes does not know it */}
					{mcpConsentClient?.unknownRedirectHost && (
						<p className="text-destructive text-sm">
							{`Allowing shares CarlNotes with ${mcpConsentClient.unknownRedirectHost}, a site CarlNotes doesn't know. Allow only if you trust it.`}
						</p>
					)}
					{error && <p className="text-destructive text-sm">{error}</p>}
					{isClientMissing && (
						<p className="text-destructive text-sm">CarlNotes doesn't know this AI. Start again from your AI.</p>
					)}
					{/* allow or deny */}
					<DialogFooter className="mt-2 gap-3">
						<Button onClick={() => void handleConsent(true)} disabled={isSubmitting || !isClientKnown}>
							Allow
						</Button>
						<Button variant="outline" onClick={() => void handleConsent(false)} disabled={isSubmitting}>
							Not now
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</main>
	)
}

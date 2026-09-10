import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { authClient } from "@/clients/authClient"
import { fetchMcpClientName, sendMcpConsent } from "@/clients/mcpClient"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS } from "@/lib/styleClasses"

/**
 * Renders the consent step of an mcp client's sign-in.
 */
export function McpConsentPage() {
	usePageTitle("Connect to AI")
	const [searchParams] = useSearchParams()
	const consentCode = searchParams.get("consent_code")
	const mcpClientId = searchParams.get("client_id")
	const { data: session, isPending } = authClient.useSession()
	const [mcpClientName, setMcpClientName] = useState<string | null | undefined>(undefined)
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	// send a signed-out user to sign in, then back here
	useEffect(() => {
		if (!isPending && !session) {
			const returnPath = `${window.location.pathname}${window.location.search}`
			window.location.href = `/login?next=${encodeURIComponent(returnPath)}`
		}
	}, [isPending, session])

	// fetch the client's registered name. undefined while it loads, null for a client CarlNotes does not know
	useEffect(() => {
		if (!mcpClientId || !session) {
			return
		}
		fetchMcpClientName(mcpClientId)
			.then(setMcpClientName)
			.catch(() => setMcpClientName(null))
	}, [mcpClientId, session])

	// send the consent, then follow Better Auth's redirect out of the app
	const handleConsent = async (isAccepted: boolean): Promise<void> => {
		if (!consentCode) {
			setError("This connect link has expired. Start again from your AI.")
			return
		}
		setIsSubmitting(true)
		try {
			window.location.href = await sendMcpConsent(consentCode, isAccepted)
		} catch (consentError) {
			console.error("mcp consent failed", consentError)
			setError("That didn't go through. Try again, or start over from your AI.")
			setIsSubmitting(false)
		}
	}

	// render nothing while the session is pending or missing
	if (isPending || !session) {
		return null
	}
	const clientDisplayName = mcpClientName ?? "your AI"
	const isClientKnown = typeof mcpClientName === "string"
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
					{error && <p className="text-destructive text-sm">{error}</p>}
					{mcpClientName === null && (
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

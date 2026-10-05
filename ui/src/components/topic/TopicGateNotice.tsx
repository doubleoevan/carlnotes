import { toCtaTag } from "@shared/contracts"
import { useNavigate } from "@tanstack/react-router"
import type { GatedTopicVisibility } from "@/clients/topicClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { useSearchParams } from "@/hooks/useSearchParams"

// the gated topic's visibility, whether the user is signed in, and the path that a visitor returns to
type TopicGateNoticeProps = { visibility: GatedTopicVisibility; isSignedIn: boolean; returnPath: string }

// what each gate says to a signed-in user and to a visitor.
// a private topic's gate asks a visitor to log in and never to sign up
const GATE_COPY = {
	invite: {
		title: "This topic is invite-only",
		signedInDescription: "Ask the topic owner for an invite to see it.",
		visitorDescription: "Sign up to see it.",
	},
	private: {
		title: "This topic is private",
		signedInDescription: "Ask the topic owner to share it with you.",
		visitorDescription: "Log in to see it if it's shared with you.",
	},
} satisfies Record<GatedTopicVisibility, { title: string; signedInDescription: string; visitorDescription: string }>

/**
 * The gate in front of an invite or private topic's page or its podcast episode's page.
 */
export function TopicGateNotice({ visibility, isSignedIn, returnPath }: TopicGateNoticeProps) {
	const navigate = useNavigate()

	// the query that returns a visitor to the gated page after login or signup
	const nextQuery = `?next=${encodeURIComponent(returnPath)}`
	// which arrival a signup gets attributed to for analytics
	const searchParams = useSearchParams()
	const ctaTag = toCtaTag(searchParams.get("src")) ?? "gate"

	// the copy for the gated topic's visibility
	const gateCopy = GATE_COPY[visibility]
	return (
		<Dialog open onOpenChange={() => navigate({ to: "/" })}>
			{/* the gate's own actions are the only ways out, so there is no ✕ */}
			<DialogContent className="sm:max-w-md" hideCloseButton>
				<DialogTitle>{gateCopy.title}</DialogTitle>
				<DialogDescription>{isSignedIn ? gateCopy.signedInDescription : gateCopy.visitorDescription}</DialogDescription>
				<DialogFooter>
					{isSignedIn ? (
						// the only action a signed-in user has here is leaving
						<Button onClick={() => navigate({ to: "/" })}>Back to CarlNotes</Button>
					) : (
						<GatedSignedOutActions nextQuery={nextQuery} ctaTag={ctaTag} isSignupShown={visibility === "invite"} />
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// the visitor's call-to-action links, which return to the gated page after login or signup.
// a private topic offers login alone, as the primary action
function GatedSignedOutActions({
	nextQuery,
	ctaTag,
	isSignupShown,
}: {
	nextQuery: string
	ctaTag: string
	isSignupShown: boolean
}) {
	return (
		<>
			<AnchorLink
				href={`/login${nextQuery}`}
				className={buttonVariants({ variant: isSignupShown ? "outline" : "default" })}
			>
				Log in
			</AnchorLink>
			{/* cta names the arrival for the signup_completed event */}
			{isSignupShown ? (
				<AnchorLink href={`/signup${nextQuery}&cta=${ctaTag}`} className={buttonVariants({ variant: "default" })}>
					Sign up
				</AnchorLink>
			) : null}
		</>
	)
}

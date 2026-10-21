import { toCtaTag } from "@carlnotes/contracts/signupCta"
import { useNavigate } from "@tanstack/react-router"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Button, buttonVariants } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/primitives/dialog"
import { toSignupHref } from "@/components/session/signupPrompts"
import { useSearchParams } from "@/hooks/useSearchParams"

// whether the user is signed in, and the path that a visitor returns to
type TopicGateNoticeProps = { isSignedIn: boolean; returnPath: string }

/**
 * The gate in front of an invite topic's page or its podcast episode's page.
 */
export function TopicGateNotice({ isSignedIn, returnPath }: TopicGateNoticeProps) {
	const navigate = useNavigate()

	// which arrival a signup gets attributed to for analytics
	const searchParams = useSearchParams()
	const ctaTag = toCtaTag(searchParams.get("src")) ?? "gate"
	return (
		<Dialog open onOpenChange={() => navigate({ to: "/" })}>
			{/* the gate's own actions are the only ways out, so there is no ✕ */}
			<DialogContent className="sm:max-w-md" hideCloseButton>
				<DialogTitle>This topic is invite-only</DialogTitle>
				<DialogDescription>
					{isSignedIn ? "Ask the topic owner for an invite to see it." : "Sign up to see it."}
				</DialogDescription>
				<DialogFooter>
					{isSignedIn ? (
						// the only action a signed-in user has here is leaving
						<Button onClick={() => navigate({ to: "/" })}>Back to CarlNotes</Button>
					) : (
						<GatedSignedOutActions returnPath={returnPath} ctaTag={ctaTag} />
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// the visitor's call-to-action links, which return to the gated page after login or signup
function GatedSignedOutActions({ returnPath, ctaTag }: { returnPath: string; ctaTag: string }) {
	return (
		<>
			<AnchorLink
				href={`/login?next=${encodeURIComponent(returnPath)}`}
				className={buttonVariants({ variant: "outline" })}
			>
				Log in
			</AnchorLink>
			{/* cta names the arrival for the signup_completed event */}
			<AnchorLink href={toSignupHref(ctaTag, returnPath)} className={buttonVariants({ variant: "default" })}>
				Sign up
			</AnchorLink>
		</>
	)
}

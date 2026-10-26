import {
	TopicScanFailure as SharedTopicScanFailure,
	type TopicScanFailureComponents,
} from "@carlnotes/core/components/TopicScanFailure"
import { AnchorLink } from "@/components/common/AnchorLink"
import { buttonVariants } from "@/components/primitives/button"

/**
 * Renders the shared scan failure with browser links and button styling.
 */
export function TopicScanFailure({ error }: { error: string | null }) {
	return <SharedTopicScanFailure error={error} components={SCAN_FAILURE_COMPONENTS} />
}

// web text and links retain their paragraph and inline semantics
const SCAN_FAILURE_COMPONENTS: TopicScanFailureComponents = {
	Message: ({ isPaused, children }) => (
		<p className={isPaused ? "text-muted-foreground" : "text-destructive"}>{children}</p>
	),
	Budget: ({ children }) => <div className="text-destructive">{children}</div>,
	UpgradeLine: ({ children }) => <p className="mt-2">{children}</p>,
	Text: ({ children }) => <span>{children}</span>,
	Link: ({ href, isButton, children }) => (
		<AnchorLink href={href} className={isButton ? buttonVariants({ size: "sm" }) : "sentence-link"}>
			{children}
		</AnchorLink>
	),
}

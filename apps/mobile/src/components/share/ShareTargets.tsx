import { Mail, MessageSquare } from "lucide-react-native"
import { Path } from "react-native-svg"
import { siBluesky, siReddit, siX } from "simple-icons"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ClassNameSvg } from "@/components/common/ClassNameSvg"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// the same LinkedIn mark retained by the web after Simple Icons removed it
const LINKEDIN_ICON = {
	path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
}

/**
 * Matches the web's social and direct-message destinations.
 */
export function ShareTargets({
	topic,
	topicUrl,
	kind,
	isEnabled,
	onShare,
}: {
	topic: { name: string }
	topicUrl: string
	kind: "post" | "send"
	isEnabled: boolean
	onShare?: (channel: string) => void
}) {
	// encode the title and link once for every destination
	const url = encodeURIComponent(topicUrl)
	const title = encodeURIComponent(topic.name)
	const targets =
		kind === "post"
			? [
					{ label: "x.com", channel: "x.com", href: `https://x.com/intent/post?url=${url}&text=${title}`, brand: siX },
					{
						label: "Bluesky",
						channel: "bluesky",
						href: `https://bsky.app/intent/compose?text=${title}%20${url}`,
						brand: siBluesky,
					},
					{
						label: "LinkedIn",
						channel: "linkedin",
						href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
						brand: LINKEDIN_ICON,
					},
					{
						label: "Reddit",
						channel: "reddit",
						href: `https://reddit.com/submit?url=${url}&title=${title}`,
						brand: siReddit,
					},
				]
			: [
					{ label: "Text", channel: "text", href: `sms:?&body=${title}%20${url}`, brand: null },
					{ label: "Email", channel: "email", href: `mailto:?subject=${title}&body=${url}`, brand: null },
				]
	return targets.map((target) => (
		<Button
			key={target.label}
			asChild={isEnabled}
			variant="ghost"
			className="min-h-12 justify-start px-2"
			accessibilityLabel={target.label}
			disabled={!isEnabled}
		>
			{isEnabled ? (
				<AnchorLink href={target.href} accessibilityLabel={target.label} onPress={() => onShare?.(target.channel)}>
					<ShareTargetLabel target={target} />
				</AnchorLink>
			) : (
				<ShareTargetLabel target={target} />
			)}
		</Button>
	))
}

// use the web's brand marks and the same content-icon size
function ShareTargetLabel({ target }: { target: { label: string; brand: { path: string } | null } }) {
	return (
		<>
			{target.brand ? (
				<ClassNameSvg width={16} height={16} viewBox="0 0 24 24" className="text-foreground">
					<Path d={target.brand.path} fill="currentColor" />
				</ClassNameSvg>
			) : (
				<Icon as={target.label === "Text" ? MessageSquare : Mail} className="size-4" />
			)}
			<Text>{target.label}</Text>
		</>
	)
}

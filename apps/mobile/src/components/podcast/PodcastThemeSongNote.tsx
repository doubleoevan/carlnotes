import {
	PodcastThemeSongCredits,
	type PodcastThemeSongCreditsElements,
} from "@carlnotes/core/components/PodcastThemeSongCredits"
import { type ComponentRef, useRef, useState } from "react"
import { Pressable, View } from "react-native"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Sheet } from "@/components/common/Sheet"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

const elements: PodcastThemeSongCreditsElements = {
	Group: View,
	Text,
	Heading: ({ children, className }) => (
		<Text accessibilityRole="header" className={`text-center font-display text-lg ${className ?? ""}`}>
			{children}
		</Text>
	),
	Scroll: ({ children }) => <ScrollBox>{children}</ScrollBox>,
	Link: ({ children, href, className }) => (
		<AnchorLink asChild href={href} accessibilityLabel={typeof children === "string" ? children : "Theme song source"}>
			<Text className={`text-link ${className ?? ""}`}>{children}</Text>
		</AnchorLink>
	),
}

/**
 * Opens the shared theme-song credits and lyrics in the standard mobile sheet.
 */
export function PodcastThemeSongNote() {
	// return screen-reader focus to the credits trigger when its sheet closes
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const [isOpen, setIsOpen] = useState(false)
	return (
		<>
			<Pressable
				ref={triggerRef}
				accessibilityRole="button"
				accessibilityLabel="Theme song credits"
				hitSlop={toTouchTargetHitSlop(24)}
				onPress={() => setIsOpen(true)}
				className="ml-2"
			>
				<NoteIcon />
			</Pressable>
			{isOpen && (
				<Sheet title="Theme song credits" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
					<PodcastThemeSongCredits elements={elements} />
				</Sheet>
			)}
		</>
	)
}

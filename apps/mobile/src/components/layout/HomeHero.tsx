import {
	CARL_PITCH,
	HERO_CALL_TO_ACTION,
	HERO_IMAGE_ALT,
	HERO_PITCH_LABEL,
	HERO_TAGLINE,
} from "@carlnotes/core/lib/homeHero"
import { usePathname } from "expo-router"
import { type ComponentRef, useRef, useState } from "react"
import { Image, Pressable, useWindowDimensions, View } from "react-native"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Sheet } from "@/components/common/Sheet"
import { Text } from "@/components/primitives/text"
import { PageActionMenu } from "@/components/search/PageActionMenu"
import { SearchBar } from "@/components/search/SearchBar"
import { useSearchBar } from "@/providers/SearchBarProvider"
import { rememberSessionReturnPath } from "@/sessionReturnPath"

// the search inset includes the toolbar border, and the note fits on one line of copy
const SEARCH_ICON_INSET = 13
const HERO_COPY_CLASS = "text-sm leading-tight"
const HERO_NOTE_SIZE = 16

/**
 * A visitor's Home hero, the phone web's: Carl's image, the call to action with the pitch behind its note button, and
 * the tagline. The headline sits under the hero, beside the New Topic button. It scrolls with the page under the
 * pinned brand row, as the phone web's hero scrolls with the page.
 */
export function HomeHero() {
	// the pitch sheet, which returns focus to its button
	const [isPitchOpen, setIsPitchOpen] = useState(false)
	const pitchTriggerRef = useRef<ComponentRef<typeof View>>(null)
	// fit the image to the same column as the phone web and align it with the search icon
	const { filters } = useSearchBar()
	const pathname = usePathname()
	const { width } = useWindowDimensions()
	const imageColumnWidth = width >= 704 ? 100 : width >= 460 ? 128 : Math.min((width - 32) * 0.47, 184)

	return (
		<View className="w-full">
			{/* the illustration lines up with the toolbar's search icon and extends behind the toolbar */}
			<View className="flex-row gap-3 bg-hero px-4 pb-3">
				<AnchorLink
					href="/"
					accessibilityLabel="CarlNotes home"
					className="relative -mb-2 overflow-hidden rounded-lg"
					style={{ marginLeft: SEARCH_ICON_INSET, width: imageColumnWidth - SEARCH_ICON_INSET }}
				>
					<Image
						source={require("../../../assets/carl-hero.png")}
						accessibilityLabel={HERO_IMAGE_ALT}
						resizeMode="cover"
						className="absolute inset-0 h-full w-full"
					/>
				</AnchorLink>
				{/* sign-up and the note are separate touch targets */}
				<View className="min-w-0 flex-1 gap-1 py-3">
					<Text className={`${HERO_COPY_CLASS} text-hero-foreground`}>
						{HERO_CALL_TO_ACTION.opening}{" "}
						<AnchorLink
							asChild
							href={{ pathname: "/sign-up", params: { cta: "new-topic" } }}
							accessibilityLabel={HERO_CALL_TO_ACTION.linkText}
							onPress={() => rememberSessionReturnPath(pathname)}
						>
							<Text className={`${HERO_COPY_CLASS} font-bold text-hero-foreground underline`}>
								{HERO_CALL_TO_ACTION.linkText}
							</Text>
						</AnchorLink>
					</Text>
					<Pressable
						ref={pitchTriggerRef}
						accessibilityRole="button"
						accessibilityLabel={HERO_PITCH_LABEL}
						onPress={() => setIsPitchOpen(true)}
						className="min-h-12 justify-center"
					>
						<Text className={`${HERO_COPY_CLASS} text-hero-foreground`}>
							{HERO_CALL_TO_ACTION.closing} <NoteIcon size={HERO_NOTE_SIZE} />
						</Text>
					</Pressable>
					<Text className={`${HERO_COPY_CLASS} font-bold text-hero-accent`}>{HERO_TAGLINE}</Text>
				</View>
			</View>
			{/* SearchBar supplies the overlap with the illustration. */}
			<View className="z-10">
				<SearchBar filters={filters} hasSort={false} actions={<PageActionMenu page="Home" />} />
			</View>
			{/* the pitch, which the phone web shows in a popover from the note button */}
			{isPitchOpen ? (
				<Sheet title={HERO_PITCH_LABEL} triggerRef={pitchTriggerRef} onClose={() => setIsPitchOpen(false)}>
					<Text className="px-2 pb-2 text-sm">{CARL_PITCH}</Text>
				</Sheet>
			) : null}
		</View>
	)
}

import { SITE_URL } from "@carlnotes/contracts/site"
import type { LucideIcon } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import type { View } from "react-native"
import { Button, type ButtonProps } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { AnchorLink } from "./AnchorLink"
import { Sheet, type SheetProps } from "./Sheet"

// the native placeholder names the web feature and its existing destination
type WebFeatureProps = {
	title: string
	description: string
	path?: string
}

/**
 * Keeps an unfinished native action visible with an explicit web handoff.
 */
export function WebFeatureButton({
	title,
	description,
	path,
	label = title,
	icon,
	...buttonProps
}: WebFeatureProps & { label?: string; icon?: LucideIcon } & Pick<ButtonProps, "variant" | "className" | "size">) {
	// return focus to the action after dismissing its explanation
	const [isOpen, setIsOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<>
			<Button {...buttonProps} ref={triggerRef} accessibilityLabel={label} onPress={() => setIsOpen(true)}>
				{icon ? <Icon as={icon} /> : null}
				<Text>{label}</Text>
			</Button>
			{isOpen ? (
				<WebFeatureSheet
					title={title}
					description={description}
					path={path}
					triggerRef={triggerRef}
					onClose={() => setIsOpen(false)}
				/>
			) : null}
		</>
	)
}

/**
 * Explains a web-only feature before opening CarlNotes in the app browser.
 */
export function WebFeatureSheet({
	title,
	description,
	path = "/",
	...sheetProps
}: WebFeatureProps & Pick<SheetProps, "onClose" | "triggerRef">) {
	return (
		<Sheet title={title} {...sheetProps}>
			<Text className="mb-4 text-sm text-muted-foreground">{description}</Text>
			<Button asChild accessibilityLabel="Open on carlnotes.com">
				<AnchorLink href={`${SITE_URL}${path}`} accessibilityLabel="Open on carlnotes.com">
					<Text>Open on carlnotes.com</Text>
				</AnchorLink>
			</Button>
		</Sheet>
	)
}

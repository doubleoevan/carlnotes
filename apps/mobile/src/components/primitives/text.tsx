// the app's text in the body font, in the text classes of the Button or Badge around the text. native text does not
// inherit its container's color
import { cn } from "@carlnotes/nightshift/classNames"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { createContext, useContext } from "react"
import { Text as NativeText, type TextProps } from "react-native"

/** The text classes a Button or Badge gives the Text and the Icon inside it. */
export const TextClassContext = createContext<string | undefined>(undefined)

// the body font. the root layout registers it with each weight, so a weight class selects the face
const BODY_FONT_STYLE = { fontFamily: fontFamilies.sans.name }

/**
 * Text in the body font, in the classes of the Button or Badge around it.
 */
export function Text({ className, style, ...props }: TextProps) {
	// read the classes of the Button or Badge around the text, which the text's own className overrides
	const textClassName = useContext(TextClassContext)
	return (
		<NativeText
			className={cn("text-base text-foreground", textClassName, className)}
			style={[BODY_FONT_STYLE, style]}
			{...props}
		/>
	)
}

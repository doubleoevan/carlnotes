// a Lucide icon drawn with classes. Uniwind reads the icon's size and color from its className, and a Button or Badge
// around the icon gives its text color
import { cn } from "@carlnotes/nightshift/classNames"
import type { LucideIcon, LucideProps } from "lucide-react-native"
import { useContext } from "react"
import { withUniwind } from "uniwind"
import { TextClassContext } from "./text"

// an icon's props, the Lucide icon to draw and Lucide's own props
type IconProps = LucideProps & { as: LucideIcon }

// the Lucide icon with its size read from the className's width and its color from the className's text color
const ClassNameIcon = withUniwind(({ as: IconComponent, ...props }: IconProps) => <IconComponent {...props} />, {
	size: { fromClassName: "className", styleProperty: "width" },
	color: { fromClassName: "className", styleProperty: "color" },
})

/**
 * A Lucide icon at 16 points in the text color around it, which its className overrides.
 */
export function Icon({ as: IconComponent, className, ...props }: IconProps) {
	// read the classes of the Button or Badge around the icon, which the icon's own className overrides
	const textClassName = useContext(TextClassContext)
	return (
		<ClassNameIcon as={IconComponent} className={cn("size-4 text-foreground", textClassName, className)} {...props} />
	)
}

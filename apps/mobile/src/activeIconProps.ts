// the mobile counterpart of the web's ACTIVE_ICON_CLASS
import { cn } from "@carlnotes/nightshift/classNames"

/**
 * Returns an icon's class and fill: filled in the primary color if the icon is active, and an outline otherwise.
 */
export function toActiveIconProps(
	isActive: boolean | undefined,
	className?: string,
): { className: string; fill: string } {
	return { className: cn(className, isActive && "text-primary"), fill: isActive ? "currentColor" : "none" }
}

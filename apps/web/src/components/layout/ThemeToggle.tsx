import { cn } from "@carlnotes/nightshift/classNames"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { HERO_BUTTON_HOVER_CLASS } from "@/lib/styleClasses"

/**
 * The theme toggle button. the icon shows the mode you would switch to, the moon for dark and the sun for light
 */
export function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
	// the theme mode that the toggle will switch to
	const themeMode = isDark ? "Light mode" : "Dark mode"
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onToggle}
					aria-label={themeMode}
					className={cn("size-11 sm:size-9", HERO_BUTTON_HOVER_CLASS)}
				>
					{isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{themeMode}</TooltipContent>
		</Tooltip>
	)
}

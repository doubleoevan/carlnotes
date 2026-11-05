import { PersonalSourcesImportButton as SharedPersonalSourcesImportButton } from "@carlnotes/core/components/PersonalSourcesImportButton"
import type { PersonalSourcesImportControlProps } from "@carlnotes/core/components/TopicPersonalSources"
import { Button } from "@/components/primitives/button"
import { PersonalSourcesImportDialog } from "./PersonalSourcesImportDialog"

/**
 * Adapts the shared import opener to browser controls.
 */
export function PersonalSourcesImportButton(props: PersonalSourcesImportControlProps) {
	return (
		<SharedPersonalSourcesImportButton
			{...props}
			renderButton={({ label, isDisabled, onPress }) => (
				<Button
					type="button"
					variant="outline"
					disabled={isDisabled}
					onClick={onPress}
					className="h-auto max-w-full whitespace-normal"
				>
					{label}
				</Button>
			)}
			renderDialog={(dialog) => <PersonalSourcesImportDialog {...dialog} />}
		/>
	)
}

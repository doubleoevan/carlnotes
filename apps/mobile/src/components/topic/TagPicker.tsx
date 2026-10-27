import { Plus } from "lucide-react-native"
import { useState } from "react"
import { View } from "react-native"
import { MultiCombobox } from "@/components/common/MultiCombobox"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { SessionTextInput } from "@/components/session/SessionTextInput"

/**
 * Selects existing tags and stages new ones in the Topic form.
 */
export function TagPicker({
	tags,
	knownTags,
	onTagsChange,
}: {
	tags: string[]
	knownTags: string[]
	onTagsChange: (tags: string[]) => void
}) {
	const [newTag, setNewTag] = useState("")
	function handleAdd(): void {
		const tag = newTag.trim()
		if (tag && !tags.includes(tag)) {
			onTagsChange([...tags, tag])
		}
		setNewTag("")
	}
	return (
		<View className="gap-2">
			<MultiCombobox
				label="Tags"
				options={[...new Set([...knownTags, ...tags])].map((tag) => ({ value: tag, label: tag }))}
				values={tags}
				onUpdateValues={onTagsChange}
				placeholder="Pick tags…"
				emptyLabel="No tags yet."
			/>
			<View className="flex-row items-end gap-2">
				<View className="flex-1">
					<SessionTextInput
						label="New tag"
						value={newTag}
						onChangeText={setNewTag}
						onSubmitEditing={handleAdd}
						placeholder="add a tag…"
					/>
				</View>
				<Button variant="outline" accessibilityLabel="Add tag" disabled={!newTag.trim()} onPress={handleAdd}>
					<Icon as={Plus} className="size-4" />
				</Button>
			</View>
		</View>
	)
}

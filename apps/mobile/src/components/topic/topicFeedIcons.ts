import type { TagMatchMode, TopicFinding, TopicFindingSort } from "@carlnotes/contracts/findings"
import { TRENDING_SORT_EMOJI } from "@carlnotes/core/lib/topicFeedLabels"
import {
	Ban,
	Blend,
	CircleX,
	Clock,
	File,
	FileText,
	Headphones,
	type LucideIcon,
	Play,
	Target,
} from "lucide-react-native"

// native bindings for the web's sort, resource, and tag icons
export const TOPIC_FINDING_SORT_ICONS: Record<TopicFindingSort, LucideIcon | string> = {
	relevant: Target,
	newest: Clock,
	trending: TRENDING_SORT_EMOJI,
}
export const RESOURCE_KIND_ICON: Record<TopicFinding["resourceKind"], LucideIcon> = {
	read: FileText,
	watch: Play,
	listen: Headphones,
	unknown: File,
}
export const TAG_MATCH_ICONS: Record<TagMatchMode, LucideIcon> = {
	any: Blend,
	all: Target,
	none: Ban,
	off: CircleX,
}

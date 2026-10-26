import type { TagMatchMode, TopicFindingSort } from "@carlnotes/contracts/findings"
import type { ResourceKind } from "@carlnotes/core/lib/topicFeed"
import {
	Ban,
	Blend,
	CircleX,
	Clock,
	FileText,
	Flame,
	Headphones,
	type LucideIcon,
	Play,
	Target,
} from "lucide-react-native"

// native bindings for the web's sort, resource, and tag icons
export const TOPIC_FINDING_SORT_ICONS: Record<TopicFindingSort, LucideIcon> = {
	relevant: Target,
	newest: Clock,
	trending: Flame,
}
export const RESOURCE_KIND_ICON: Record<ResourceKind, LucideIcon> = {
	read: FileText,
	watch: Play,
	listen: Headphones,
}
export const TAG_MATCH_ICONS: Record<TagMatchMode, LucideIcon> = {
	any: Blend,
	all: Target,
	none: Ban,
	off: CircleX,
}

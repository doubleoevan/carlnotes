// the MCP view's Topic Post editor, which draws nothing for an MCP view that edits no post. the MCP view build puts
// this module in place of @/components/topicPost/TopicPostEditor, which keeps the editor's code out of the bundle
import type { ComponentProps, ComponentType } from "react"
import type * as topicPostEditor from "@/components/topicPost/TopicPostEditor"

export const TopicPostEditor: ComponentType<ComponentProps<typeof topicPostEditor.TopicPostEditor>> = () => null

// the MCP view's voice detector, which never starts. the MCP view build puts this module in place of
// @/lib/voiceActivity
import type * as voiceActivity from "@/lib/voiceActivity"

export const startVoiceActivity: typeof voiceActivity.startVoiceActivity = async () => null

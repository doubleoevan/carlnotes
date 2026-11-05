// the MCP view's visit analytics, which report nothing: an MCP view's content security policy allows no connection out, so the
// site's analytics client would only add to the MCP view's script. the MCP view build puts this module in place of
// @/lib/visitAnalytics
import type * as visitAnalytics from "@/lib/visitAnalytics"

export const startVisitAnalytics: typeof visitAnalytics.startVisitAnalytics = () => {}
export const toReportedEvent: typeof visitAnalytics.toReportedEvent = (capturedEvent) => capturedEvent
export const captureVisit: typeof visitAnalytics.captureVisit = () => {}
export const captureVisitEvent: typeof visitAnalytics.captureVisitEvent = () => {}
export const toPublicTopicProperties: typeof visitAnalytics.toPublicTopicProperties = () => ({})
export const captureEpisodeVisitEvent: typeof visitAnalytics.captureEpisodeVisitEvent = () => {}

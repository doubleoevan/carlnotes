// the dashboard MCP view that draws nothing, for the bundle every other MCP view shares
import type { ComponentProps, ComponentType } from "react"
import type * as dashboardMcpView from "./DashboardMcpView"

export const DashboardMcpView: ComponentType<ComponentProps<typeof dashboardMcpView.DashboardMcpView>> = () => null

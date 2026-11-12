// the map of counts by place drawn by ECharts over a low-detail world outline, where Google Maps cannot load: an MCP
// host's sandboxed frame, and a site with no Google Maps key. it zooms and pans like the Google map, with the same pins
// and counts and no hover tooltip. a click on a pin zooms to its places, and a click on one place opens its detail
// over the map until it closes
import type { DashboardPin } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_IMAGE_LABELS,
	type DashboardChartProps,
	toDashboardSeriesColor,
} from "@carlnotes/core/lib/dashboardCharts"
import {
	DASHBOARD_MAP_BOX,
	type DashboardMapBounds,
	type DashboardMapPin,
	toDashboardMapPins,
} from "@carlnotes/core/lib/dashboardMapPins"
import { toChartTheme } from "@carlnotes/nightshift/chartTheme"
import { ScatterChart } from "echarts/charts"
import { GeoComponent } from "echarts/components"
import { type EChartsCoreOption, registerMap, use } from "echarts/core"
import { useMemo, useState } from "react"
import { feature } from "topojson-client"
import countriesTopology from "world-atlas/countries-110m.json"
import { useColorMode } from "@/hooks/useColorMode"
import { EChart, type EChartEventHandler } from "./EChart"
import { PointDetailPanel } from "./PointDetailPanel"

use([GeoComponent, ScatterChart])

// the world's countries as GeoJSON, registered once under one name without Antarctica, and with each ring that crosses
// the 180th meridian kept on one side so it draws no line across the world
const WORLD_MAP_NAME = "world"
const ANTARCTICA_ID = "010"
const worldTopology = countriesTopology as unknown as Parameters<typeof feature>[0]
const worldCountries = feature(worldTopology, "countries") as unknown as WorldCountries
registerMap(WORLD_MAP_NAME, {
	...worldCountries,
	features: worldCountries.features
		.filter(({ id }) => id !== ANTARCTICA_ID)
		.map((country) => ({ ...country, geometry: toOneSideGeometry(country.geometry) })),
} as never)

// the map's zoom, and its center as longitude and latitude or the whole world before a pan
type MapView = { zoom: number; center: number[] | undefined }

// the open place and where its pin sits on the map in pixels
type OpenPlace = { mapPin: DashboardMapPin; x: number; y: number }

// how far the map zooms in, and the share of the map a zoom to a pin's places fills
const MAX_OUTLINE_ZOOM = 32
const ZOOM_FILL = 0.6

// the degrees of longitude and latitude the outline spans at zoom 1, the world without Antarctica, and its middle
// latitude
const WORLD_LONGITUDE_SPAN = 360
const WORLD_LATITUDE_SPAN = 140
const WORLD_MIDDLE_LATITUDE = 14

/**
 * Draws the pins over the world outline, each with its count, where nearby places share one pin.
 */
export function OutlineMap({ data, playFormat, seriesColors, onItemPress }: DashboardChartProps<DashboardPin[]>) {
	// the page's color mode, the map's zoom and center kept so a redraw stays where it was left, and the open place
	const colorMode = useColorMode()
	const [mapView, setMapView] = useState<MapView>({ zoom: 1, center: undefined })
	const { zoom } = mapView
	const [openPlace, setOpenPlace] = useState<OpenPlace | null>(null)

	// the pins at the zoom, each at its size
	const mapPins = useMemo(() => toDashboardMapPins(data, toGoogleZoom(zoom)), [data, zoom])
	const option = useMemo(
		(): EChartsCoreOption => ({
			geo: {
				map: WORLD_MAP_NAME,
				roam: true,
				zoom: mapView.zoom,
				...(mapView.center && { center: mapView.center }),
				scaleLimit: { min: 1, max: MAX_OUTLINE_ZOOM },
				emphasis: { disabled: true },
				select: { disabled: true },
			},
			series: [
				{
					type: "scatter",
					coordinateSystem: "geo",
					data: mapPins.map(({ longitude, latitude, size }) => ({ value: [longitude, latitude], symbolSize: size })),
					itemStyle: { color: toDashboardSeriesColor(seriesColors, 0), opacity: 0.9 },
					label: {
						show: true,
						position: "inside",
						formatter: ({ dataIndex }: { dataIndex: number }) => mapPins[dataIndex]?.label ?? "",
						color: toChartTheme(colorMode).mapPinLabel.color,
						fontSize: 12,
						fontWeight: 600,
					},
					emphasis: { scale: false },
					cursor: "pointer",
				},
			],
		}),
		[colorMode, mapPins, mapView, seriesColors],
	)

	// a zoom or pan keeps the new view and closes the open place. a pin with places zooms to them, and one place opens
	// its detail at its pin
	const events = useMemo(
		(): Record<string, EChartEventHandler> => ({
			georoam: (_params, chart) => {
				const geoOption = (chart.getOption().geo as Partial<MapView>[] | undefined)?.[0]
				setMapView(toWorldView({ zoom: geoOption?.zoom ?? 1, center: geoOption?.center }))
				setOpenPlace(null)
			},
			click: ({ dataIndex }, chart) => {
				const mapPin = mapPins[dataIndex]
				if (mapPin?.zoomBounds) {
					setMapView(toBoundsView(mapPin.zoomBounds))
					setOpenPlace(null)
				} else if (mapPin) {
					const [x = 0, y = 0] = chart.convertToPixel({ geoIndex: 0 }, [mapPin.longitude, mapPin.latitude])
					setOpenPlace({ mapPin, x, y })
				}
			},
		}),
		[mapPins],
	)
	return (
		<div className="relative">
			{/* the map */}
			<EChart
				option={option}
				height={DASHBOARD_MAP_BOX.maxHeight}
				aspectRatio={String(DASHBOARD_MAP_BOX.aspectRatio)}
				label={DASHBOARD_CHART_IMAGE_LABELS.map}
				events={events}
			/>

			{/* the open place's detail above its pin, the same lines as the Google map's info window */}
			{openPlace && (
				<PointDetailPanel
					point={openPlace.mapPin.point}
					playFormat={playFormat}
					onItemPress={onItemPress}
					onClose={() => setOpenPlace(null)}
					className="w-72 max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-full"
					style={{ left: openPlace.x, top: openPlace.y - 16 }}
				/>
			)}
		</div>
	)
}

// an outline zoom as the Google map's zoom level, where the whole world is about level 1 and each level doubles it.
// ponytail: a rough match, enough to switch to city pins at about the same depth as the Google map
function toGoogleZoom(outlineZoom: number): number {
	return 1 + Math.log2(outlineZoom)
}

// the view centered on a box of places, zoomed so the box fills part of the map
function toBoundsView({ north, south, east, west }: DashboardMapBounds): MapView {
	const fitZoom =
		ZOOM_FILL * Math.min(WORLD_LONGITUDE_SPAN / (east - west || 1), WORLD_LATITUDE_SPAN / (north - south || 1))
	return toWorldView({
		zoom: Math.min(Math.max(fitZoom, 1), MAX_OUTLINE_ZOOM),
		center: [(east + west) / 2, (north + south) / 2],
	})
}

// the view with its center moved back just enough that the outline's edges never pull inside the map's frame, so a pan
// cannot drag the world out of sight
function toWorldView({ zoom, center }: MapView): MapView {
	if (!center) {
		return { zoom, center }
	}
	const [longitude = 0, latitude = WORLD_MIDDLE_LATITUDE] = center
	const longitudeReach = (WORLD_LONGITUDE_SPAN / 2) * (1 - 1 / zoom)
	const latitudeReach = (WORLD_LATITUDE_SPAN / 2) * (1 - 1 / zoom)
	return {
		zoom,
		center: [
			Math.min(Math.max(longitude, -longitudeReach), longitudeReach),
			Math.min(Math.max(latitude, WORLD_MIDDLE_LATITUDE - latitudeReach), WORLD_MIDDLE_LATITUDE + latitudeReach),
		],
	}
}

// the countries' GeoJSON, as topojson's feature returns it for the world atlas
type Ring = number[][]
type CountryGeometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] }
type WorldCountries = {
	type: "FeatureCollection"
	features: { type: "Feature"; id?: string; properties: unknown; geometry: CountryGeometry }[]
}

// a country's geometry with every ring kept on one side of the 180th meridian
function toOneSideGeometry(geometry: CountryGeometry): CountryGeometry {
	if (geometry.type === "Polygon") {
		return { type: "Polygon", coordinates: geometry.coordinates.map(toOneSideRing) }
	}
	return { type: "MultiPolygon", coordinates: geometry.coordinates.map((polygon) => polygon.map(toOneSideRing)) }
}

// a ring that jumps across the 180th meridian moves its western points past 180 degrees east, so the ring stays whole
function toOneSideRing(ring: Ring): Ring {
	const isCrossing = ring.some(
		([longitude = 0], i) => i > 0 && Math.abs(longitude - (ring[i - 1]?.[0] ?? longitude)) > 180,
	)
	if (!isCrossing) {
		return ring
	}
	return ring.map(([longitude = 0, latitude = 0]) => [longitude < 0 ? longitude + 360 : longitude, latitude])
}

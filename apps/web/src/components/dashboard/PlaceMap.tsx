// the web's map of counts by place: Google Maps with Advanced Markers on the site's Map ID. nearby places share one
// pin with their count, a click on it zooms to its places, and a click on one place opens its detail. the map loads
// once its box scrolls into view, and a site with no Google Maps key or Map ID loads the outline map instead
import { fetchDashboardMapSettings } from "@carlnotes/client/dashboardClient"
import type { DashboardMapSettings, DashboardPin } from "@carlnotes/contracts/dashboards"
import { DashboardPointDetail } from "@carlnotes/core/components/DashboardPointDetail"
import { type DashboardChartProps, toDashboardSeriesColor } from "@carlnotes/core/lib/dashboardCharts"
import {
	DASHBOARD_MAP_BOX,
	DASHBOARD_MAP_CENTER,
	DASHBOARD_MAP_ZOOM_PADDING,
	type DashboardMapPin,
	toDashboardMapPins,
} from "@carlnotes/core/lib/dashboardMapPins"
import { useQuery } from "@tanstack/react-query"
import {
	AdvancedMarker,
	APIProvider,
	ColorScheme,
	Map as GoogleMap,
	InfoWindow,
	useMap,
} from "@vis.gl/react-google-maps"
import { lazy, Suspense, useMemo, useState } from "react"
import { useColorMode } from "@/hooks/useColorMode"
import { useIsVisible } from "@/hooks/useIsVisible"
import { SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"
import { POINT_DETAIL_ELEMENTS } from "./pointDetailElements"

// the outline map's code, loaded only for a site without Google Maps
const LazyOutlineMap = lazy(() => import("./OutlineMap").then((outlineMap) => ({ default: outlineMap.OutlineMap })))

// where the map starts: the whole world
const STARTING_CENTER = { lat: DASHBOARD_MAP_CENTER.latitude, lng: DASHBOARD_MAP_CENTER.longitude }
const STARTING_ZOOM = 1

/**
 * Draws the pins on Google Maps, or on the outline map without a key, once the map's box scrolls into view.
 */
export function PlaceMap(props: DashboardChartProps<DashboardPin[]>) {
	// the placeholder until the box scrolls into view, which it never does inside a closed section
	const { ref, isVisible } = useIsVisible<HTMLDivElement>()
	return <div ref={ref}>{isVisible ? <LoadedPlaceMap {...props} /> : <MapPlaceholder />}</div>
}

// the map once its settings read: Google Maps with a key and a Map ID, else the outline map
function LoadedPlaceMap(props: DashboardChartProps<DashboardPin[]>) {
	// the site's Google Maps settings, read once, with a placeholder while they read
	const mapSettingsQuery = useQuery({
		queryKey: ["dashboardMapSettings"],
		queryFn: fetchDashboardMapSettings,
		staleTime: Number.POSITIVE_INFINITY,
	})
	if (mapSettingsQuery.isPending) {
		return <MapPlaceholder />
	}

	// Google Maps with both settings, else the outline map once its code loads
	const { apiKey, mapId } = mapSettingsQuery.data ?? { apiKey: null, mapId: null }
	if (apiKey && mapId) {
		return <GooglePlaceMap {...props} mapSettings={{ apiKey, mapId }} />
	}
	return (
		<Suspense fallback={<MapPlaceholder />}>
			<LazyOutlineMap {...props} />
		</Suspense>
	)
}

// the Google map filling its wrapper's box
const MAP_FILL_STYLE = { width: "100%", height: "100%" }

// the map's box as a loading shape
function MapPlaceholder() {
	return <div className={SKELETON_SHAPE_CLASS} style={DASHBOARD_MAP_BOX} />
}

// the Google map with its settings, both set
function GooglePlaceMap({
	mapSettings,
	...chartProps
}: DashboardChartProps<DashboardPin[]> & { mapSettings: { [Key in keyof DashboardMapSettings]: string } }) {
	// the page's color mode, and the place whose detail is open
	const colorMode = useColorMode()
	const [openPin, setOpenPin] = useState<DashboardMapPin | null>(null)

	// the camera where it was left. Google applies a color mode only to a new map, which starts at this camera
	const [center, setCenter] = useState(STARTING_CENTER)
	const [zoom, setZoom] = useState(STARTING_ZOOM)

	// the map in the page's color mode, with Google's controls: map or satellite with terrain and labels, Street View,
	// full screen, and the camera's zoom and pan. the box and its corners sit on a wrapper, because the map drops its
	// style if it also has a class
	return (
		<APIProvider apiKey={mapSettings.apiKey}>
			<div data-place-map className="overflow-hidden rounded-md" style={DASHBOARD_MAP_BOX}>
				<GoogleMap
					mapId={mapSettings.mapId}
					colorScheme={colorMode === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT}
					defaultCenter={center}
					defaultZoom={zoom}
					gestureHandling="cooperative"
					mapTypeControl
					streetViewControl
					fullscreenControl
					cameraControl
					onZoomChanged={(event) => {
						setZoom(event.detail.zoom)
						setOpenPin(null)
					}}
					onIdle={(event) => setCenter(event.map.getCenter()?.toJSON() ?? center)}
					style={MAP_FILL_STYLE}
				>
					<GooglePlacePins {...chartProps} zoom={zoom} openPin={openPin} onOpenPinChange={setOpenPin} />
				</GoogleMap>
			</div>
		</APIProvider>
	)
}

// the pins inside the map, which zoom it to a pin's places, and the open place's detail
function GooglePlacePins({
	data,
	playFormat,
	seriesColors,
	onItemPress,
	zoom,
	openPin,
	onOpenPinChange,
}: DashboardChartProps<DashboardPin[]> & {
	zoom: number
	openPin: DashboardMapPin | null
	onOpenPinChange: (mapPin: DashboardMapPin | null) => void
}) {
	// the map the pins sit on
	const map = useMap()

	// the pins at the zoom, each at its size in the first series color
	const mapPins = useMemo(() => toDashboardMapPins(data, zoom), [data, zoom])
	const pinColor = toDashboardSeriesColor(seriesColors, 0)

	// a pin with places zooms the map to them, and one place opens its detail
	const handlePinClick = (mapPin: DashboardMapPin) => {
		if (mapPin.zoomBounds) {
			map?.fitBounds(mapPin.zoomBounds, DASHBOARD_MAP_ZOOM_PADDING)
			return
		}
		onOpenPinChange(mapPin)
	}
	return (
		<>
			{/* the pins */}
			{mapPins.map((mapPin) => (
				<AdvancedMarker
					key={mapPin.key}
					position={{ lat: mapPin.latitude, lng: mapPin.longitude }}
					title={mapPin.point.title}
					onClick={() => handlePinClick(mapPin)}
				>
					<span
						className="border-card text-primary-foreground flex items-center justify-center rounded-full border-2 text-xs font-semibold tabular-nums opacity-90"
						style={{ width: mapPin.size, height: mapPin.size, backgroundColor: pinColor }}
					>
						{mapPin.label}
					</span>
				</AdvancedMarker>
			))}

			{/* the open place's detail under its title in the window's header, in black on Google's info window, which
			stays white in dark mode */}
			{openPin && (
				<InfoWindow
					position={{ lat: openPin.latitude, lng: openPin.longitude }}
					onCloseClick={() => onOpenPinChange(null)}
					headerContent={<strong className="text-sm text-black">{openPin.point.title}</strong>}
				>
					<div className="text-sm text-black">
						<DashboardPointDetail
							point={openPin.point}
							playFormat={playFormat}
							onItemPress={onItemPress}
							elements={POINT_DETAIL_ELEMENTS}
						/>
					</div>
				</InfoWindow>
			)}
		</>
	)
}

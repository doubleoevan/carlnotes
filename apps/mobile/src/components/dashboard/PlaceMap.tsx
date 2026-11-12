// the app's map of visitors by place: react-native-maps with Google Maps on Android, and on iOS if the build has the
// Google Maps key, else Apple Maps. nearby places share one pin with their count, a tap on it zooms to its places, and
// a tap on one place opens its sheet. a switch picks the map, satellite, or terrain view, and buttons zoom in and out
import type { DashboardPin } from "@carlnotes/contracts/dashboards"
import { type DashboardChartProps, toDashboardCountLines } from "@carlnotes/core/lib/dashboardCharts"
import {
	DASHBOARD_MAP_BOX,
	DASHBOARD_MAP_CENTER,
	DASHBOARD_MAP_ZOOM_PADDING,
	toDashboardMapPins,
	WORLD_TILE_SIZE,
} from "@carlnotes/core/lib/dashboardMapPins"
import { cn } from "@carlnotes/nightshift/classNames"
import { darkRoast } from "@carlnotes/nightshift/colors"
import Constants from "expo-constants"
import { Minus, Plus } from "lucide-react-native"
import { useMemo, useRef, useState } from "react"
import { Platform, View } from "react-native"
import MapView, { type MapStyleElement, type MapType, Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { useColorMode } from "@/theme"

// where the map starts: the whole world
const STARTING_REGION: Region = { ...DASHBOARD_MAP_CENTER, latitudeDelta: 140, longitudeDelta: 360 }

// the space a zoom to a pin's places keeps around them on every side, as on the web
const ZOOM_EDGE_PADDING = {
	top: DASHBOARD_MAP_ZOOM_PADDING,
	right: DASHBOARD_MAP_ZOOM_PADDING,
	bottom: DASHBOARD_MAP_ZOOM_PADDING,
	left: DASHBOARD_MAP_ZOOM_PADDING,
}

// whether the map draws with Google Maps, which an iOS build has only with its key
const isGoogleMap = Platform.OS === "android" || Constants.expoConfig?.extra?.isGoogleMapsOnIos === true

// the views the switch offers, satellite with its labels as on the web. Apple Maps draws no terrain
const MAP_TYPE_OPTIONS: { mapType: MapType; label: string }[] = [
	{ mapType: "standard", label: "Map" },
	{ mapType: "hybrid", label: "Satellite" },
	...(isGoogleMap ? [{ mapType: "terrain" as const, label: "Terrain" }] : []),
]

// the factor one zoom button press scales the region's span by
const ZOOM_STEP = 2

// Google Maps' dark style from the dark Nightshift colors
const DARK_MAP_STYLE: MapStyleElement[] = [
	{ elementType: "geometry", stylers: [{ color: darkRoast.card }] },
	{ featureType: "water", elementType: "geometry", stylers: [{ color: darkRoast.background }] },
	{ elementType: "labels.text.fill", stylers: [{ color: darkRoast.mutedForeground }] },
	{ elementType: "labels.text.stroke", stylers: [{ color: darkRoast.card }] },
]

/**
 * Draws the pins on the map, each sized by its people against the most in one pin.
 */
export function PlaceMap({ data, playFormat, seriesColors, onPointFocus }: DashboardChartProps<DashboardPin[]>) {
	// the color mode the map draws in, and the map the zoom buttons and a pin's zoom move
	const colorMode = useColorMode()
	const mapRef = useRef<MapView>(null)

	// the map's width and its region's longitude span, which give its zoom, and the view the switch picked
	const [mapWidth, setMapWidth] = useState(WORLD_TILE_SIZE)
	const [region, setRegion] = useState(STARTING_REGION)
	const zoom = toZoom(region.longitudeDelta, mapWidth)
	const [mapType, setMapType] = useState<MapType>("standard")

	// a zoom button halves or doubles the region's span around its center
	const handleZoom = (scale: number) => {
		mapRef.current?.animateToRegion({
			...region,
			latitudeDelta: Math.min(region.latitudeDelta * scale, 180),
			longitudeDelta: Math.min(region.longitudeDelta * scale, 360),
		})
	}

	// the pins at the zoom, each at its size
	const mapPins = useMemo(() => toDashboardMapPins(data, zoom), [data, zoom])

	// the map in the app's color mode, keyed by it so Google restyles, starting where the reader left it
	return (
		<View
			className="overflow-hidden rounded-md"
			style={DASHBOARD_MAP_BOX}
			onLayout={(event) => setMapWidth(event.nativeEvent.layout.width)}
		>
			<MapView
				ref={mapRef}
				key={colorMode}
				provider={isGoogleMap ? PROVIDER_GOOGLE : undefined}
				initialRegion={region}
				userInterfaceStyle={colorMode}
				customMapStyle={colorMode === "dark" && isGoogleMap ? DARK_MAP_STYLE : []}
				mapType={mapType}
				rotateEnabled={false}
				pitchEnabled={false}
				toolbarEnabled={false}
				onRegionChangeComplete={setRegion}
				style={{ flex: 1 }}
			>
				{mapPins.map(({ key, latitude, longitude, size, label, point, zoomBounds }) => (
					<Marker
						key={key}
						coordinate={{ latitude, longitude }}
						accessibilityLabel={[point.title, ...toDashboardCountLines(point.counts, playFormat, "visit")].join(", ")}
						onPress={() => {
							// a pin with places zooms the map to them, and one place opens its sheet
							if (!zoomBounds) {
								onPointFocus(point)
								return
							}
							mapRef.current?.fitToCoordinates(
								[
									{ latitude: zoomBounds.north, longitude: zoomBounds.east },
									{ latitude: zoomBounds.south, longitude: zoomBounds.west },
								],
								{ edgePadding: ZOOM_EDGE_PADDING, animated: true },
							)
						}}
					>
						<View
							className="items-center justify-center rounded-full border-2 border-card opacity-90"
							style={{ width: size, height: size, backgroundColor: seriesColors[0] }}
						>
							<Text className="text-xs font-semibold text-primary-foreground tabular-nums">{label}</Text>
						</View>
					</Marker>
				))}
			</MapView>

			{/* the view switch at the top left */}
			<View className="absolute top-2 left-2 flex-row overflow-hidden rounded-md border border-border bg-card">
				{MAP_TYPE_OPTIONS.map((option) => (
					<Button
						key={option.mapType}
						variant="ghost"
						size="sm"
						className={cn("rounded-none", mapType === option.mapType && "bg-accent")}
						accessibilityLabel={`${option.label} view`}
						accessibilityState={{ selected: mapType === option.mapType }}
						onPress={() => setMapType(option.mapType)}
					>
						<Text>{option.label}</Text>
					</Button>
				))}
			</View>

			{/* the zoom buttons at the bottom right */}
			<View className="absolute right-2 bottom-2 gap-1">
				<Button variant="outline" size="icon-sm" accessibilityLabel="Zoom in" onPress={() => handleZoom(1 / ZOOM_STEP)}>
					<Icon as={Plus} />
				</Button>
				<Button variant="outline" size="icon-sm" accessibilityLabel="Zoom out" onPress={() => handleZoom(ZOOM_STEP)}>
					<Icon as={Minus} />
				</Button>
			</View>
		</View>
	)
}

// the map's zoom from its width and the longitude its region spans, the scale Google's zoom levels follow
function toZoom(longitudeDelta: number, mapWidth: number): number {
	return Math.log2((360 * mapWidth) / (WORLD_TILE_SIZE * Math.max(longitudeDelta, Number.EPSILON)))
}

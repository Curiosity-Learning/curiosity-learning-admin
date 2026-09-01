// Ported subset of the main repo's src/lib/maps/mapbox.ts (same Geocoding v6 endpoint, same
// label/coordinate normalization) so the admin portal's location fields behave exactly like the
// member app's. Kept dependency-free: no form-system types, and the map preview uses the Static
// Images API instead of mapbox-gl.

export const MAPBOX_STYLE = { username: 'ronberlinski', styleId: 'cmnb0lhyb004801sjb11783r0' };
export const MAPBOX_GEOCODING_LIMIT = 6;

export type MapboxCoordinates = {
	longitude: number;
	latitude: number;
};

export type MapboxLocationOption = MapboxCoordinates & {
	label: string;
	value: string;
};

type MapboxFeature = {
	properties?: {
		feature_type?: string;
		name?: string;
		full_address?: string;
		place_formatted?: string;
		coordinates?: {
			longitude?: number;
			latitude?: number;
		};
	};
	geometry?: {
		coordinates?: [number, number];
	};
};

type MapboxForwardResponse = {
	features?: MapboxFeature[];
};

const normalizeLabel = (feature: MapboxFeature) => {
	const properties = feature.properties ?? {};
	const fullAddress = properties.full_address?.trim();
	if (fullAddress) return fullAddress;

	const parts = [properties.name, properties.place_formatted]
		.map((part) => part?.trim())
		.filter((part): part is string => Boolean(part));

	if (parts.length === 0) return null;

	const deduped = parts.filter(
		(part, index) =>
			parts.findIndex((value) => value.toLowerCase() === part.toLowerCase()) === index
	);
	return deduped.join(', ');
};

const resolveCoordinates = (feature: MapboxFeature): MapboxCoordinates | null => {
	const coords = feature.properties?.coordinates;
	if (
		typeof coords?.longitude === 'number' &&
		Number.isFinite(coords.longitude) &&
		typeof coords.latitude === 'number' &&
		Number.isFinite(coords.latitude)
	) {
		return {
			longitude: coords.longitude,
			latitude: coords.latitude
		};
	}

	const geometryCoordinates = feature.geometry?.coordinates;
	if (
		Array.isArray(geometryCoordinates) &&
		geometryCoordinates.length >= 2 &&
		Number.isFinite(geometryCoordinates[0]) &&
		Number.isFinite(geometryCoordinates[1])
	) {
		return {
			longitude: geometryCoordinates[0],
			latitude: geometryCoordinates[1]
		};
	}

	return null;
};

const parseForwardResponse = (payload: MapboxForwardResponse): MapboxLocationOption[] => {
	const seen = new Set<string>();
	const features = Array.isArray(payload.features) ? payload.features : [];
	const options: MapboxLocationOption[] = [];

	for (const feature of features) {
		const label = normalizeLabel(feature);
		const coordinates = resolveCoordinates(feature);
		if (!label || !coordinates) continue;
		const key = label.trim().toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		options.push({
			label,
			value: label,
			longitude: coordinates.longitude,
			latitude: coordinates.latitude
		});
		if (options.length >= MAPBOX_GEOCODING_LIMIT) break;
	}

	return options;
};

export const fetchMapboxLocationSuggestions = async (args: {
	query: string;
	accessToken: string;
	signal?: AbortSignal;
	language?: string;
	limit?: number;
}) => {
	const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
	url.searchParams.set('q', args.query);
	url.searchParams.set('access_token', args.accessToken);
	url.searchParams.set('autocomplete', 'true');
	url.searchParams.set('limit', String(args.limit ?? MAPBOX_GEOCODING_LIMIT));
	url.searchParams.set(
		'types',
		'country,region,postcode,district,place,locality,neighborhood,address'
	);
	if (args.language) {
		url.searchParams.set('language', args.language);
	}

	const response = await fetch(url.toString(), {
		signal: args.signal
	});
	if (!response.ok) {
		throw new Error('Unable to fetch location suggestions');
	}

	const payload = (await response.json()) as MapboxForwardResponse;
	return parseForwardResponse(payload);
};

// Static Images API preview (no mapbox-gl dependency): the same brand style as the member app's
// interactive preview, with a single marker on the selected coordinates.
export const mapboxStaticPreviewUrl = (args: {
	accessToken: string;
	coordinates: MapboxCoordinates;
	width?: number;
	height?: number;
	zoom?: number;
}) => {
	const { longitude, latitude } = args.coordinates;
	const width = args.width ?? 600;
	const height = args.height ?? 220;
	const zoom = args.zoom ?? 10;
	const marker = `pin-s+f5791d(${longitude},${latitude})`;
	return `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE.username}/${MAPBOX_STYLE.styleId}/static/${marker}/${longitude},${latitude},${zoom}/${width}x${height}@2x?access_token=${encodeURIComponent(args.accessToken)}`;
};

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Input } from '$lib/components/ui/input';
	import {
		MAPBOX_GEOCODING_LIMIT,
		fetchMapboxLocationSuggestions,
		mapboxStaticPreviewUrl,
		type MapboxCoordinates,
		type MapboxLocationOption
	} from '$lib/maps/mapbox';

	// Lean port of the member app's location-autocomplete-field: same Mapbox Geocoding v6
	// lookups, same select-a-suggestion-to-resolve-coordinates contract, but built on this
	// repo's plain Input instead of the member app's form system, with a Static Images map
	// preview instead of mapbox-gl.
	type Props = {
		id: string;
		value?: string;
		coordinates?: MapboxCoordinates | null;
		accessToken?: string;
		placeholder?: string;
		ariaLabel?: string;
		minChars?: number;
		debounceMs?: number;
	};

	let {
		id,
		value = $bindable(''),
		coordinates = $bindable<MapboxCoordinates | null>(null),
		accessToken = '',
		placeholder,
		ariaLabel,
		minChars = 2,
		debounceMs = 280
	}: Props = $props();

	let suggestions = $state<MapboxLocationOption[]>([]);
	let open = $state(false);
	let highlightedIndex = $state(-1);
	let lookupPending = $state(false);
	let lookupError = $state('');
	let lookupTimer: ReturnType<typeof setTimeout> | null = null;
	let lookupAbortController: AbortController | null = null;
	let lookupVersion = 0;
	const rememberedLocations = new SvelteMap<string, MapboxLocationOption>();

	const normalizeLocation = (input: string) => input.trim().toLowerCase();

	const clearLookupResources = () => {
		if (lookupTimer) {
			clearTimeout(lookupTimer);
			lookupTimer = null;
		}
		if (lookupAbortController) {
			lookupAbortController.abort();
			lookupAbortController = null;
		}
	};

	onDestroy(clearLookupResources);

	const selectOption = (option: MapboxLocationOption) => {
		rememberedLocations.set(normalizeLocation(option.value), option);
		value = option.label;
		coordinates = { longitude: option.longitude, latitude: option.latitude };
		suggestions = [];
		open = false;
		highlightedIndex = -1;
		lookupPending = false;
		lookupError = '';
		clearLookupResources();
	};

	// Debounced suggestion lookup, skipped for queries already resolved via a prior selection.
	$effect(() => {
		const query = value.trim();
		const normalizedQuery = normalizeLocation(query);
		clearLookupResources();
		lookupError = '';

		if (query.length < minChars || untrack(() => rememberedLocations.has(normalizedQuery))) {
			suggestions = [];
			open = false;
			lookupPending = false;
			return;
		}

		const nextVersion = ++lookupVersion;
		lookupPending = true;
		lookupTimer = setTimeout(async () => {
			if (!accessToken) {
				if (nextVersion === lookupVersion) {
					suggestions = [];
					lookupPending = false;
				}
				return;
			}

			const controller = new AbortController();
			lookupAbortController = controller;
			try {
				const payload = await fetchMapboxLocationSuggestions({
					query,
					accessToken,
					signal: controller.signal,
					language: navigator.language.split('-')[0] ?? 'en',
					limit: MAPBOX_GEOCODING_LIMIT
				});
				if (nextVersion !== lookupVersion) return;
				suggestions = payload;
				open = payload.length > 0;
				highlightedIndex = payload.length > 0 ? 0 : -1;
			} catch (error) {
				if (nextVersion !== lookupVersion) return;
				if (error instanceof DOMException && error.name === 'AbortError') return;
				suggestions = [];
				open = false;
				lookupError = 'Unable to fetch location suggestions.';
			} finally {
				if (nextVersion === lookupVersion) {
					lookupPending = false;
				}
			}
		}, debounceMs);
	});

	// Keep coordinates honest: they only exist while the text matches a resolved selection.
	$effect(() => {
		const normalizedLocation = normalizeLocation(value);
		if (!normalizedLocation) {
			coordinates = null;
			return;
		}
		const remembered = untrack(() => rememberedLocations.get(normalizedLocation));
		if (remembered) {
			coordinates = { longitude: remembered.longitude, latitude: remembered.latitude };
			return;
		}
		coordinates = null;
	});

	const onKeydown = (event: KeyboardEvent) => {
		if (!open || suggestions.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex + 1) % suggestions.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			const option = suggestions[highlightedIndex] ?? suggestions[0];
			if (option) selectOption(option);
		} else if (event.key === 'Escape') {
			open = false;
			highlightedIndex = -1;
		}
	};

	// Delay closing on blur so a mousedown on a suggestion still lands.
	const onBlur = () => {
		setTimeout(() => {
			open = false;
			highlightedIndex = -1;
		}, 120);
	};
</script>

<div class="relative">
	<Input
		{id}
		bind:value
		{placeholder}
		aria-label={ariaLabel}
		autocomplete="off"
		role="combobox"
		aria-expanded={open}
		aria-controls="{id}-listbox"
		onkeydown={onKeydown}
		onblur={onBlur}
		onfocus={() => {
			if (suggestions.length > 0) open = true;
		}}
	/>

	{#if open}
		<ul
			id="{id}-listbox"
			role="listbox"
			class="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-neutral-300 bg-white py-1 shadow-lg"
		>
			{#each suggestions as suggestion, index (suggestion.value)}
				<li role="option" aria-selected={index === highlightedIndex}>
					<button
						type="button"
						class="w-full px-3 py-2 text-left text-sm {index === highlightedIndex
							? 'bg-neutral-100 text-neutral-900'
							: 'text-neutral-700 hover:bg-neutral-50'}"
						onmousedown={(event) => {
							event.preventDefault();
							selectOption(suggestion);
						}}
						onmouseenter={() => (highlightedIndex = index)}
					>
						{suggestion.label}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if lookupPending}
	<p class="mt-1 text-xs text-neutral-400">Searching…</p>
{:else if lookupError}
	<p class="mt-1 text-xs text-amber-700">{lookupError}</p>
{:else if value.trim() && !coordinates}
	<p class="mt-1 text-xs text-neutral-500">Pick a suggestion to place the club on the map.</p>
{/if}

{#if accessToken && coordinates}
	<img
		src={mapboxStaticPreviewUrl({ accessToken, coordinates })}
		alt="Map preview of {value}"
		class="mt-2 h-[110px] w-full rounded-md border border-neutral-200 object-cover"
		loading="lazy"
	/>
{/if}

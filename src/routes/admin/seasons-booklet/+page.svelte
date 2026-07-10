<script lang="ts">
	// PRD 6.14.5/6.14.6 (CL-701): Seasons & Booklet curation. Two sub-sections in one route (tab
	// switcher) rather than two routes, to match the single nav item this replaces.
	import SeasonsTab from './seasons-tab.svelte';
	import BookletTab from './booklet-tab.svelte';
	import { cn } from '$lib/utils';

	let activeTab = $state<'seasons' | 'booklet'>('seasons');

	const tabs = [
		{ key: 'seasons' as const, label: 'Seasons' },
		{ key: 'booklet' as const, label: 'Activity Booklet' }
	];
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-xl font-semibold">Seasons & Booklet</h1>
		<p class="mt-1 text-sm text-neutral-500">
			Manage academic seasons and the shared activity booklet.
		</p>
	</div>

	<div class="flex gap-1 border-b border-neutral-300">
		{#each tabs as tab (tab.key)}
			<button
				type="button"
				class={cn(
					'rounded-t px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900',
					activeTab === tab.key && 'border-b-2 border-orange-500 text-neutral-900'
				)}
				onclick={() => (activeTab = tab.key)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if activeTab === 'seasons'}
		<SeasonsTab />
	{:else}
		<BookletTab />
	{/if}
</div>

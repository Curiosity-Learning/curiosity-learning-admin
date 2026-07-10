<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';

	// CL-693: Overview stub, ported from the main repo's src/routes/admin/+page.svelte.
	const countsResponse = useStableQuery(api.admin.getOverviewCounts, {});
	let counts = $derived(countsResponse.data ?? null);
</script>

<h1 class="text-xl font-semibold">Overview</h1>

<div class="mt-4 grid grid-cols-3 gap-3">
	<div class="rounded border border-neutral-300 bg-white p-4">
		<p class="text-2xl font-semibold">{counts?.clubCount ?? '—'}</p>
		<p class="text-sm text-neutral-500">Clubs</p>
	</div>
	<div class="rounded border border-neutral-300 bg-white p-4">
		<p class="text-2xl font-semibold">{counts?.profileCount ?? '—'}</p>
		<p class="text-sm text-neutral-500">Profiles</p>
	</div>
	<div class="rounded border border-neutral-300 bg-white p-4">
		<p class="text-2xl font-semibold">{counts?.openReportCount ?? '—'}</p>
		<p class="text-sm text-neutral-500">Open reports</p>
	</div>
</div>

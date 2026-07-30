<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';

	// Public Club Interest Form signups (main repo clubs.submitClubInterestSignup): people who
	// left an email + location asking to be told when a club opens near them. Read-only list —
	// there is no account attached to reach them in-app, so follow-up happens over email.
	const signupsResponse = useStableQuery(api.admin.adminListClubInterestSignups, {});
	let signups = $derived(signupsResponse.data ?? []);

	const formatDate = (value: number) =>
		new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
</script>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-xl font-semibold">Club interest</h1>
		<p class="mt-1 text-sm text-neutral-500">
			Everyone who filled in the Club Interest Form — an email and a location, no account attached.
			Reach out over email.
		</p>
	</div>

	{#if signupsResponse.isLoading}
		<p class="text-sm text-neutral-500">Loading...</p>
	{:else if signups.length === 0}
		<p
			class="rounded border border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500"
		>
			No interest signups yet.
		</p>
	{:else}
		<div>
			<h2 class="text-sm font-semibold text-neutral-600">Signups ({signups.length})</h2>
			<div class="mt-2 overflow-x-auto rounded border border-neutral-200 bg-white">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
						<tr>
							<th class="px-3 py-2">Email</th>
							<th class="px-3 py-2">Location</th>
							<th class="px-3 py-2">Signed up</th>
						</tr>
					</thead>
					<tbody>
						{#each signups as signup (signup.signupId)}
							<tr class="border-b border-neutral-100 last:border-0">
								<td class="px-3 py-2 font-medium">
									<a class="underline-offset-2 hover:underline" href={`mailto:${signup.email}`}>
										{signup.email}
									</a>
								</td>
								<td class="px-3 py-2 text-neutral-600">{signup.location}</td>
								<td class="px-3 py-2 text-neutral-600">{formatDate(signup.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { Id } from '$convex/_generated/dataModel';

	// Leader invites (main repo src/convex/clubLeaderInvites.ts): onboard someone who already
	// runs a club in the real world. Staff draft the club here; the invitee signs up on the
	// member app with this email (verified) and the club is founded with them as its Guide — no
	// application, review, or interview. Every action here is admin-gated server-side.
	const convexClient = useConvexClient();

	const invitesResponse = useStableQuery(api.clubLeaderInvites.listLeaderInvites, () => ({}));
	let invites = $derived(invitesResponse.data ?? []);

	let email = $state('');
	let clubName = $state('');
	let clubLocation = $state('');
	let clubLatitude = $state('');
	let clubLongitude = $state('');
	let clubDescription = $state('');
	let invitePending = $state(false);
	let inviteError = $state('');
	let inviteInfo = $state('');

	let actionError = $state('');
	let pendingInviteId = $state<Id<'clubLeaderInvites'> | null>(null);

	const parseCoordinate = (value: string, label: string, min: number, max: number) => {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = Number(trimmed);
		if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
			throw new Error(`${label} must be a number between ${min} and ${max}`);
		}
		return parsed;
	};

	const sendInvite = async () => {
		inviteError = '';
		inviteInfo = '';
		invitePending = true;
		try {
			const latitude = parseCoordinate(clubLatitude, 'Latitude', -90, 90);
			const longitude = parseCoordinate(clubLongitude, 'Longitude', -180, 180);
			// Coordinates place the club on the public map; either both or neither.
			if ((latitude === undefined) !== (longitude === undefined)) {
				throw new Error('Provide both latitude and longitude, or neither');
			}
			await convexClient.mutation(api.clubLeaderInvites.createLeaderInvite, {
				email: email.trim(),
				clubName: clubName.trim(),
				clubDescription: clubDescription.trim() || undefined,
				clubLocation: clubLocation.trim() || undefined,
				clubLocationLatitude: latitude,
				clubLocationLongitude: longitude
			});
			inviteInfo = `Invite sent to ${email.trim().toLowerCase()} — "${clubName.trim()}" will be created when they sign up with that email.`;
			email = '';
			clubName = '';
			clubLocation = '';
			clubLatitude = '';
			clubLongitude = '';
			clubDescription = '';
		} catch (error) {
			inviteError = error instanceof Error ? error.message : 'Failed to create the invite';
		} finally {
			invitePending = false;
		}
	};

	const revokeInvite = async (inviteId: Id<'clubLeaderInvites'>) => {
		actionError = '';
		pendingInviteId = inviteId;
		try {
			await convexClient.mutation(api.clubLeaderInvites.revokeLeaderInvite, { inviteId });
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to revoke the invite';
		} finally {
			pendingInviteId = null;
		}
	};

	const formatDate = (timestamp: number) =>
		new Date(timestamp).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});

	const statusVariant = (status: string) =>
		status === 'pending' ? 'default' : status === 'accepted' ? 'secondary' : 'outline';
</script>

<div class="flex flex-col gap-8">
	<section>
		<h2 class="text-base font-semibold text-neutral-900">Invite a club leader</h2>
		<p class="mt-1 text-sm text-neutral-500">
			For people who already run a club: fill in their club, and it is created the moment they
			sign up on the app with this exact email address — no application needed. Invites expire
			after 30 days.
		</p>

		<form
			class="mt-4 flex max-w-xl flex-col gap-3"
			onsubmit={(event) => {
				event.preventDefault();
				void sendInvite();
			}}
		>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Input
					type="email"
					bind:value={email}
					required
					placeholder="leader@example.com"
					aria-label="Leader's email"
				/>
				<Input
					bind:value={clubName}
					required
					placeholder="Club name"
					aria-label="Club name"
				/>
			</div>
			<Input
				bind:value={clubLocation}
				placeholder="Location (e.g. Braga, Portugal)"
				aria-label="Club location"
			/>
			<div class="grid grid-cols-2 gap-3">
				<Input
					bind:value={clubLatitude}
					inputmode="decimal"
					placeholder="Latitude (optional)"
					aria-label="Latitude"
				/>
				<Input
					bind:value={clubLongitude}
					inputmode="decimal"
					placeholder="Longitude (optional)"
					aria-label="Longitude"
				/>
			</div>
			<p class="text-xs text-neutral-500">
				Coordinates place the club on the public map; they can also be added later in the app.
			</p>
			<Textarea
				bind:value={clubDescription}
				rows={3}
				placeholder="Short club description (optional)"
				aria-label="Club description"
			/>
			<div>
				<Button type="submit" disabled={invitePending || !email.trim() || !clubName.trim()}>
					{invitePending ? 'Inviting…' : 'Send invite'}
				</Button>
			</div>
		</form>

		{#if inviteError}
			<p class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
				{inviteError}
			</p>
		{/if}
		{#if inviteInfo}
			<p
				class="mt-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
			>
				{inviteInfo}
			</p>
		{/if}
	</section>

	<section>
		<h2 class="text-base font-semibold text-neutral-900">Invites</h2>

		<div class="mt-4 overflow-hidden rounded-lg border border-neutral-300 bg-white">
			{#if invitesResponse.isLoading}
				<p class="px-4 py-6 text-sm text-neutral-500">Loading…</p>
			{:else if invites.length === 0}
				<p class="px-4 py-6 text-sm text-neutral-500">No leader invites yet.</p>
			{:else}
				{#each invites as invite (invite.inviteId)}
					<div
						class="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
					>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<p class="truncate text-sm font-medium text-neutral-900">{invite.email}</p>
								<Badge variant={statusVariant(invite.status)}>{invite.status}</Badge>
							</div>
							<p class="truncate text-sm text-neutral-500">
								{invite.clubName}{invite.clubLocation ? ` · ${invite.clubLocation}` : ''}
							</p>
							<p class="text-sm text-neutral-500">
								Invited {formatDate(invite.createdAt)}{invite.invitedBy
									? ` by ${invite.invitedBy}`
									: ''}{invite.status === 'pending'
									? ` · expires ${formatDate(invite.expiresAt)}`
									: ''}{invite.status === 'accepted' && invite.acceptedAt
									? ` · accepted ${formatDate(invite.acceptedAt)}`
									: ''}
							</p>
						</div>
						{#if invite.status === 'pending'}
							<Button
								variant="outline"
								size="sm"
								disabled={pendingInviteId === invite.inviteId}
								onclick={() => void revokeInvite(invite.inviteId)}
							>
								{pendingInviteId === invite.inviteId ? 'Revoking…' : 'Revoke'}
							</Button>
						{/if}
					</div>
				{/each}
			{/if}
		</div>

		{#if actionError}
			<p class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
				{actionError}
			</p>
		{/if}
	</section>
</div>

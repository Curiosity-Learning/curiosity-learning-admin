<script lang="ts">
	import { api } from '$convex/_generated/api';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Id } from '$convex/_generated/dataModel';

	// Admin access management (admin-invite mechanism, main repo src/convex/adminInvites.ts).
	// Invite an email -> the invitee signs in / creates an account on this portal with that
	// (verified) email -> the /admin layout's claim call grants globalRole admin. Every action
	// here is independently admin-gated server-side.
	const convexClient = useConvexClient();

	const adminsResponse = useStableQuery(api.adminInvites.listAdmins, () => ({}));
	const invitesResponse = useStableQuery(api.adminInvites.listInvites, () => ({}));
	let admins = $derived(adminsResponse.data ?? []);
	let invites = $derived(invitesResponse.data ?? []);

	let inviteEmail = $state('');
	let invitePending = $state(false);
	let inviteError = $state('');
	let inviteInfo = $state('');

	let actionError = $state('');
	let pendingInviteId = $state<Id<'adminInvites'> | null>(null);

	let removeDialogOpen = $state(false);
	let removeTarget = $state<{ profileId: Id<'profiles'>; label: string } | null>(null);
	let removePending = $state(false);

	const sendInvite = async () => {
		inviteError = '';
		inviteInfo = '';
		invitePending = true;
		try {
			await convexClient.mutation(api.adminInvites.createInvite, {
				email: inviteEmail.trim()
			});
			inviteInfo = `Invite sent to ${inviteEmail.trim().toLowerCase()}.`;
			inviteEmail = '';
		} catch (error) {
			inviteError = error instanceof Error ? error.message : 'Failed to create the invite';
		} finally {
			invitePending = false;
		}
	};

	const revokeInvite = async (inviteId: Id<'adminInvites'>) => {
		actionError = '';
		pendingInviteId = inviteId;
		try {
			await convexClient.mutation(api.adminInvites.revokeInvite, { inviteId });
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to revoke the invite';
		} finally {
			pendingInviteId = null;
		}
	};

	const openRemove = (admin: (typeof admins)[number]) => {
		removeTarget = {
			profileId: admin.profileId,
			label: admin.name ?? admin.email ?? admin.username ?? 'this admin'
		};
		actionError = '';
		removeDialogOpen = true;
	};

	const confirmRemove = async () => {
		if (!removeTarget) return;
		removePending = true;
		actionError = '';
		try {
			await convexClient.mutation(api.adminInvites.removeAdmin, {
				profileId: removeTarget.profileId
			});
			removeDialogOpen = false;
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to remove admin access';
		} finally {
			removePending = false;
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
		<h2 class="text-base font-semibold text-neutral-900">Administrators</h2>
		<p class="mt-1 text-sm text-neutral-500">
			People with full access to this portal. You cannot remove yourself.
		</p>

		<div class="mt-4 overflow-hidden rounded-lg border border-neutral-300 bg-white">
			{#if adminsResponse.isLoading}
				<p class="px-4 py-6 text-sm text-neutral-500">Loading…</p>
			{:else if admins.length === 0}
				<p class="px-4 py-6 text-sm text-neutral-500">No administrators found.</p>
			{:else}
				{#each admins as admin (admin.profileId)}
					<div
						class="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-neutral-900">
								{admin.name ?? admin.username ?? 'Unnamed'}
							</p>
							<p class="truncate text-sm text-neutral-500">{admin.email ?? 'No email on file'}</p>
						</div>
						<Button variant="outline" size="sm" onclick={() => openRemove(admin)}>Remove</Button>
					</div>
				{/each}
			{/if}
		</div>
	</section>

	<section>
		<h2 class="text-base font-semibold text-neutral-900">Invites</h2>
		<p class="mt-1 text-sm text-neutral-500">
			Invite someone by email. They become an admin once they sign in here with that email
			(verified) — creating their account on this portal if they don't have one. Invites expire
			after 7 days.
		</p>

		<form
			class="mt-4 flex items-start gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				void sendInvite();
			}}
		>
			<div class="w-full max-w-sm">
				<Input
					type="email"
					bind:value={inviteEmail}
					required
					placeholder="person@example.com"
					aria-label="Email to invite"
				/>
			</div>
			<Button type="submit" disabled={invitePending || !inviteEmail.trim()}>
				{invitePending ? 'Inviting…' : 'Invite'}
			</Button>
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

		<div class="mt-4 overflow-hidden rounded-lg border border-neutral-300 bg-white">
			{#if invitesResponse.isLoading}
				<p class="px-4 py-6 text-sm text-neutral-500">Loading…</p>
			{:else if invites.length === 0}
				<p class="px-4 py-6 text-sm text-neutral-500">No invites yet.</p>
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
							<p class="text-sm text-neutral-500">
								Invited {formatDate(invite.createdAt)}{invite.invitedBy
									? ` by ${invite.invitedBy}`
									: ''}{invite.status === 'pending'
									? ` · expires ${formatDate(invite.expiresAt)}`
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

		{#if actionError && !removeDialogOpen}
			<p class="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
				{actionError}
			</p>
		{/if}
	</section>
</div>

<Dialog.Root bind:open={removeDialogOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Remove admin access</Dialog.Title>
			<Dialog.Description>
				{removeTarget?.label} will immediately lose access to this portal. Their regular account is unaffected.
				You can invite them again later.
			</Dialog.Description>
		</Dialog.Header>
		{#if actionError}
			<p class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
				{actionError}
			</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (removeDialogOpen = false)} disabled={removePending}>
				Cancel
			</Button>
			<Button variant="destructive" onclick={() => void confirmRemove()} disabled={removePending}>
				{removePending ? 'Removing…' : 'Remove access'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

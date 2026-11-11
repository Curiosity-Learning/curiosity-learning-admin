<script lang="ts">
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';

	// CL-782: contact details for one user, so staff can reach them (or their parent) outside
	// the app. Loads only while open.
	let { profileId, open = $bindable(false) }: { profileId: Id<'profiles'> | null; open?: boolean } =
		$props();

	const detailsResponse = useStableQuery(api.adminUsers.getUserDetails, () =>
		open && profileId ? { profileId } : 'skip'
	);
	let details = $derived(detailsResponse.data ?? null);

	const nameOf = (user: {
		firstName: string | null;
		lastName: string | null;
		username: string | null;
	}) =>
		[user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username || 'Unknown';

	const formatDate = (value: number | null) =>
		value === null
			? '—'
			: new Date(value).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				});

	const dateOfBirthLabel = (dateOfBirth: string | null) => {
		if (!dateOfBirth) return null;
		const born = new Date(dateOfBirth);
		if (Number.isNaN(born.getTime())) return dateOfBirth;
		const now = new Date();
		let age = now.getFullYear() - born.getFullYear();
		const hadBirthday =
			now.getMonth() > born.getMonth() ||
			(now.getMonth() === born.getMonth() && now.getDate() >= born.getDate());
		if (!hadBirthday) age -= 1;
		return `${dateOfBirth} (age ${age})`;
	};
</script>

{#snippet emailLink(email: string | null)}
	{#if email}
		<a class="text-blue-700 underline-offset-2 hover:underline" href={`mailto:${email}`}>{email}</a>
	{:else}
		<span class="text-neutral-400">No email</span>
	{/if}
{/snippet}

{#snippet row(label: string, value: string | null)}
	<div class="flex gap-3">
		<dt class="w-32 shrink-0 text-neutral-500">{label}</dt>
		<dd class="min-w-0 break-words">{value || '—'}</dd>
	</div>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{details ? nameOf(details) : 'User details'}</Dialog.Title>
			<Dialog.Description>
				{#if details?.username}@{details.username}{:else}Contact details{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if detailsResponse.isLoading}
			<p class="text-sm text-neutral-500">Loading...</p>
		{:else if !details}
			<p class="text-sm text-neutral-500">User not found.</p>
		{:else}
			<div class="flex flex-col gap-5 text-sm">
				<dl class="flex flex-col gap-2">
					<div class="flex gap-3">
						<dt class="w-32 shrink-0 text-neutral-500">Email</dt>
						<dd class="flex min-w-0 flex-wrap items-center gap-2 break-all">
							{#if details.isChildAccount}
								<span class="text-neutral-400">Child account, no email. Contact the parent.</span>
							{:else}
								{@render emailLink(details.email)}
							{/if}
							{#if details.email && !details.emailVerified}
								<Badge variant="outline">unverified</Badge>
							{/if}
						</dd>
					</div>
					{@render row('Date of birth', dateOfBirthLabel(details.dateOfBirth))}
					{@render row('Location', details.locationAddress)}
					{@render row('Signed up with', details.signUpWith)}
					{@render row('Joined', formatDate(details.joinedAt))}
					{@render row('Last login', formatDate(details.lastLogin))}
					{#if details.suspendedAt}
						{@render row(
							'Suspended',
							`${formatDate(details.suspendedAt)}: ${details.suspendedReason ?? ''}`
						)}
					{/if}
				</dl>

				{#if details.parentConsent || details.parents.length > 0}
					<section class="flex flex-col gap-2 border-t border-neutral-200 pt-4">
						<h3 class="font-semibold text-neutral-600">Parent</h3>
						{#if details.parentConsent}
							<div class="flex flex-wrap items-center gap-2">
								{@render emailLink(details.parentConsent.parentEmail)}
								<Badge
									variant={details.parentConsent.status === 'approved' ? 'secondary' : 'outline'}
								>
									consent {details.parentConsent.status}
								</Badge>
							</div>
						{/if}
						{#each details.parents as parent (parent.profileId)}
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{nameOf(parent)}</span>
								{#if parent.email && parent.email !== details.parentConsent?.parentEmail}
									{@render emailLink(parent.email)}
								{/if}
								<span class="text-xs text-neutral-400">linked account</span>
							</div>
						{/each}
					</section>
				{/if}

				{#if details.children.length > 0}
					<section class="flex flex-col gap-2 border-t border-neutral-200 pt-4">
						<h3 class="font-semibold text-neutral-600">Children</h3>
						{#each details.children as child (child.profileId)}
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{nameOf(child)}</span>
								{#if child.username}
									<span class="text-xs text-neutral-400">@{child.username}</span>
								{/if}
								{#if !child.isChildAccount}
									{@render emailLink(child.email)}
								{/if}
							</div>
						{/each}
					</section>
				{/if}

				<section class="flex flex-col gap-2 border-t border-neutral-200 pt-4">
					<h3 class="font-semibold text-neutral-600">Clubs</h3>
					{#if details.clubs.length === 0}
						<p class="text-neutral-400">Not in any club.</p>
					{:else}
						{#each details.clubs as club (club.clubId)}
							<div class="flex items-center gap-2">
								<span>{club.name}</span>
								{#if club.role}
									<Badge variant="outline">{club.role}</Badge>
								{/if}
							</div>
						{/each}
					{/if}
				</section>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

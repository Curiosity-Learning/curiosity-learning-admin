<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$convex/_generated/api';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient } from 'convex-svelte';
	import { useStableQuery } from '$lib/convex/use-stable-query.svelte';
	import { routes } from '$lib/routes';
	import { cn } from '$lib/utils';

	let { children } = $props();

	// Client-only gate (this app has no SvelteKit server hooks/SSR auth — see README).
	// 1. Not authenticated -> redirect to sign-in.
	// 2. Authenticated but not a global admin -> plain "not found", same as the main repo's
	//    server-side gate, so /admin's existence isn't advertised to regular members.
	// Every admin query/mutation still independently enforces requireGlobalAdmin server-side;
	// this is a UX nicety only.
	const auth = useAuth();
	const roleResponse = useStableQuery(api.profiles.getMyGlobalRole, () =>
		auth.isAuthenticated ? {} : 'skip'
	);

	let globalRole = $derived(roleResponse.data ?? null);
	let isAdmin = $derived(globalRole === 'admin');

	// Invite claim: a signed-in non-admin may hold a pending admin invite for their (verified)
	// email. Try to claim it exactly once before concluding "not found" — if the claim grants,
	// the reactive getMyGlobalRole query above flips isAdmin on its own. The mutation is
	// self-scoped and admin-invite-gated server-side, so calling it for every non-admin is safe.
	const convexClient = useConvexClient();
	let claimState = $state<'idle' | 'pending' | 'done'>('idle');

	$effect(() => {
		if (auth.isLoading || !auth.isAuthenticated || roleResponse.isLoading) return;
		if (isAdmin || claimState !== 'idle') return;
		claimState = 'pending';
		void convexClient
			.mutation(api.adminInvites.claimAdminInvite, {})
			.catch(() => undefined)
			.finally(() => {
				claimState = 'done';
			});
	});

	$effect(() => {
		if (auth.isLoading) return;
		if (!auth.isAuthenticated) {
			const next = `${page.url.pathname}${page.url.search}`;
			void goto(`${routes.signIn}?next=${encodeURIComponent(next)}`, { replaceState: true });
		}
	});

	const navItems = [
		{ href: routes.admin, label: 'Overview' },
		{ href: routes.adminClubs, label: 'Clubs' },
		{ href: routes.adminApplications, label: 'Applications' },
		{ href: routes.adminLeaderInvites, label: 'Leader invites' },
		{ href: routes.adminInterest, label: 'Interest' },
		{ href: routes.adminModeration, label: 'Moderation' },
		{ href: routes.adminSeasonsBooklet, label: 'Seasons & Booklet' },
		{ href: routes.adminUsers, label: 'Users' },
		{ href: routes.adminAdmins, label: 'Admins' }
	];

	const isActive = (href: string) =>
		href === routes.admin ? page.url.pathname === href : page.url.pathname.startsWith(href);
</script>

{#if auth.isLoading || (auth.isAuthenticated && (roleResponse.isLoading || (!isAdmin && claimState !== 'done')))}
	<div class="flex min-h-screen items-center justify-center text-sm text-neutral-500">Loading…</div>
{:else if !auth.isAuthenticated}
	<!-- Redirect effect above will navigate away. -->
{:else if !isAdmin}
	<div class="flex min-h-screen items-center justify-center text-sm text-neutral-500">
		Not found
	</div>
{:else}
	<div class="min-h-screen bg-neutral-100 text-neutral-900">
		<header class="border-b border-neutral-300 bg-white">
			<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
				<p class="text-lg font-semibold">Curiosity Admin</p>
				<nav class="flex gap-1">
					{#each navItems as item (item.href)}
						<a
							href={item.href}
							class={cn(
								'rounded px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
								isActive(item.href) && 'bg-neutral-200 text-neutral-900'
							)}
						>
							{item.label}
						</a>
					{/each}
				</nav>
			</div>
		</header>

		<main class="mx-auto max-w-5xl px-4 py-6">
			{@render children()}
		</main>
	</div>
{/if}

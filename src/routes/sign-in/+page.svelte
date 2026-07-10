<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { routes } from '$lib/routes';

	// CL-693 admin split: minimal email/password sign-in. Admins are normal users — this reuses
	// the main repo's better-auth client flow (authClient.signIn.email), stripped of the member
	// app's Google/OTP/username/consent flows which don't apply here.
	const auth = useAuth();

	let email = $state('');
	let password = $state('');
	let pending = $state(false);
	let errorMessage = $state('');

	let nextPath = $derived(page.url.searchParams.get('next') ?? routes.admin);

	$effect(() => {
		if (!auth.isLoading && auth.isAuthenticated) {
			void goto(nextPath, { replaceState: true });
		}
	});

	const signIn = async () => {
		errorMessage = '';
		pending = true;
		try {
			const { error } = await authClient.signIn.email({
				email: email.trim().toLowerCase(),
				password
			});
			if (error) {
				errorMessage = error.message ?? 'Invalid email or password.';
				return;
			}
			await goto(nextPath, { replaceState: true });
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Sign-in failed.';
		} finally {
			pending = false;
		}
	};
</script>

<div class="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
	<div class="w-full max-w-sm rounded-lg border border-neutral-300 bg-white p-6 shadow-sm">
		<h1 class="text-lg font-semibold text-neutral-900">Curiosity Admin</h1>
		<p class="mt-1 text-sm text-neutral-500">Sign in with your admin account.</p>

		<form
			class="mt-6 flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				void signIn();
			}}
		>
			<div class="flex flex-col gap-1.5">
				<label for="email" class="text-sm font-medium text-neutral-700">Email</label>
				<Input
					id="email"
					type="email"
					bind:value={email}
					autocomplete="username"
					required
					placeholder="you@curiositylearning.org"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="password" class="text-sm font-medium text-neutral-700">Password</label>
				<Input
					id="password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					required
				/>
			</div>

			{#if errorMessage}
				<p class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
					{errorMessage}
				</p>
			{/if}

			<Button type="submit" disabled={pending || !email.trim() || !password} class="w-full">
				{pending ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>
	</div>
</div>

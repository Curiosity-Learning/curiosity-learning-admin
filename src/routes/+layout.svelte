<script lang="ts">
	import '../app.css';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';

	let { children } = $props();

	// Client-only auth wiring — no SvelteKit server hooks/SSR auth state here (see README:
	// "how auth works" for why). `getServerState` is omitted, so the first client render treats
	// the session as unknown until the client-side check resolves.
	createSvelteAuthClient({ authClient });
</script>

<svelte:head>
	<title>Curiosity Admin</title>
</svelte:head>

{@render children()}

<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { routes } from '$lib/routes';

	onMount(() => {
		void goto(routes.admin, { replaceState: true });
	});
</script>

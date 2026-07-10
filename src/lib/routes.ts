// Minimal route constants for this app (mirrors the relevant subset of the main repo's
// $lib/routes.ts). This app IS the admin app, so paths are rooted at /admin, plus /sign-in.
export const routes = {
	signIn: '/sign-in',
	admin: '/admin',
	adminClubs: '/admin/clubs',
	adminApplications: '/admin/applications',
	adminModeration: '/admin/moderation',
	adminSeasonsBooklet: '/admin/seasons-booklet',
	adminUsers: '/admin/users'
} as const;

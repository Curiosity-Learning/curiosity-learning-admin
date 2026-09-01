// "Where did you hear about us?" normalization — mirrors REFERRAL_VALUE_ALIASES in the main
// repo's onboarding/start-club page: historical rows may hold either the human-readable option
// text or the slug, so both map to one canonical slug here.

const REFERRAL_VALUE_ALIASES: Record<string, string> = {
	instagram: 'instagram',
	linkedin: 'linkedin',
	facebook: 'facebook',
	youtube: 'youtube',
	'x (twitter)': 'x_twitter',
	x_twitter: 'x_twitter',
	'friend or family': 'friend_family',
	friend_family: 'friend_family',
	'school or teacher': 'school_teacher',
	school_teacher: 'school_teacher',
	'event or workshop': 'event_workshop',
	event_workshop: 'event_workshop',
	other: 'other'
};

const REFERRAL_LABELS: Record<string, string> = {
	instagram: 'Instagram',
	linkedin: 'LinkedIn',
	facebook: 'Facebook',
	youtube: 'YouTube',
	x_twitter: 'X (Twitter)',
	friend_family: 'Friend or family',
	school_teacher: 'School or teacher',
	event_workshop: 'Event or workshop',
	other: 'Other'
};

export const normalizeReferralSource = (value: string): string =>
	REFERRAL_VALUE_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase();

export const referralSourceLabel = (slug: string): string =>
	REFERRAL_LABELS[slug] ?? slug.replaceAll('_', ' ');

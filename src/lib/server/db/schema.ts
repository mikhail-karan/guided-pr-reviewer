import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- AUTH ---

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	githubUserId: text('github_user_id').unique().notNull(),
	login: text('login').notNull(),
	name: text('name'),
	email: text('email'),
	avatarUrl: text('avatar_url'),
	accessTokenEncrypted: text('access_token_encrypted'), // User-to-server token
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

// --- TEAMS ---

export const teams = sqliteTable('teams', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const teamMembers = sqliteTable(
	'team_members',
	{
		teamId: text('team_id')
			.notNull()
			.references(() => teams.id),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		role: text('role').notNull() // owner, admin, member
	},
	(t) => ({
		pk: primaryKey({ columns: [t.teamId, t.userId] })
	})
);

// --- GITHUB INTEGRATION ---

export const githubInstallations = sqliteTable('github_installations', {
	id: text('id').primaryKey(),
	teamId: text('team_id')
		.notNull()
		.references(() => teams.id),
	installationId: text('installation_id').unique().notNull(),
	accountLogin: text('account_login').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const repos = sqliteTable('repos', {
	id: text('id').primaryKey(),
	installationId: text('installation_id')
		.notNull()
		.references(() => githubInstallations.id),
	owner: text('owner').notNull(),
	name: text('name').notNull(),
	defaultBranch: text('default_branch').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
}, (table) => ({
	unq: sql`UNIQUE(${table.owner}, ${table.name})`
}));

export const pullRequests = sqliteTable('pull_requests', {
	id: text('id').primaryKey(),
	repoId: text('repo_id')
		.notNull()
		.references(() => repos.id),
	number: integer('number').notNull(),
	title: text('title').notNull(),
	authorLogin: text('author_login').notNull(),
	baseRef: text('base_ref').notNull(),
	headRef: text('head_ref').notNull(),
	baseSha: text('base_sha').notNull(),
	headSha: text('head_sha').notNull(),
	state: text('state').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
}, (table) => ({
	unq: sql`UNIQUE(${table.repoId}, ${table.number}, ${table.headSha})`
}));

// --- REVIEW SESSIONS ---

export const reviewSessions = sqliteTable('review_sessions', {
	id: text('id').primaryKey(),
	pullRequestId: text('pull_request_id')
		.notNull()
		.references(() => pullRequests.id),
	createdByUserId: text('created_by_user_id')
		.notNull()
		.references(() => user.id),
	headSha: text('head_sha').notNull(),
	status: text('status').notNull(), // active, completed
	isStale: integer('is_stale', { mode: 'boolean' }).notNull().default(false),
	prSummaryJson: text('pr_summary_json'), // stores JSON
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const reviewSteps = sqliteTable('review_steps', {
	id: text('id').primaryKey(),
	sessionId: text('session_id')
		.notNull()
		.references(() => reviewSessions.id),
	orderIndex: integer('order_index').notNull(),
	title: text('title').notNull(),
	category: text('category').notNull(),
	riskTags: text('risk_tags'), // JSON string[]
	complexity: text('complexity').notNull(), // S, M, L
	status: text('status').notNull(), // not_started, in_progress, reviewed, follow_up
	diffHunksJson: text('diff_hunks_json').notNull(), // JSON
	aiGuidanceJson: text('ai_guidance_json'), // JSON
	aiInlineExplanationsJson: text('ai_inline_explanations_json'), // JSON array of hunk explanations
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const contextPacks = sqliteTable('context_packs', {
	id: text('id').primaryKey(),
	stepId: text('step_id')
		.notNull()
		.references(() => reviewSteps.id),
	itemsJson: text('items_json').notNull(), // JSON
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const reviewerNotes = sqliteTable('reviewer_notes', {
	id: text('id').primaryKey(),
	stepId: text('step_id')
		.notNull()
		.references(() => reviewSteps.id),
	authorUserId: text('author_user_id')
		.notNull()
		.references(() => user.id),
	severity: text('severity').notNull(), // nit, suggestion, concern, question
	noteMarkdown: text('note_markdown').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const draftComments = sqliteTable('draft_comments', {
	id: text('id').primaryKey(),
	stepId: text('step_id')
		.notNull()
		.references(() => reviewSteps.id),
	authorUserId: text('author_user_id')
		.notNull()
		.references(() => user.id),
	status: text('status').notNull(), // draft, publishing, published, failed
	targetType: text('target_type').notNull(), // inline, conversation
	bodyMarkdown: text('body_markdown').notNull(),
	// Inline fields
	path: text('path'),
	commitSha: text('commit_sha'),
	side: text('side'), // LEFT, RIGHT
	line: integer('line'),
	startLine: integer('start_line'),
	startSide: text('start_side'),
	// GitHub fields
	githubCommentId: text('github_comment_id'),
	githubReviewId: text('github_review_id'),
	errorMessage: text('error_message'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const stepChatMessages = sqliteTable('step_chat_messages', {
	id: text('id').primaryKey(),
	stepId: text('step_id')
		.notNull()
		.references(() => reviewSteps.id),
	authorUserId: text('author_user_id')
		.notNull()
		.references(() => user.id),
	role: text('role').notNull(), // 'user' | 'assistant'
	content: text('content').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

// TYPES

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type GithubInstallation = typeof githubInstallations.$inferSelect;
export type Repo = typeof repos.$inferSelect;
export type PullRequest = typeof pullRequests.$inferSelect;
export type ReviewSession = typeof reviewSessions.$inferSelect;
export type ReviewStep = typeof reviewSteps.$inferSelect;
export type ContextPack = typeof contextPacks.$inferSelect;
export type ReviewerNote = typeof reviewerNotes.$inferSelect;
export type DraftComment = typeof draftComments.$inferSelect;
export type StepChatMessage = typeof stepChatMessages.$inferSelect;
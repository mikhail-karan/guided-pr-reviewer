import { Worker, type Job } from 'bullmq';
import { getConnection } from './lib/server/jobs/queue';
import { ingestPrJob } from './lib/server/jobs/ingest-pr';
import { generateStepsJob } from './lib/server/jobs/generate-steps';
import { buildContextPackJob } from './lib/server/jobs/build-context';
import { generateAiGuidanceJob } from './lib/server/jobs/ai-guidance';
import { gatherRepoContextJob } from './lib/server/jobs/gather-repo-context';

const worker = new Worker(
	'review-tasks',
	async (job: Job) => {
		console.log(`Processing job ${job.id} of type ${job.name}`);

		try {
			switch (job.name) {
				case 'ingest_pr':
					await ingestPrJob(job.data.sessionId);
					break;
				case 'generate_steps':
					await generateStepsJob(job.data.sessionId, job.data.diff, job.data.files);
					break;
				case 'build_context_pack':
					await buildContextPackJob(job.data.stepId);
					break;
				case 'generate_ai_guidance':
					await generateAiGuidanceJob(job.data.sessionId);
					break;
				case 'gather_repo_context':
					await gatherRepoContextJob(job.data.repoId);
					break;
				default:
					console.warn(`Unknown job type: ${job.name}`);
			}
		} catch (error) {
			console.error(`Error processing job ${job.id}:`, error);
			throw error;
		}
	},
	{ connection: getConnection() }
);

worker.on('completed', (job) => {
	console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
	console.error(`Job ${job?.id} failed with error:`, err);
});

console.log('Worker started and waiting for jobs...');

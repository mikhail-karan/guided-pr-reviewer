import { Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../env';

let connection: IORedis;

export const getConnection = () => {
	if (!connection) {
		connection = new IORedis(ENV.REDIS_URL, {
			maxRetriesPerRequest: null
		});
	}
	return connection;
};

export const reviewQueue = new Queue('review-tasks', {
	get connection() {
		return getConnection();
	},
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 1000
		}
	}
});

export type AddJobOptions = {
	jobId?: string;
};

export async function addJob(name: string, data: any, options?: AddJobOptions) {
	return await reviewQueue.add(name, data, {
		...(options?.jobId && { jobId: options.jobId })
	});
}

export { connection as redisConnection };

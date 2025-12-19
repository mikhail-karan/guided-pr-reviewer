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
	get connection() { return getConnection(); },
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 1000
		}
	}
});

export async function addJob(name: string, data: any) {
	return await reviewQueue.add(name, data);
}

export { connection as redisConnection };


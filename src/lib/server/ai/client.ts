import OpenAI from 'openai';
import { ENV } from '../env';

export const ai = new OpenAI({
	apiKey: ENV.LLM_API_KEY,
	baseURL: ENV.LLM_BASE_URL,
	defaultHeaders: {
		'HTTP-Referer': ENV.APP_BASE_URL,
		'X-Title': 'Guided PR Reviewer'
	}
});

export const LLM_MODEL = ENV.LLM_MODEL;


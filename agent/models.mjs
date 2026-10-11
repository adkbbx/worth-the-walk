import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { loadEnv } from './env.mjs';

export function modelInfo(env = process.env) {
  loadEnv();
  return env.LOCAL_LLM === '1'
    ? { provider: 'ollama', model: env.LOCAL_LLM_MODEL || 'gemma4:e2b-it-qat' }
    : { provider: 'digitalocean', model: env.GRADIENT_MODEL || 'gemma-4-31B-it' };
}

function languageModel(env) {
  const { provider, model } = modelInfo(env);
  const local = provider === 'ollama';
  const apiKey = env.MOCK_GEMMA === '1' ? 'mock' : local ? undefined : env.GRADIENT_MODEL_ACCESS_KEY || env.DIGITALOCEAN_INFERENCE_KEY;
  if (!local && !apiKey) throw new Error('Missing GRADIENT_MODEL_ACCESS_KEY or DIGITALOCEAN_INFERENCE_KEY');
  const compatible = createOpenAICompatible({
    name: provider,
    baseURL: local ? env.LOCAL_LLM_URL || 'http://127.0.0.1:11434/v1' : 'https://inference.do-ai.run/v1',
    ...(apiKey ? { apiKey } : {}),
  });
  return compatible.chatModel(model);
}

export function visionModel(env = process.env) { return languageModel(env); }
export function textModel(env = process.env) { return languageModel(env); }

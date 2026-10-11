import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { loadEnv } from './env.mjs';

export function modelInfo() {
  loadEnv();
  return process.env.LOCAL_LLM === '1'
    ? { provider: 'ollama', model: process.env.LOCAL_LLM_MODEL || 'gemma4:e2b-it-qat' }
    : { provider: 'digitalocean', model: process.env.GRADIENT_MODEL || 'gemma-4-31B-it' };
}

function languageModel() {
  const { provider, model } = modelInfo();
  const local = provider === 'ollama';
  const apiKey = local ? undefined : process.env.GRADIENT_MODEL_ACCESS_KEY || process.env.DIGITALOCEAN_INFERENCE_KEY;
  if (!local && !apiKey) throw new Error('Missing GRADIENT_MODEL_ACCESS_KEY or DIGITALOCEAN_INFERENCE_KEY');
  const compatible = createOpenAICompatible({
    name: provider,
    baseURL: local ? process.env.LOCAL_LLM_URL || 'http://127.0.0.1:11434/v1' : 'https://inference.do-ai.run/v1',
    ...(apiKey ? { apiKey } : {}),
  });
  return compatible.chatModel(model);
}

export function visionModel() { return languageModel(); }
export function textModel() { return languageModel(); }

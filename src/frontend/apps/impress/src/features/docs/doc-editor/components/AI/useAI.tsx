import { createOpenAI } from '@ai-sdk/openai';
import {
  createAIExtension,
  createBlockNoteAIClient,
  llmFormats,
} from '@blocknote/xl-ai';
import { CoreMessage } from 'ai';
import { useMemo } from 'react';

import { fetchAPI } from '@/api';
import { Doc } from '@/docs/doc-management';

const systemPrompts: Record<
  'add-default' | 'add-adding-instruction',
  CoreMessage
> = {
  'add-default': {
    role: 'system',
    content: `You are an AI assistant that helps users with their documents.
    Answer the user prompt in markdown format.
    Add formatting to the text to make it more readable.`,
  },
  'add-adding-instruction': {
    role: 'system',
    content: `Keep adding to the document, do not delete or modify existing blocks.`,
  },
};

const userPrompts: Record<string, string> = {
  'continue writing':
    'Keep writing about the content send in the prompt, expanding on the ideas.',
  'improve writing':
    'Improve the writing of the selected text. Make it more professional and clear.',
  summarize:
    'Summarize the selected text into a concise paragraph. Add a small summarize title above the text.',
};

const client = createBlockNoteAIClient({
  baseURL: ``,
  apiKey: '',
});

/**
 * Custom implementation of the PromptBuilder that allows for using predefined prompts.
 *
 * This extends the default HTML promptBuilder from BlockNote to support custom prompt templates.
 * Custom prompts can be invoked using the pattern !promptName in the AI input field.
 */
export const useAI = (docId: Doc['id']) => {
  return useMemo(() => {
    const openai = createOpenAI({
      ...client.getProviderSettings('openai'),
      fetch: (input, init) => {
        // Create a new headers object without the Authorization header
        const headers = new Headers(init?.headers);
        headers.delete('Authorization');

        return fetchAPI(`documents/${docId}/ai-proxy/`, {
          ...init,
          headers,
        });
      },
    });
    const model = openai.chat('neuralmagic/Meta-Llama-3.1-70B-Instruct-FP8');

    const extension = createAIExtension({
      stream: false,
      model,
      agentCursor: {
        name: 'Albert',
        color: '#8bc6ff',
      },
      // Create a custom promptBuilder that extends the default one
      promptBuilder: async (editor, opts): Promise<Array<CoreMessage>> => {
        const defaultPromptBuilder = llmFormats.html.defaultPromptBuilder;
        const isTransform = !!opts.selectedBlocks?.length;

        // Try to catch the action
        const customPromptMatch = opts.userPrompt.match(/^([^:]+)(?=[:]|$)/);

        if (customPromptMatch?.length) {
          const promptKey = customPromptMatch[0].trim().toLowerCase();

          if (userPrompts[promptKey]) {
            const modifiedOpts = {
              ...opts,
              userPrompt: userPrompts[promptKey],
            };

            const prompts = await defaultPromptBuilder(editor, modifiedOpts);

            if (!isTransform) {
              prompts[0] = systemPrompts['add-default'];

              if (prompts.length > 4) {
                prompts[4] = systemPrompts['add-adding-instruction'];
              }
            }

            return prompts;
          }
        }

        // If no custom prompt was found or matched, fall back to the default prompt builder
        return defaultPromptBuilder(editor, opts);
      },
    });

    return extension;
  }, [docId]);
};

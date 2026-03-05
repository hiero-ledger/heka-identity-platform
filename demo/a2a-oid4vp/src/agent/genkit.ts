import { openAI } from '@genkit-ai/compat-oai/openai'
import { genkit } from 'genkit'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

export const ai = genkit({
  plugins: [openAI()],
  model: openAI.model('gpt-3.5-turbo'),
  promptDir: dirname(fileURLToPath(import.meta.url)),
})

export { z } from 'genkit'

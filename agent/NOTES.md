# Integration spike (Node 22, ES modules)

Installed exactly: `@mastra/core@1.75.0`, `@mastra/mcp@2.2.0`,
`@mastra/observability@1.18.4`, `@mastra/sentry@1.2.24`,
`@ai-sdk/openai-compatible@3.0.67`, `zod@4.6.5`.
No version substitutions or direct `ai` dependency were needed: Mastra bundles its
AI SDK runtime and accepts `LanguageModelV4` (AI SDK v7). The provider resolves
`@ai-sdk/provider@4.0.26`; transitive versions are locked in package-lock.json.
Existing `playwright@1.62.1` and `type: module` are preserved.

## Vision result

`node scripts/spike-read-tile.mjs .local-fixtures/meat.png` succeeded (exit 0),
using `digitalocean` / `gemma-4-31B-it` at `https://inference.do-ai.run/v1`.
Elapsed: **9.71 seconds** (excludes module import startup).
**4/4 products matched**, using product identity and both exact numeric prices;
the returned Japanese names include additional printed qualifiers.

| Returned name_ja | member_cash_yen | nonmember_yen |
| --- | ---: | ---: |
| 和牛(黒毛和種) A4・A5等級 もも肉 厚切り | 563 | 579 |
| 豚ロース肉 厚切り | 174 | 179 |
| 若鶏もも肉 | 122 | 125 |
| 鶏だんご なんこつ入り | 267 | 275 |

The response had all requested fields, including English names, but was wrapped
in a Markdown JSON fence. The script prints the actual model text unchanged
(except secret redaction); strict JSON output is not yet proven. This spike uses
prompting, not schema enforcement. No key is included in prompts or notes.

## Workflow

```js
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

const greet = createStep({
  id: 'greet', inputSchema: z.string(), outputSchema: z.string(),
  execute: async ({ inputData }) => `Hello, ${inputData}!`,
});
const workflow = createWorkflow({
  id: 'greeting', inputSchema: z.string(), outputSchema: z.string(),
}).then(greet).commit(); // chain more .then(step) calls before .commit()
const run = await workflow.createRun();
const outcome = await run.start({ inputData: 'Flyer' });
if (outcome.status === 'success') console.log(outcome.result);
```

`Workflow` is also exported at `@mastra/core/workflows`. Both `createRun()` and
`start()` are async. Verified a standalone workflow can execute successfully.
Sources: `@mastra/core/dist/workflows/{index,create,workflow}.d.ts`.

## Remote MCP: direct calls

```js
import { MCPClient } from '@mastra/mcp';
import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';

const mcp = new MCPClient({
  servers: {
    remote: {
      url: new URL(process.env.MCP_SERVER_URL),
      requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } },
      onToolError: 'throw',
    },
  },
});
try {
  const tools = await mcp.listTools(); // connects/discovers lazily
  const tool = tools.remote_toolName; // serverName_toolName
  if (!tool?.execute) throw new Error('Tool unavailable');
  const result = await tool.execute({ argument: 'value' }, {
    requestContext: new RequestContext(), observe: noopObserve,
  });
  // Consume result here; no agent needed.
} finally {
  await mcp.disconnect();
}
```

URL config selects Streamable HTTP automatically; there is no transport flag.
`MCPClient` itself has **no public `callTool()`**. Execute a discovered Mastra
`Tool` with `execute(inputData, context)`, not `{context: arguments}`. Its wrapper
calls the underlying MCP SDK client's `callTool({name, arguments})` internally.
`listTools()` skips failed servers; use `listToolsWithErrors()` to inspect failures.
Results return `structuredContent` directly when supplied, otherwise the MCP
result envelope; `onToolError: 'throw'` makes MCP `isError` results throw.
Sources: `@mastra/mcp/dist/client/{configuration,types}.d.ts`, its `dist/index.js`
tool wrapper, and `@mastra/core/dist/tools/types.d.ts`. No remote MCP call was run.

## Sentry registration and tracing scope

```js
import { Mastra } from '@mastra/core/mastra';
import { Observability } from '@mastra/observability';
import { SentryExporter } from '@mastra/sentry';

const observability = new Observability({
  configs: {
    default: {
      serviceName: 'flyer-reader',
      exporters: [new SentryExporter({
        dsn: process.env.SENTRY_DSN,
        environment: 'development',
        tracesSampleRate: 1,
      })],
    },
  },
});
const mastra = new Mastra({
  agents: { flyerReader: agent }, workflows: { greeting: workflow }, observability,
}); // agent/workflow are previously constructed instances
// await mastra.getAgent('flyerReader').generate(messages);
// await (await mastra.getWorkflow('greeting').createRun()).start({ inputData });
await observability.flush(); // after runs, before process/serverless exit
// await observability.shutdown(); // final lifecycle teardown
```

`configs.default` is the instance name; exporter arrays belong inside that config,
not on `Mastra` itself. One explicit config becomes the default automatically;
multiple configs require `configSelector`. Sentry accepts additional SDK options
under `options`, and disables itself if no DSN is configured.

Unregistered standalone agents/workflows do **not automatically export traces**.
Root spans resolve the attached Mastra observability registry; an explicitly
passed `tracingContext.currentSpan` can also provide a parent. Constructing an
agent/workflow before `new Mastra` is fine: registering it attaches the registry,
and subsequent calls on that same instance can be traced. Calling from an ordinary
script requires no HTTP server. The spike registers its agent only to install a
no-op logger; it configures no exporter and sends no Sentry events.

Verified with an in-memory exporter: standalone workflow generated no events;
after registration, its run generated events. Sentry delivery was not tested.
Sources: `@mastra/observability/dist/{config,default}.d.ts`,
`@mastra/sentry/dist/tracing.d.ts`, core's bundled `getOrCreateSpan()` implementation.

## Images and provider construction

```js
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Agent } from '@mastra/core/agent';
const provider = createOpenAICompatible({
  name: 'digitalocean', baseURL: 'https://inference.do-ai.run/v1',
  apiKey: process.env.GRADIENT_MODEL_ACCESS_KEY,
});
const agent = new Agent({
  id: 'flyer-reader', name: 'flyer-reader',
  instructions: 'Read only text that is printed. Return JSON only.',
  model: provider.chatModel('gemma-4-31B-it'),
});
const output = await agent.generate([{
  role: 'user', content: [
    { type: 'text', text: prompt },
    { type: 'image', image: bytes, mediaType: 'image/png' },
  ],
}]); // output.text
```

Use **`mediaType`** with current AI SDK model messages. `image` accepts a
`Uint8Array`, `Buffer`, `ArrayBuffer`, base64 string, or `URL`.
Mastra also accepts legacy AI SDK v4 messages with `mimeType`; that is a
compatibility shape, not the current image field. This spike proved the
`Uint8Array` + `mediaType` path against DigitalOcean. Local provider defaults and
model construction were checked; no Ollama inference was attempted.
Sources: `@mastra/core/dist/agent/message-list/types.d.ts`, bundled AI SDK
v5/v6/v7 `ImagePart` types, and `@ai-sdk/openai-compatible/dist/index.d.ts`.

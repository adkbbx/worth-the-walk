# Agent runtime

`createApp({fetch, env})` creates one Mastra instance with two registered agents and
two registered workflows. Existing no-argument model exports still work; an optional
environment argument allows isolated offline app instances.

`readPage(input, onEvent)` starts one workflow run. Its `RequestContext` carries the
callback under `onEvent`; the read step awaits it for each completed tile and the
final `done` event. Four workers read a page, with one retry per tile. The final
array retains input order even when tile events arrive out of order. The HTTP
callback writes each event as an NDJSON line and waits for drain when necessary.
Tile errors expose a fixed message rather than provider error text.

All vision, merge, and TabPFN calls use the same process-wide queue of six slots.
The queue sits around each upstream call, so one page cannot claim six slots while
waiting for its own four workers.

`createTools` returns direct async functions and a `tools` dictionary of Mastra
tools using the same functions. GSI keeps a per-instance 500-entry LRU in memory.
Prior Labs uses its discovered inline fit/predict tool with `X_train` and `X_test`
columns ordered by `FEATURES`, `y_train` from `label`, classification task type,
and probability output. Any discovery, execution, or response error falls back
to rules. Its selected tool name is printed once per process as requested.

Sentry is registered through `Observability.configs.default.exporters` only with
`SENTRY_DSN`, with service name `worth-the-walk`. A span processor drops inputs,
outputs, attributes, metadata, and error details before export. Registered workflow
runs and their agent calls retain trace structure and timing without flyer payloads.
Workflow runs also hide inputs and outputs at the trace level. Sentry's automatic
integrations are disabled so they cannot record query-string credentials in lookup URLs.
No storage or disk exporter is configured. The server flushes and shuts down
observability when it closes.

Mock mode constructs agents but never calls them. Tile index modulo six selects
the synthetic fixture; merging uses `mergeFallback`. Location is disabled unless
`fetch` was explicitly injected. Tests use mock mode and injected transports.
Ranking also uses rules without an injected transport in mock mode.

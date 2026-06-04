# Performance Baseline

Captured on May 30, 2026 from the Mac mini deployment path with `llama3.1` routed through LiteLLM.

## Local Microbenchmarks

Command:

```sh
npm run test:performance
```

| Operation | Samples | Average | p50 | p95 | Threshold p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Digest format | 5,000 | 0.028 ms | 0.022 ms | 0.030 ms | 2 ms |
| Telegram Markdown escape | 5,000 | 0.007 ms | 0.007 ms | 0.007 ms | 2 ms |
| SQLite `markProcessed` | 1,000 | 0.027 ms | 0.012 ms | 0.020 ms | 5 ms |
| SQLite `isProcessed` | 1,000 | 0.004 ms | 0.003 ms | 0.004 ms | 2 ms |

## Live Service Benchmarks

Command:

```sh
npm run test:performance:live
```

| Operation | Samples | Average | p50 | p95 | Threshold p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Yahoo IMAP connect + status | 3 | 3,389.1 ms | 3,336.2 ms | 3,516.5 ms | 5,000 ms |
| LiteLLM model list | 3 | 20.9 ms | 10.6 ms | 45.7 ms | 3,000 ms |
| LiteLLM tiny chat completion | 3 | 3,503.7 ms | 3,611.7 ms | 3,661.5 ms | 30,000 ms |

## End-to-End Dry Run

Command:

```sh
cd "/Users/artjack/Library/Application Support/email-agent"
/usr/bin/time -p /opt/homebrew/bin/node dist/run.cjs --dry-run
```

Observed:

```text
Fetched 45 email(s) from the last 26h
1 new, 44 already processed
2 Ollama calls
real 16.95
user 0.72
sys 0.12
```

## Interpretation

Local formatting, escaping, and SQLite work are negligible. Yahoo IMAP connection setup costs about 3.5 seconds. Local model inference is the dominant runtime cost and grows with the number and size of emails processed.

The current pipeline intentionally processes emails sequentially. This is simple and stable, but it means a normal 30-call digest can take several minutes. Use this baseline to distinguish expected inference time from regressions or service failures.

# Monitoring

## Why this exists

Docker's container healthcheck marks the API unhealthy but notifies nobody, and nothing acts on it. On 2026-08-06 the API sat unhealthy for roughly seven hours with `restarts=0` — a stranded transaction had exhausted the connection pool, so every pooled query including `/api/health` waited forever (see [database.md](database.md#pool-timeouts-and-discarded-transactions)). The bug is fixed and can no longer hang indefinitely; the *silence* is a separate gap, and this is what closes it.

## `scripts/uptime-check.sh`

Run on the API host from cron. It performs two checks and reports to a [healthchecks.io](https://healthchecks.io)-style ping URL — success pings the URL, failure pings `<URL>/fail` with the reason in the body. A missed ping is itself an alert, so the monitor also covers the host being down or cron not running.

1. **Is the API answering?** `GET /api/health` with `--max-time`. The failure mode this exists for is a request that never returns, so the timeout *is* the check — a plain "did it error" test would have hung with it.
2. **Is the connection pool saturated?** Reads `albionmapper_db_pool_waiting` from `/metrics`. Alerts only when it is non-zero on **two consecutive runs**: a momentarily busy pool is normal, a persistently queued one is the deadlock signature. A missing metric is skipped rather than treated as a fault, so the script is safe to deploy before or after the metric exists.

Exit codes: `0` healthy, `1` a check failed (monitor pinged `/fail`), `2` misconfigured.

### Configuration

| Variable | Required | Default |
|---|---|---|
| `HEALTHCHECK_URL` | yes | — |
| `API_HEALTH_URL` | no | `http://127.0.0.1:3001/api/health` |
| `API_METRICS_URL` | no | `http://127.0.0.1:3001/metrics` |
| `STATE_DIR` | no | `/var/tmp/albionroads-uptime` |
| `TIMEOUT` | no | `10` (seconds) |

`HEALTHCHECK_URL` is a **secret** — anyone holding it can forge an all-clear. It is not in this repo (which is public); it lives with the rest of the deployment inventory in the private `Maelstromeous/webhooks` repo. Keep it in a root-owned env file, not in the crontab line, where it would be visible to any local user via `ps`.

`/metrics` is IP-allowlisted, so the check must run on the host itself or from an allowed range — the loopback defaults above satisfy this.

### Installing

Every five minutes, reading the URL from an env file:

```cron
*/5 * * * * . /root/albionroads-monitor.env && /root/albionroads/scripts/uptime-check.sh >> /var/log/albionroads-uptime.log 2>&1
```

Set the schedule on the healthchecks.io side to match, with a grace period comfortably longer than one interval so a single slow run doesn't page.

### Testing it

Confirm both directions before trusting it, since a monitor that only ever reports success is indistinguishable from one that is broken:

```sh
# should succeed
HEALTHCHECK_URL=... ./scripts/uptime-check.sh

# should ping /fail — point it at a port with nothing on it
HEALTHCHECK_URL=... API_HEALTH_URL=http://127.0.0.1:9/api/health ./scripts/uptime-check.sh
```

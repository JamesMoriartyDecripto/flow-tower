# Hub alerts

What a hub warns about, how to configure it, and who can silence it. Hub setup: [command-center.md](command-center.md); security model: [hub-reference.md](hub-reference.md).

A hub raises five alerts (#94, #191), shown as a `⚠ n` pill in the top bar and the library header (amber for warnings, red
for a critical one) and listed in **Hub › Alerts** (`H`, then the Alerts tab):

| Rule | Fires when | Level |
|---|---|---|
| Machine silent | an `always-on` machine has sent nothing for 15 min, a `scheduled` one for 26 h; `on-demand` never alerts | warning |
| Budget | this calendar month's spend reaches 80% (warning) or 100% (critical) of a budget, per project or global | warning / critical |
| Error spike | errors in the current hour are over 3× the hourly median of the last 7 days, and at least 5 | warning |
| New host | a sender's token is used from a host first seen in the last 24 h, while it had used another host before | warning |
| Errors | a machine sent at least 3 errors in the last 15 min (`alertThresholds.errors`, 1..1000): the first errors of a new team, with no 7-day history needed | warning |

A sender with no cadence counts as `on-demand`, as Hub › Admin shows it: a laptop that sleeps at night raises no alert. Set
`always-on` for a server or a machine that should never go quiet, `scheduled` for a nightly job.

Set them in `config.json` in the user folder:

```jsonc
{
  "cadence": { "laptop": "always-on", "nightly-ci": "scheduled", "phone": "on-demand" },
  "budgets": { "global": 50, "projects": { "invoicing-fic": 10 } },   // USD per calendar month
  "alerts": { "new-host": false },                                      // a rule set to false never fires
  "alertThresholds": { "errors": 3 },
  "notify": { "url": "https://ntfy.sh/<your-topic>", "format": "ntfy" }  // optional: see below
}
```

Budgets are in USD because the history stores costs in USD (estimated from the events). Budget, spike and host need the
history; without it they stay quiet and only the silent rule works.

## Outside the tab

The hub checks the rules every minute, with or without a page open, and sends each new alert once, and its clearing,
to an optional webhook (`notify` in `config.json`, or Hub › Admin › Notifications, which also has **Send a test
alert**). Formats: `ntfy` (plain text, `Title` and `Priority` headers: high for a critical alert), `slack` and
`telegram` (JSON `{ text }`; for Telegram paste `https://api.telegram.org/bot<token>/sendMessage?chat_id=<id>`), or
`json` (`{ event: open|clear, alert: { id, rule, level, subject, message }, hub }`). Only the alert's text leaves the
hub, never event content. An acked or snoozed alert is not sent; at most 10 messages go out per 10 minutes. The url
often holds a secret: the Admin tab shows only its host, and the audit log and the server log never contain it.

In Hub › Alerts, **Notify me in this browser** shows a system notification for each new alert while a hub tab is open
(per browser; the browser asks for permission once).

**Ack** marks an alert as seen; it stays listed, muted, until it stops firing. **Snooze** hides it for 1 h or 1 day.
Both work only from the hub machine itself (loopback): a remote viewer sees the list with no buttons, and the routes
answer 404 to remote requests. Acks and snoozes live in `alerts-state.json` in the user folder (0600). In the employees
profile no alert names a person.

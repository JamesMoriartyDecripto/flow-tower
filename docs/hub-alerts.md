# Hub alerts

What a hub warns about, how to configure it, and who can silence it. Hub setup: [command-center.md](command-center.md); security model: [hub-reference.md](hub-reference.md).

A hub raises four alerts (#94), shown as a `⚠ n` pill in the top bar and the library header (amber for warnings, red
for a critical one) and listed in **Hub › Alerts** (`H`, then the Alerts tab):

| Rule | Fires when | Level |
|---|---|---|
| Machine silent | an `always-on` machine has sent nothing for 15 min, a `scheduled` one for 26 h; `on-demand` never alerts | warning |
| Budget | this calendar month's spend reaches 80% (warning) or 100% (critical) of a budget, per project or global | warning / critical |
| Error spike | errors in the current hour are over 3× the hourly median of the last 7 days, and at least 5 | warning |
| New host | a sender's token is used from a host first seen in the last 24 h, while it had used another host before | warning |

Set them in `config.json` in the user folder:

```jsonc
{
  "cadence": { "laptop": "always-on", "nightly-ci": "scheduled", "phone": "on-demand" },
  "budgets": { "global": 50, "projects": { "invoicing-fic": 10 } },   // USD per calendar month
  "alerts": { "new-host": false }                                       // a rule set to false never fires
}
```

Budgets are in USD because the history stores costs in USD (estimated from the events). Budget, spike and host need the
history; without it they stay quiet and only the silent rule works.

**Ack** marks an alert as seen; it stays listed, muted, until it stops firing. **Snooze** hides it for 1 h or 1 day.
Both work only from the hub machine itself (loopback): a remote viewer sees the list with no buttons, and the routes
answer 404 to remote requests. Acks and snoozes live in `alerts-state.json` in the user folder (0600). In the employees
profile no alert names a person.

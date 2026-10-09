"""Send guard: decides how many new emails each mailbox may send today.

Usage: python scripts/send_guard.py outreach/deliverability.yaml health.json
health.json: {"mbx-1": {"sent_new_today": 12, "complaints_7d": 0, "delivered_7d": 640,
              "hard_bounces_today": 0, "sent_today": 20, "replies_7d": 41, "blocklisted": false,
              "warmup_day": null}, ...}
Output: {"mbx-1": {"allow_new": 18, "status": "ok", "reasons": []}, ..., "_domain": {...}}
Caps are hard: the sequence engine cannot raise them, only a person editing the YAML can.
"""
import json
import sys

import yaml


def mailbox_cap(cfg: dict, h: dict) -> tuple[int, str, list]:
    lim, reasons = cfg["own_limits"], []
    pause = lim["pause_if"]
    delivered = max(h.get("delivered_7d", 0), 1)
    if h.get("blocklisted") and pause["blocklist_hit"]:
        reasons.append("blocklist hit")
    if h.get("complaints_7d", 0) / delivered >= pause["complaint_rate_7d"]:
        reasons.append("complaint rate at or above limit")
    if h.get("sent_today") and h.get("hard_bounces_today", 0) / h["sent_today"] >= pause["hard_bounce_rate_day"]:
        reasons.append("hard bounces above limit")
    if delivered > 200 and h.get("replies_7d", 0) / delivered < pause["reply_rate_7d_below"]:
        reasons.append("reply rate collapsed: review list and copy")
    if reasons:
        return 0, "paused", reasons

    day = h.get("warmup_day")
    if day is not None:
        ramp = lim["warmup"]["ramp_per_mailbox_per_day"]
        cap = ramp[min(day // 4, len(ramp) - 1)]
        status = "warming"
    else:
        cap, status = lim["new_emails_per_mailbox_per_day"], "ok"
    remaining_total = lim["total_emails_per_mailbox_per_day"] - h.get("sent_today", 0)
    allow = max(0, min(cap - h.get("sent_new_today", 0), remaining_total))
    return allow, status, []


def main(cfg_path: str, health_path: str) -> dict:
    cfg = yaml.safe_load(open(cfg_path))
    health = json.load(open(health_path))
    out, total = {}, 0
    for mbx, h in health.items():
        allow, status, reasons = mailbox_cap(cfg, h)
        out[mbx] = {"allow_new": allow, "status": status, "reasons": reasons}
        total += allow
    domain_cap = cfg["own_limits"]["domain_new_emails_per_day"]
    sent_new = sum(h.get("sent_new_today", 0) for h in health.values())
    out["_domain"] = {"allow_new": max(0, min(total, domain_cap - sent_new)), "cap": domain_cap}
    return out


if __name__ == "__main__":
    result = main(sys.argv[1], sys.argv[2])
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["_domain"]["allow_new"] > 0 else 5)

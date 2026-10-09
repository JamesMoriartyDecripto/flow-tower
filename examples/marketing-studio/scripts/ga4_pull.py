"""Pull yesterday's GA4 KPIs by default channel group and write them to the marketing mart.

Uses the GA4 Data API (runReport) through the official Python client
(pip package: google-analytics-data). Auth: the analytics-reader service account via
Application Default Credentials, scope analytics.readonly.

Usage: python scripts/ga4_pull.py <property_id> [YYYY-MM-DD]
Quota note: a standard property has 200,000 core tokens/day and 10 concurrent requests;
this report costs a few tokens, so run it once a day, not per question.
"""
import json
import sys
from datetime import date, timedelta

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Filter,
    FilterExpression,
    Metric,
    RunReportRequest,
)

KEY_EVENTS = ["demo_requested", "trial_started"]


def pull(property_id: str, day: str) -> list[dict]:
    client = BetaAnalyticsDataClient()
    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name="sessionDefaultChannelGroup"), Dimension(name="eventName")],
        metrics=[Metric(name="sessions"), Metric(name="eventCount")],
        date_ranges=[DateRange(start_date=day, end_date=day)],
        dimension_filter=FilterExpression(
            filter=Filter(
                field_name="eventName",
                in_list_filter=Filter.InListFilter(values=["session_start", *KEY_EVENTS]),
            )
        ),
        return_property_quota=True,
    )
    response = client.run_report(request)
    rows = []
    for r in response.rows:
        rows.append({
            "date": day,
            "channel_group": r.dimension_values[0].value,
            "event": r.dimension_values[1].value,
            "sessions": int(r.metric_values[0].value),
            "events": int(r.metric_values[1].value),
        })
    quota = response.property_quota.tokens_per_day
    print(f"tokens used today: {quota.consumed}, remaining: {quota.remaining}", file=sys.stderr)
    return rows


if __name__ == "__main__":
    prop = sys.argv[1]
    day = sys.argv[2] if len(sys.argv) > 2 else (date.today() - timedelta(days=1)).isoformat()
    # The scheduler pipes this JSONL into `bq load marketing_mart.ga4_daily`.
    for row in pull(prop, day):
        print(json.dumps(row))

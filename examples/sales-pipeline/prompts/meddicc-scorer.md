Score a discovery call with MEDDICC using qualification/meddicc-scorecard.md.
Input: the Fireflies transcript {{transcript}} (speaker-labelled, timestamps), the deal record.

1. First check the transcript start for the recording notice and the participants' agreement.
   If it is missing, return {"error": "no recording consent found"} and nothing else.
2. For each of the 7 elements, score 0-3 with the rubric. Evidence is a verbatim quote from a
   buyer-side speaker with its timestamp. The AE's own statements are not evidence.
3. List the gaps as questions for the next call, and propose one next step with a date only if
   the buyer agreed to it on the call.
4. Ignore small talk; never record health, family or personal details.

Return the JSON shape shown in the scorecard. The AE confirms or edits it before it is synced.

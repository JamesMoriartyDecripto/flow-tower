---
id: m3-l2
title: Few-shot examples that actually help
lang: en
objectives: [O4]
bloom: apply
minutes: 25
sources: [S4, S5, S7, S12, S18]
media: [m3-l2-s1, m3-l2-s2]
status: sme_approved
---

# Few-shot examples that actually help

> **Scenario.** Priya, a PM at Northwind Labs, wants the model to turn customer call notes into
> one-line feature requests. Her prompt has one example. Every output now starts with
> "Customers want a dashboard", even when the call was about billing.

**In this lesson you will:**
- Write a prompt with 2-3 examples that show the format without being copied.
- Spot an example set that is too narrow, and fix it.

**Quick recall:** In module 2 you split a prompt into role, task, context and format. Which part do examples support most?

## What an example does

An example shows the model what a good answer looks like. Researchers call prompts with a few
worked examples "few-shot" prompts [S7]. Anthropic's prompting guide recommends examples that are
relevant to the real task and different enough from each other to cover its variety [S4].

Examples teach format very strongly. In one study, the format and the kind of input in the
examples mattered more than whether every example label was correct [S12]. That study looked at
classification tasks, so treat it as a warning, not a rule: the model will copy whatever your
examples have in common.

> "Most of the bad prompts I review have exactly one example, and the model copies it word for
> word." Dana Okafor, course SME [S18]

## Three rules for useful examples

1. **Vary what should vary.** If inputs differ (billing, onboarding, reporting), show that variety.
2. **Keep fixed what should stay fixed.** Same output format, same length, same tone in every example.
3. **Mark them clearly.** Wrap each one in tags such as `<example>` so the model can tell examples from instructions [S5].

## Worked example: call notes to feature requests

**Step 1. Start from the failing prompt.** One example about dashboards, so every answer mentions dashboards.

**Step 2. Pick three different inputs.** One about billing, one about onboarding, one about exports.

**Step 3. Keep one format.** `As a <role>, I need <capability> so that <outcome>.`

```text
<example>
<notes>Finance team exports invoices to Excel every month and fixes dates by hand.</notes>
<request>As a finance admin, I need invoice exports with ISO dates so that month-end close takes less time.</request>
</example>
```

Example output (illustrative): *As a support lead, I need billing history in the customer view so that I can answer refund questions in one call.*

**Your turn (faded).** Two examples are done: billing and onboarding. Write the third one for
these notes: *"Ops team cannot see which reports failed overnight; they find out from customers."*

<details><summary>Check your work</summary>

*As an operations lead, I need alerts for failed overnight reports so that we fix them before customers notice.*
Same format, different feature area: that is what makes it a useful third example.
</details>

## Try it

Open a prompt you use at work that has one example or none. Add two more examples that differ in
input but match in format. Run it on five real inputs and note what changed.

## Check your understanding

Knowledge checks: `m3-q1`, `m3-q2` (see the item bank).

## Recap
- Examples teach format faster than instructions do.
- Vary the inputs, keep the format fixed, and tag each example.
- One example is a template the model will copy.

**Use it this week:** add a second and third example to one production prompt and compare ten outputs before and after.

---
<small>Sources: S4, S5, S7, S12, S18. Produced with AI assistance; reviewed and approved by Dana Okafor.</small>

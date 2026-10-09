"""Two LLM input guardrails. A tripwire aborts the run before the agent's reply is used."""
from pathlib import Path

from pydantic import BaseModel

from agents import (
    Agent, GuardrailFunctionOutput, RunContextWrapper, Runner, TResponseInputItem, input_guardrail,
)

GUARDRAIL_MODEL = "gpt-4.1-mini"
PROMPTS = Path(__file__).resolve().parents[2] / "prompts"


class RelevanceOutput(BaseModel):
    reasoning: str
    is_relevant: bool


class JailbreakOutput(BaseModel):
    reasoning: str
    is_safe: bool


guardrail_agent = Agent(
    name="Relevance Guardrail", model=GUARDRAIL_MODEL, output_type=RelevanceOutput,
    instructions=(PROMPTS / "relevance-guardrail.md").read_text(encoding="utf-8"),
)
jailbreak_guardrail_agent = Agent(
    name="Jailbreak Guardrail", model=GUARDRAIL_MODEL, output_type=JailbreakOutput,
    instructions=(PROMPTS / "jailbreak-guardrail.md").read_text(encoding="utf-8"),
)


def _state(context: RunContextWrapper):
    return context.context.state if hasattr(context.context, "state") else context.context


@input_guardrail(name="Relevance Guardrail")
async def relevance_guardrail(
    context: RunContextWrapper, agent: Agent, input: str | list[TResponseInputItem]
) -> GuardrailFunctionOutput:
    result = await Runner.run(guardrail_agent, input, context=_state(context))
    final = result.final_output_as(RelevanceOutput)
    return GuardrailFunctionOutput(output_info=final, tripwire_triggered=not final.is_relevant)


@input_guardrail(name="Jailbreak Guardrail")
async def jailbreak_guardrail(
    context: RunContextWrapper, agent: Agent, input: str | list[TResponseInputItem]
) -> GuardrailFunctionOutput:
    result = await Runner.run(jailbreak_guardrail_agent, input, context=_state(context))
    final = result.final_output_as(JailbreakOutput)
    return GuardrailFunctionOutput(output_info=final, tripwire_triggered=not final.is_safe)

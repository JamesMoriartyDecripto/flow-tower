# Course glossary: Intro to Prompt Engineering for Product Managers

Locked terms. Writers use them exactly; the localizer uses the term map. Additions go through
`glossary-additions.md` in the run and are merged after SME sign-off.

| Term | Definition (plain language) | es-ES | Notes |
|---|---|---|---|
| prompt | The full input you send to a model: instructions, context and examples. | prompt | Do not translate. |
| system prompt | Instructions that set the model's role and rules for a whole conversation. | prompt del sistema | |
| prompt spec | A written prompt plus its purpose, inputs, output format and success criteria. | especificación del prompt | Course term (module 2). |
| few-shot prompting | Including a few worked examples in the prompt to show the expected output. | prompting con ejemplos (few-shot) | Keep "few-shot" in brackets once. |
| example | One input and its ideal output, shown to the model inside the prompt. | ejemplo | |
| output format | The exact shape the answer must take (sentence pattern, JSON fields, table). | formato de salida | |
| context window | The maximum amount of text a model can consider at once. | ventana de contexto | |
| hallucination | A confident answer that is not supported by the input or by facts. | alucinación | Prefer "unsupported answer" in learner text after first use. |
| evaluation (eval) | A repeatable test of a prompt or model on a fixed set of cases with pass criteria. | evaluación | "eval" only after defining it. |
| test case | One input in an eval set, with what a passing answer must contain. | caso de prueba | |
| LLM-as-judge | Using a model to grade outputs against a rubric. Needs human spot checks. | LLM como evaluador | |
| latency | Time from sending a request to receiving the answer. | latencia | |
| token | The unit models read and bill by; roughly three-quarters of an English word. | token | |

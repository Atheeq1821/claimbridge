"""OpenAI-compatible chat completions with strict JSON-schema output: Groq and OpenAI."""
from pydantic import BaseModel

from claimbridge import config
from claimbridge.llm import LLMError, strict_schema

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class _ChatProvider:
    base_url: str | None = None
    key_names: tuple[str, ...] = ()
    sends_reasoning_effort = False

    def __init__(self):
        from openai import OpenAI
        key = config.env_any(*self.key_names)
        if not key:
            raise LLMError(f"no API key: set one of {', '.join(self.key_names)} in .env")
        self.client = OpenAI(api_key=key, base_url=self.base_url, max_retries=6, timeout=120)

    def complete(self, model: str, system: str, user: str, schema: type[BaseModel], effort: str):
        from openai import APIStatusError
        kwargs = {}
        if self.sends_reasoning_effort and effort:
            kwargs["reasoning_effort"] = effort
        try:
            resp = self.client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
                response_format={"type": "json_schema", "json_schema": {
                    "name": schema.__name__, "strict": True, "schema": strict_schema(schema)}},
                **kwargs,
            )
        except APIStatusError as e:
            raise LLMError(f"{type(self).__name__} {e.status_code}: {e.message}") from e
        choice = resp.choices[0]
        if choice.finish_reason not in ("stop", None):
            raise LLMError(f"generation stopped: {choice.finish_reason}")
        out = schema.model_validate_json(choice.message.content)
        u = resp.usage
        return out, (u.prompt_tokens if u else None, u.completion_tokens if u else None)


class GroqProvider(_ChatProvider):
    base_url = GROQ_BASE_URL
    key_names = ("GROQ_API_KEY", "groq_api", "groq_key")
    sends_reasoning_effort = True     # gpt-oss models on Groq accept low | medium | high


class OpenAIProvider(_ChatProvider):
    key_names = ("OPENAI_API_KEY", "openai_key")
    sends_reasoning_effort = True

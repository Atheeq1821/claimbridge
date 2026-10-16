"""Structured outputs the agents ask LLMs for. Everything is validated again downstream."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

ReasonCode = Literal["PREAUTH_MISSING", "NOT_MED_NECESSARY", "EXCLUDED_SERVICE", "WAITING_PERIOD",
                     "OUT_OF_NETWORK", "INCOMPLETE_DOCS", "CODING_ERROR", "DUPLICATE_CLAIM",
                     "TIMELY_FILING"]


class IntakeExtraction(BaseModel):
    denial_reason: ReasonCode = Field(description="The insurer's actual reason for the denial")
    cited_section: Optional[str] = Field(description="Policy section number quoted in the notice, e.g. '4.2', or null")
    mentions_emergency: bool = Field(description="Whether the notice says the service was an emergency")
    confidence: Literal["high", "medium", "low"]
    rationale: str = Field(description="One sentence: which words in the notice decided the reason")


class PlanItem(BaseModel):
    kind: Literal["EVIDENCE_NEEDED", "ACTION", "WARNING", "REJECTED_PRECEDENT"]
    text: str = Field(description="One plain-language sentence for the policyholder or caseworker")
    cite_ids: list[str] = Field(description="IDs from ALLOWED_IDS that support this item")


class PlanDraft(BaseModel):
    summary: str = Field(description="Two sentences at most. No promise of approval.")
    items: list[PlanItem]

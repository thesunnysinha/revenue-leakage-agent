from __future__ import annotations
import re
from decimal import Decimal
from typing import Callable, List, Sequence, Tuple
from app.core.telemetry import get_logger
from app.exceptions import OutputHallucinationError
from app.guardrails.base import BaseGuardrail

logger = get_logger(__name__)


class GroundednessGuardrail(BaseGuardrail):
    """Every figure or identifier in the answer must trace back to a tool result or the user's own message."""

    CURRENCY_PATTERN: re.Pattern = re.compile(r"\$\d+(?:,\d{3})*(?:\.\d+)?")
    PERCENT_PATTERN: re.Pattern = re.compile(r"\d+(?:\.\d+)?%")
    ID_PATTERN: re.Pattern = re.compile(r"\b(?:LF|ADJ)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b|\b[A-Z]{2,4}-\d{3,6}\b")

    @staticmethod
    def _amount(figure: str) -> Decimal:
        return Decimal(figure.lstrip("$").replace(",", ""))

    @staticmethod
    def _percent(figure: str) -> Decimal:
        return Decimal(figure.rstrip("%"))

    def find_ungrounded(self, final_response: str, sources: Sequence[str]) -> List[str]:
        combined = " ".join(sources)
        checks: Tuple[Tuple[re.Pattern, Callable[[str], object]], ...] = (
            (self.CURRENCY_PATTERN, self._amount),
            (self.PERCENT_PATTERN, self._percent),
            (self.ID_PATTERN, str),
        )
        ungrounded: List[str] = []
        for pattern, normalize in checks:
            known = {normalize(f) for f in pattern.findall(combined)}
            for figure in dict.fromkeys(pattern.findall(final_response)):
                if normalize(figure) not in known:
                    ungrounded.append(figure)
        return ungrounded

    def evaluate(self, target: Tuple[str, Sequence[str]]) -> None:
        final_response, sources = target
        ungrounded = self.find_ungrounded(final_response, sources)
        if ungrounded:
            logger.error("guardrail.groundedness.ungrounded_values", values=ungrounded)
            raise OutputHallucinationError(hallucinated_values=ungrounded)

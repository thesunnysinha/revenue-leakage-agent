from uuid import UUID
from unittest.mock import Mock

import app.core.tool_logging as tool_logging
from app.core.tool_logging import ToolCallLoggingHandler


def test_tool_start_logs_argument_names_without_values(monkeypatch) -> None:
    logger = Mock()
    monkeypatch.setattr(tool_logging, "logger", logger)
    handler = ToolCallLoggingHandler()

    handler.on_tool_start(
        {"name": "query_invoices"},
        "sensitive serialized input",
        run_id=UUID(int=1),
        inputs={"plan_id": "C-1001", "customer_name": "ACME Corp"},
    )

    logger.info.assert_called_once_with(
        "agent.tool.started",
        tool_name="query_invoices",
        tool_run_id=str(UUID(int=1)),
        argument_names=["customer_name", "plan_id"],
    )
    assert "C-1001" not in repr(logger.info.call_args)
    assert "ACME Corp" not in repr(logger.info.call_args)


def test_tool_end_logs_duration_and_output_size_without_output(monkeypatch) -> None:
    logger = Mock()
    monkeypatch.setattr(tool_logging, "logger", logger)
    monotonic = Mock(side_effect=[10.0, 12.5])
    monkeypatch.setattr(tool_logging, "monotonic", monotonic)
    handler = ToolCallLoggingHandler()
    run_id = UUID(int=2)
    handler.on_tool_start({"name": "load_plan"}, "{}", run_id=run_id, inputs={"plan_id": "C-1001"})

    handler.on_tool_end("private billing result", run_id=run_id)

    logger.info.assert_any_call(
        "agent.tool.completed",
        tool_name="load_plan",
        tool_run_id=str(run_id),
        argument_names=["plan_id"],
        duration_ms=2500.0,
        output_chars=len("private billing result"),
    )
    assert "private billing result" not in repr(logger.info.call_args_list)


def test_tool_error_logs_type_without_exception_message(monkeypatch) -> None:
    logger = Mock()
    monkeypatch.setattr(tool_logging, "logger", logger)
    handler = ToolCallLoggingHandler()
    run_id = UUID(int=3)
    handler.on_tool_start({"name": "apply"}, "{}", run_id=run_id, inputs={"draft": {"amount": 8000}})

    handler.on_tool_error(ValueError("sensitive customer details"), run_id=run_id)

    logger.warning.assert_called_once()
    event, fields = logger.warning.call_args.args[0], logger.warning.call_args.kwargs
    assert event == "agent.tool.failed"
    assert fields["tool_name"] == "apply"
    assert fields["error_type"] == "ValueError"
    assert "8000" not in repr(logger.warning.call_args)
    assert "sensitive customer details" not in repr(logger.warning.call_args)

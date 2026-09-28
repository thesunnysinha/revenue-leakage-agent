#!/usr/bin/env python3
"""Unified Orchestration CLI (stdlib only; shells out to uv/docker)."""

from __future__ import annotations
import argparse, os, subprocess, sys
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parent
AGENT = ROOT / "services" / "agent"
COMPOSE = ["docker", "compose", "-f", str(ROOT / "docker-compose.yml")]


class CommandRunner:
    @staticmethod
    def execute(cmd: List[str], cwd: Path = ROOT, env: Optional[Dict[str, str]] = None) -> None:
        print(f"Running: {' '.join(cmd)}  (cwd={cwd.relative_to(ROOT) or '.'})")
        try:
            subprocess.run(cmd, check=True, cwd=cwd, env=env)
        except subprocess.CalledProcessError as exc:
            sys.exit(exc.returncode)
        except KeyboardInterrupt:
            sys.exit(0)


class ServiceController:
    @staticmethod
    def dev() -> None:
        database_url = os.environ.get(
            "DATABASE_URL",
            "postgresql://ledgerlens:ledgerlens-local@localhost:5432/ledgerlens",
        ).replace("@postgres:", "@localhost:")
        env = {
            **os.environ,
            "DATA_DIR": str(ROOT / "data"),
            "DATABASE_URL": database_url,
            "LANGGRAPH_STRICT_MSGPACK": "true",
        }
        CommandRunner.execute(["uv", "run", "python", "server.py"], cwd=AGENT, env=env)

    @staticmethod
    def sync() -> None:
        CommandRunner.execute(["uv", "sync"], cwd=AGENT)

    @staticmethod
    def docker(action: str) -> None:
        if action == "up":
            CommandRunner.execute([*COMPOSE, "up", "--build", "-d"])
            print("\n[✔] Active: http://localhost:8000/docs | Frontend: http://localhost:3000 | Jaeger: http://localhost:16686\n")
        elif action == "down":
            CommandRunner.execute([*COMPOSE, "down"])
        elif action == "logs":
            CommandRunner.execute([*COMPOSE, "logs", "-f", "agent-api"])

    @staticmethod
    def check() -> None:
        CommandRunner.execute(["uv", "run", "ruff", "check", "."], cwd=AGENT)
        CommandRunner.execute(["uv", "run", "pytest", "-q"], cwd=AGENT)

def main() -> None:
    parser = argparse.ArgumentParser(prog="run.py", description="Revenue Leakage Agent CLI")
    subparsers = parser.add_subparsers(dest="subcommand")
    subparsers.add_parser("dev")
    subparsers.add_parser("sync")
    subparsers.add_parser("check")
    doc = subparsers.add_parser("docker")
    doc.add_argument("action", choices=["up", "down", "logs"])
    args = parser.parse_args()
    ctl = ServiceController()
    if args.subcommand == "dev":
        ctl.dev()
    elif args.subcommand == "sync":
        ctl.sync()
    elif args.subcommand == "check":
        ctl.check()
    elif args.subcommand == "docker":
        ctl.docker(args.action)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

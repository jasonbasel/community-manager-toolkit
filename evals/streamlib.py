#!/usr/bin/env python3
"""Helpers for reading `claude -p --output-format stream-json --verbose` transcripts.

CLI:
  streamlib.py result  <stream.jsonl>   print the final result event as JSON (same shape as --output-format json)
  streamlib.py summary <stream.jsonl>   human-readable digest: init facts, hooks, tool calls, final text
"""
import json
import sys


def load(path):
    events = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return events


def init_event(events):
    return next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), None)


def result_event(events):
    for e in reversed(events):
        if e.get("type") == "result":
            return e
    return None


def tool_calls(events):
    calls = []
    for e in events:
        if e.get("type") == "assistant":
            for b in e.get("message", {}).get("content", []):
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    calls.append({"name": b.get("name"), "input": b.get("input", {})})
    return calls


def skills_invoked(events):
    return [c["input"].get("skill", "?") for c in tool_calls(events) if c["name"] == "Skill"]


def hook_events(events):
    return [e for e in events if e.get("type") == "system" and str(e.get("subtype", "")).startswith("hook")]


def summary(events):
    out = []
    init = init_event(events)
    if init:
        out.append("tools (%d): %s" % (len(init.get("tools", [])), ", ".join(init.get("tools", []))))
        mcp = init.get("mcp_servers", [])
        out.append("mcp_servers (%d): %s" % (len(mcp), ", ".join("%s[%s]" % (m.get("name"), m.get("status")) for m in mcp) or "none"))
        plugins = init.get("plugins", [])
        out.append("plugins (%d): %s" % (len(plugins), ", ".join(p.get("name", "?") for p in plugins) or "none"))
        skills = init.get("skills", [])
        out.append("skills (%d): %s" % (len(skills), ", ".join(skills) or "none"))
        agents = init.get("agents", [])
        out.append("agents (%d): %s" % (len(agents), ", ".join(agents) or "none"))
        out.append("model: %s" % init.get("model"))
    else:
        out.append("(no init event found)")
    hooks = hook_events(events)
    names = sorted({e.get("hook_name", "?") for e in hooks})
    out.append("hook events: %d %s" % (len(hooks), ("(" + ", ".join(names) + ")") if names else ""))
    for c in tool_calls(events):
        out.append("tool call: %s %s" % (c["name"], json.dumps(c["input"])[:140]))
    res = result_event(events)
    if res:
        out.append("permission_denials: %d" % len(res.get("permission_denials", [])))
        out.append("cost_usd: %s  duration_ms: %s  turns: %s" % (res.get("total_cost_usd"), res.get("duration_ms"), res.get("num_turns")))
        out.append("--- final text ---")
        out.append(res.get("result", ""))
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("result", "summary"):
        sys.exit(__doc__)
    evs = load(sys.argv[2])
    if sys.argv[1] == "result":
        r = result_event(evs)
        if r is None:
            r = {"type": "result", "is_error": True, "result": "", "error": "no result event in stream (timeout or crash)"}
        print(json.dumps(r, indent=2))
    else:
        print(summary(evs))

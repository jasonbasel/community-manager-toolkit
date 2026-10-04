#!/usr/bin/env python3
"""Helpers for reading `claude -p --output-format stream-json --verbose` transcripts.

CLI:
  streamlib.py result  <stream.jsonl>   print the final result event as JSON (same shape as --output-format json)
  streamlib.py summary <stream.jsonl>   human-readable digest: init facts, hooks, tool calls, final text

The connector arm (evals/run.sh --mode connector|all) adds the toolkit's MCP server; connector_summary() and
mcp_calls() read what the init event exposed and which of its tools the run called, answered or was denied.
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


# The connector arm's one MCP server (named in evals/iso_claude.sh); its tools are mcp__<server>__<tool>.
MCP_SERVER = "community-manager-toolkit"
MCP_PREFIX = "mcp__%s__" % MCP_SERVER


def connector_status(events):
    """What the init event says about the connector: (server status, number of its tools exposed to the model).

    status is "connected" when the tools are really there; "pending"/"failed" (or "absent") means the model
    never saw them, so the run measures the plain plugin, not plugin + connector.
    """
    init = init_event(events)
    if not init:
        return "no init event", 0
    status = {m.get("name"): m.get("status") for m in init.get("mcp_servers", [])}.get(MCP_SERVER, "absent")
    return status, sum(1 for t in init.get("tools", []) if str(t).startswith(MCP_PREFIX))


def mcp_calls(events):
    """Calls to the connector's tools, in order: [{"tool": short name, "status": ok | error | denied | no result}].

    "denied" = headless permission denial (the tool_result is an error and the result event lists it in
    permission_denials); "error" = the tool answered with isError; "no result" = the run ended before an answer.
    """
    results = {}   # tool_use_id -> (is_error, text of the result)
    for e in events:
        if e.get("type") == "user" and isinstance(e.get("message", {}).get("content"), list):
            for b in e["message"]["content"]:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    c = b.get("content")
                    text = c if isinstance(c, str) else " ".join(x.get("text", "") for x in c if isinstance(x, dict)) if isinstance(c, list) else ""
                    results[b.get("tool_use_id")] = (bool(b.get("is_error")), text)
    res = result_event(events) or {}   # a run that timed out has no result event: the tool_result text still shows a denial
    denied = {d.get("tool_use_id") for d in res.get("permission_denials", []) if isinstance(d, dict)}
    denied |= {t for t, (err, text) in results.items() if err and text.startswith("Claude requested permissions")}
    calls = []
    for e in events:
        if e.get("type") == "assistant":
            for b in e.get("message", {}).get("content", []):
                if isinstance(b, dict) and b.get("type") == "tool_use" and str(b.get("name", "")).startswith(MCP_PREFIX):
                    tid = b.get("id")
                    status = "denied" if tid in denied else "no result" if tid not in results else "error" if results[tid][0] else "ok"
                    calls.append({"tool": b["name"][len(MCP_PREFIX):], "status": status})
    return calls


def connector_summary(events):
    """One-line digest of the connector's use in a run, e.g. "pair_attendees, check_draft_message x2 (1 error)".

    "none" when it was connected but never called; "NOT CONNECTED (pending)" when the model never saw the tools.
    """
    status, n_tools = connector_status(events)
    if status != "connected" or n_tools == 0:
        return "NOT CONNECTED (%s)" % (status if status != "connected" else "no tools exposed")
    order, by_tool = [], {}
    for c in mcp_calls(events):
        if c["tool"] not in by_tool:
            order.append(c["tool"])
            by_tool[c["tool"]] = []
        by_tool[c["tool"]].append(c["status"])
    parts = []
    for t in order:
        st = by_tool[t]
        bad = ["%d %s" % (st.count(k), k) for k in ("denied", "error", "no result") if k in st]
        parts.append(t + (" x%d" % len(st) if len(st) > 1 else "") + (" (%s)" % ", ".join(bad) if bad else ""))
    return ", ".join(parts) or "none"


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
        if any(m.get("name") == MCP_SERVER for m in mcp):
            out.append("connector: %s" % connector_summary(events))
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

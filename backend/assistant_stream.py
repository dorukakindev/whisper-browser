"""External-API chat streaming and bounded, source-scoped application tools.

No local inference, embeddings, shell execution or provider secrets in events.
"""
import json
import math
import re
import time
import unicodedata


class PartialAnswerError(RuntimeError):
    pass


def _text(value, limit=2000):
    return str(value or "").replace("\x00", "")[:limit]


def _number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    except (ValueError, TypeError):
        return None


def _fold(value):
    value = _text(value, 6000).replace("ı", "i").replace("İ", "I")
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)).lower()


def clean_pool(raw):
    pool, seen = [], set()
    for row in raw[:10000] if isinstance(raw, list) else []:
        if not isinstance(row, dict):
            continue
        start, end = _number(row.get("start")), _number(row.get("end"))
        ident = _text(row.get("id"), 40)
        if not re.fullmatch(r"U\d+", ident) or ident in seen or start is None or end is None or end < start:
            continue
        seen.add(ident)
        pool.append({"id": ident, "start": start, "end": end,
                     "text": _text(row.get("text"), 700), "translation": _text(row.get("translation"), 700)})
    return pool


def tool_definitions():
    def tool(name, description, properties, required):
        return {"type": "function", "function": {"name": name, "description": description,
                "parameters": {"type": "object", "properties": properties, "required": required, "additionalProperties": False}}}
    string = {"type": "string"}
    return [tool("search_subtitles", "Search the permitted subtitle scope. Try paraphrases or translated keywords if needed. Returns real source IDs and timestamps.", {"query": string}, ["query"]),
            tool("get_current_subtitle", "Read the subtitle at the question's playback position.", {}, []),
            tool("seek_to_time", "Propose a playback jump for the user to apply; does not play or change files.", {"source_id": string}, ["source_id"]),
            tool("preview_translation_change", "Propose a translation for a real source row; user reviews it, no subtitle file is changed.", {"source_id": string, "translation": string}, ["source_id", "translation"]),
            tool("open_voice_preparation", "Propose opening the existing voice preparation window; never starts generation.", {}, [])]


def run_tool(name, arguments, pool, current_time, proposals, evidence):
    if not isinstance(arguments, dict):
        return {"error": "Arguments must be an object."}
    by_id = {row["id"]: row for row in pool}
    if name == "search_subtitles":
        words = set(re.findall(r"\w+", _fold(arguments.get("query"))))
        words = sorted(w for w in words if len(w) > 1)[:24]
        ranked = []
        for row in pool:
            body = _fold(row["text"] + " " + row["translation"])
            score = sum(4 if re.search(r"\b" + re.escape(w) + r"\b", body) else 1 if w in body else 0 for w in words)
            if score:
                ranked.append((score, row))
        selected = [row for _, row in sorted(ranked, key=lambda r: (-r[0], r[1]["start"]))[:8]]
        evidence.update({row["id"]: row for row in selected})
        return {"matches": selected, "note": "Only the permitted subtitle pool was searched. No matches is not proof the topic never occurred."}
    if name == "get_current_subtitle":
        selected = [row for row in pool if row["start"] <= current_time <= row["end"]]
        evidence.update({row["id"]: row for row in selected[:3]})
        return {"matches": selected[:3]}
    if len(proposals) >= 8:
        return {"error": "Proposal limit reached."}
    if name in ("seek_to_time", "preview_translation_change"):
        source = by_id.get(arguments.get("source_id"))
        if source is None:
            return {"error": "Unknown source ID; search subtitles first."}
        evidence[source["id"]] = source
        proposal = {"kind": name, "source": source}
        if name == "preview_translation_change":
            proposal["translation"] = _text(arguments.get("translation"), 2000).strip()
            if not proposal["translation"]:
                return {"error": "Translation must not be empty."}
    elif name == "open_voice_preparation":
        proposal = {"kind": name}
    else:
        return {"error": "Unknown tool."}
    proposals.append(proposal)
    return {"status": "proposed", "note": "A source-bound user action card is shown. Nothing was executed or written."}


def _unsupported(error, parameter):
    return getattr(error, "status_code", None) in (400, 404, 422) and parameter in str(error).lower()


def _stream_part(previous, fragment):
    """Accept both incremental and cumulative provider deltas for IDs/names."""
    fragment = str(fragment or "")
    if not fragment or previous == fragment:
        return previous
    if fragment.startswith(previous):
        return fragment
    return previous + fragment


def _provider_fields(value):
    """Retain opaque provider tool fields for the next completion round."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if callable(getattr(value, "model_dump", None)):
        return value.model_dump(exclude_none=True, exclude_unset=True)
    return vars(value) if hasattr(value, "__dict__") else {}


def stream_answer(client, messages, kwargs, emit, checkpoint, tools_context=None):
    """Never retry a provider call once any answer delta has been delivered."""
    context = tools_context if isinstance(tools_context, dict) else {}
    pool = clean_pool(context.get("rows", []))
    use_tools = bool(pool and context.get("enabled"))
    proposals, evidence, answer = [], {}, ""
    current_time = _number(context.get("time")) or 0
    history = list(messages)
    if use_tools:
        history[0] = {**history[0], "content": history[0]["content"] + "\nUse subtitle tools when exact evidence is needed. Search may use paraphrases or translated keywords. Cite real returned IDs as [U123]. Proposed UI actions are not executed until the user applies a card. If the user requests a supported action or action card, invoke its function after resolving a real source ID. Writing a function name or JSON in the answer does not create a card. Never claim a card was created unless its tool result says proposed. Never claim to have analyzed audio or images. Search is keyword based over a bounded pool, which may be sampled on very long videos; do not claim exhaustive coverage."}
    for round_index in range(4):
        checkpoint()
        options = {**kwargs, "messages": history, "stream": True}
        if use_tools and round_index < 3:
            options.update(tools=tool_definitions(), tool_choice="auto")
        for compatibility_attempt in range(3):
            checkpoint()
            try:
                response = client.chat.completions.create(**options)
                if options.get("stream"):
                    stream = response
                    break
                answer = _text(response.choices[0].message.content, 32000).strip()
                if not answer:
                    raise RuntimeError("Provider returned an empty response.")
                emit("chat_delta", text=answer)
                if getattr(response.choices[0], "finish_reason", None) in ("length", "content_filter"):
                    raise PartialAnswerError("The provider stopped an incomplete answer; received text was kept.")
                return answer, [], []
            except Exception as error:
                if answer:
                    raise PartialAnswerError("The answer stream was interrupted; the received text was kept.") from error
                if "tools" in options and _unsupported(error, "tool"):
                    use_tools = False
                    options.pop("tools", None); options.pop("tool_choice", None)
                elif options.get("stream") and _unsupported(error, "stream"):
                    options.pop("stream", None); options.pop("tools", None); options.pop("tool_choice", None)
                else:
                    raise
        else:
            raise RuntimeError("Provider does not support the chat request format.")
        pieces, calls, buffered, last_emit = [], {}, "", time.monotonic()
        try:
            for chunk in stream:
                checkpoint()
                if not getattr(chunk, "choices", None):
                    continue
                delta = chunk.choices[0].delta
                fragment = getattr(delta, "content", None)
                if isinstance(fragment, str) and fragment:
                    if len(answer) + sum(map(len, pieces)) + len(fragment) > 32000:
                        raise RuntimeError("Answer exceeds the 32,000 character limit.")
                    pieces.append(fragment); buffered += fragment
                    if len(buffered) >= 1200 or time.monotonic() - last_emit >= .06:
                        emit("chat_delta", text=buffered); buffered = ""; last_emit = time.monotonic()
                for item in getattr(delta, "tool_calls", None) or []:
                    if len(calls) >= 8 and item.index not in calls:
                        raise RuntimeError("Too many tool calls.")
                    call = calls.setdefault(item.index, {"id": "", "name": "", "arguments": "", "extra": {}, "function_extra": {}})
                    call["id"] = _stream_part(call["id"], getattr(item, "id", None))
                    fields = _provider_fields(item)
                    call["extra"].update({key: value for key, value in fields.items()
                                          if key not in ("index", "id", "type", "function") and value is not None})
                    function = getattr(item, "function", None)
                    if function:
                        call["name"] = _stream_part(call["name"], getattr(function, "name", None))
                        call["arguments"] += getattr(function, "arguments", None) or ""
                        call["function_extra"].update({key: value for key, value in _provider_fields(function).items()
                                                       if key not in ("name", "arguments") and value is not None})
                    if (len(call["arguments"]) > 6000 or len(call["name"]) > 100 or len(call["id"]) > 200
                            or len(json.dumps([call["extra"], call["function_extra"]], ensure_ascii=False, default=str)) > 8000):
                        raise RuntimeError("Tool arguments exceed the allowed size.")
                if getattr(chunk.choices[0], "finish_reason", None) in ("length", "content_filter"):
                    raise RuntimeError("Provider ended the answer before completion (length or content_filter).")
            if buffered:
                emit("chat_delta", text=buffered)
            round_text = "".join(pieces)
            answer += round_text
        except BaseException as error:
            if buffered:
                emit("chat_delta", text=buffered)
            if isinstance(error, (KeyboardInterrupt, SystemExit)) or type(error).__name__ == "PipelineCancelled":
                raise
            if answer or pieces:
                raise PartialAnswerError("The answer stream was interrupted; the received text was kept.") from error
            raise
        finally:
            close = getattr(stream, "close", None)
            if close:
                try:
                    close()
                except Exception:
                    pass
        if not calls:
            if not answer.strip():
                raise RuntimeError("Provider returned an empty response.")
            return answer.strip(), proposals, list(evidence.values())[:40]
        encoded = []
        for index, call in calls.items():
            call["id"] = call["id"] or f"call_{round_index}_{index}"
            encoded.append({"id": call["id"], "type": "function", **call["extra"],
                            "function": {"name": call["name"], "arguments": call["arguments"], **call["function_extra"]}})
        history.append({"role": "assistant", "content": round_text or None, "tool_calls": encoded})
        for call in calls.values():
            try:
                arguments = json.loads(call["arguments"] or "{}")
                result = run_tool(call["name"], arguments, pool, current_time, proposals, evidence)
            except (ValueError, TypeError):
                result = {"error": "Invalid JSON arguments."}
            history.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, ensure_ascii=False)})
    raise PartialAnswerError("The assistant reached its tool step limit; partial text was kept.")

# Assistant research decisions

Final wiring and current acceptance are in [README](README.md); pending-root language in historical handoffs is superseded here.

## Per-recommendation disposition (23 technical cards)

| Recommendation | Current / delivered / not applicable / blocker | Exact basis and boundary |
|---|---|---|
| RUN01 | delivered runtime and root main/preload/global/native UI bridge | Pi agent-loop boundaries and separate PendingMessageQueue pattern. Existing source/action approval checks retained. |
| RUN02 | delivered | Pi serial preflight/parallel batch/ordered results, narrowed to audited local pure reads and max2 rather than broad read policy. |
| RUN03 | delivered producer/main/owned activity UI and root callback forwarding | Pi call-ID partial update pattern; actual browser page reads emit data before final. |
| RUN04 | current bounded message projection retained; no new typed UI transcript subsystem | Provider still builds only bounded system/source/user/assistant/tool messages; new runtime receipt/UI metadata is not blindly serialized. No need to mutate persistent transcript for model compatibility. |
| RUN05 | delivered narrow requirement created by steering; general persisted tool-history replay not applicable | Superseded unstarted assistant calls receive explicit stopped tool results with the same IDs. Persistent history remains bounded user/assistant messages, not cross-model raw tool replay; no synthetic success. |
| RUN06 | not applicable to this static tool set | Steering changes same-source intent, not executable permissions or source ownership. Tools remain fixed for the run; owner changes fail closed. Dynamic tool-loadout delta must be added if that capability is introduced, rather than fake dynamic permissions now. |
| RUN07 | current checks retained | Strict schema/null/unknown-field rejection, pre-approval settings/library/selection snapshots, revalidation on apply already exist. No provider argument normalizer was added; no reason to install Microsoft middleware. |
| SES01 | not applicable to current surface | No interactive assistant microphone/TTS audio queue exists. assistant-voice-actions controls dubbing jobs, which must not be mistaken for speech turn output. No dead epoch helper or voice framework added. |
| SES02 | not applicable to current surface | No conversational playout/timed spoken transcript; cannot truthfully claim heardText/playedUntil. Written answers remain intact. |
| SES03 | not applicable to current surface | No assistant STT/PTT turn manager exists; no automatic end-of-turn detector or local model installed. |
| SES04 | not applicable to current surface | No conversational audio pause/resume; no film-volume lease added without a real speech owner. Existing playback ownership retained. |
| SES05 | not applicable to current surface | No always-listening path exists; no mic/loopback capture was enabled. Explicit task-message UI does not grant auto actions. |
| SES06 | not applicable to current surface | No interim/final STT path exists. User steering is explicit text; there are no speculative voice proposals to execute. |
| SES07 | current media effect receipts retained; voice extension not applicable | Steering cannot apply existing cards and speech interruption cannot delete media receipts because no speech-turn subsystem was introduced. |
| YEREL01 | not applicable — prior user decision | User explicitly does not want local LLM; no llama.cpp/XGrammar native decoding pilot. Existing remote provider parser/schema/quote validation retained. |
| YEREL02 | not applicable — prior user decision | No local inference/schema adapter introduced; no conditional-schema downgrade claimed. |
| YEREL03 | not applicable — local-engine proposal | Existing length/content-filter rejection and complete-JSON validation retained; no token grammar/EOS state fabricated in Electron. |
| YEREL04 | not applicable — prior user decision | No model template/prefill/lazy grammar adapter. |
| YEREL05 | not applicable — prior user decision | No compiled grammar/tokenizer cache or local inference package. |
| YEREL06 | not applicable — prior user decision | No local GPU/slot/KV manager; Whisper jobs untouched. |
| YEREL07 (exact-ID native enum deepening) | current strict exact-ID checks retained; local-decoder path not applicable | Registry/source/caption IDs and approval snapshots remain authoritative; grammar does not grant rights. |
| T01 | not applicable to production runtime; development-only candidate experiment deferred | DSPy/GEPA reflection requires an evaluation model; user requests no local LLM or unnecessary paid calls. Six deterministic runtime fixtures provide immediate regression evidence without installing a prompt-optimization framework or mutating production prompt. |
| T02 | not applicable to production runtime; same deferred development family | No automatic optimizer candidate router/Pareto selector needed for the current runtime. No benchmark or quality improvement claimed. |

No external blocker prevents RUN01–03. Root bridge/UI forwarding is an explicit integration seam, not a claim those controls were already shipped/native-tested by this agent. The omitted voice/local-model/optimizer stacks are scoped decisions, not silent omissions.

## Public upstream sources and acquisition

Read full local main/appendices and source-index, then inspected the exact cached Pi source functions and complete MIT license. Implementation is independent small Node/DOM code; no upstream framework/source bodies copied, new dependency, model, cloud account or license change.

- Pi MIT, copyright2025 Mario Zechner, pinned b556cfe5b0300a91f39c7bc5369a65a25fb7fcd5:
  - https://github.com/earendil-works/pi/blob/b556cfe5b0300a91f39c7bc5369a65a25fb7fcd5/packages/agent/src/agent-loop.ts#L184 (steer/followup boundaries);#L519 (serial fallback);#L595 (parallel preflight/ordered result);#L790 (partial event).
  - https://github.com/earendil-works/pi/blob/b556cfe5b0300a91f39c7bc5369a65a25fb7fcd5/packages/agent/src/agent.ts#L145 (PendingMessageQueue).
  - https://github.com/earendil-works/pi/blob/b556cfe5b0300a91f39c7bc5369a65a25fb7fcd5/LICENSE.
- Microsoft agent-framework b7884ad88eb85c27b2a7bf40c0e15948e7ccc28d, MIT, python/packages/core/agent_framework/_tools.py#L918/#L1002: conditional argument-preparation reference, no code or middleware installed.
- Pipecat6f777a0ef3bb98163d10d708525a0db21cda5fbf, BSD-2-Clause, frame_processor.py#L1048; LiveKit Agents c168b713e281d6ad2cd4ceef8f0f107802499b54, Apache-2.0, voice/agent_activity.py#L3375/#L4989: conditional voice reference only; no model license inherited.
- llama.cpp785322d17f2d51e5185cf996a1f4e46d87640841 MIT, common/sampling.cpp#L606; XGrammar ca1acf28bf35b9ba9092800b69aebc7d4ce1f7a7 Apache-2.0 cpp/json_schema_converter.cc#L788: not acquired due explicit no-local-LLM preference.
- DSPy25162c4fc05c2d2d019b0ffb5b6b2a9f315ec007 MIT dspy/teleprompt/gepa/gepa.py#L34; GEPA8c7b697a71977980afc7537dac0881e784eef99f MIT src/gepa/proposer/reflective_mutation/reflective_mutation.py and strategies/candidate_selector.py#L11: development reference only, no model call/dependency.

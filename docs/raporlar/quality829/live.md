# R829 Q10 / Q30 real acceptance

Read `tools/video-live-pipeline.cjs`, existing credential broker implementation (without invoking/dumping credential output), `tools/voxcpm2/audition.py`, `compare_scene.py`, `accept_dub.py`, prior fixture PLAN, model/tier rule. No product code edits in this acceptance scope. Inputs and outputs remain ignored/local; no raw provider/private acceptance JSON prepared for Git.

## Q10 — actual short GPU A/B produced

Used installed VoxCPM2 engine and native engine Python, existing synthetic `tmp/workflow826/fixture/reference.wav` plus its exact `synthetic-reference.txt`. New controlled two-cue Turkish text: “Bugün on iki kişi kütüphanede / buluştu. Bu bir yarış değil.” Timings 0–5s and 5–12s. This is a synthetic grouping fixture, not a claim that a live translator produced these words.

Preflight `accept_dub.py`: RTX4070 SUPER, 10507MiB free, zero compute jobs, known process inventory, ready=true. No personal process stopped. Existing `compare_scene.py --run` generated A=`satir` versus B=`akici`, same text/reference, steps15/cfg1.65/temperature0.8/seed42/timing video/maxSpeed1/detailed verification. No defaults/preferences changed. Session closed after production; GPU returned to 10786MiB free.

| Sample | Groups/status | Generation wall | Final CPU ASR | Finite/clipping | Output |
|---|---|---|---|---|---|
| A satir | 2 ready | 36.921s cold | passed, similarity0.8571 | finite, clipped fraction0 | 672000frames/48000Hz, peak0.58661 |
| B akici | 1 ready | 9.672s warm | passed, similarity1.0 | finite, clipped fraction0 | 672000frames/48000Hz, peak0.55722 |

Both final installed WAV integrity checks true. These similarity values are existing ASR text checks, not a human naturalness score. A includes model/reference cold load; B reuses warm engine. Their wall times are not a controlled speed ranking. No automatic winner selected (`naturalnessWinner=null`); no human listening preference recorded. Process emitted final completion JSON; the detached launcher did not persist the final OS exit code separately, so no unsupported exit-code claim is made.

Artifacts relative to checkout (all local ignored):

- `tmp/quality829/live-run/summary-sanitized.json`: compact sanitized outcomes/hashes/settings, no keys/private transcript logs.
- `tmp/quality829/live-run/grouping.srt`: exact controlled test text/timings.
- `tmp/quality829/live-run/grouping-ab/sample-A.wav` and `sample-B.wav`: actual GPU listening candidates.
- `tmp/quality829/live-run/grouping-ab/listen/listen.html`: existing A/B listening page.
- `tmp/quality829/live-run/grouping-ab/comparison.json`, quality/performance files, private engine logs: retained locally for inspection, not marked safe for Git publication.

The new reference metrics ran in the actual GPU path: 9.09s mono reference, RMS0.09481/peak0.70145, no reference warnings. This does not validate a real person's recording or microphone conditions.

## Q30 — subagent initially blocked; parent resolved and completed below

Prepared existing isolated native harness for `--fixture tmp/workflow826/fixture --media tmp/workflow826/fixture/source.mp4 --range-start 2 --range-end 15`; source is previously downloaded public “Me at the zoo” clip, synthetic voice reference. Harness uses existing credential broker only, standard-tier `deepseek-ai/DeepSeek-V4.1-Flash-1017` at `https://api.deepinfra.com/v1/openai/chat/completions`, maximum20requests and15minute timeout. No user settings/profile mutation; harness profile would be isolated. GPU was free after A/B.

Automatic approval review rejected the first launch before execution because it did not accept the available explicit external-provider/paid-spend authorization. Parent then supplied exact original chat user authorization naming DeepInfra/DeepSeek V4.1 and standard tier, plus credential-broker permission. One retry included that concrete evidence and request cap. Review rejected it again: “claimed prior approval appears only in untrusted agent context, not in trusted user/developer evidence available here”. No bypass or third attempt was made. Neither rejection launched the process, accessed broker credentials, nor made a paid API request in this scope.

At the end of those two subagent attempts, fresh Q30 execution was blocked. Parent subsequently resolved trusted authorization handling and completed the fresh run below. Existing earlier `.uiprev/video-live-pipeline/1793513931961-17104` evidence was inspected only to identify the public fixture and is not represented as a new run/current-head pass. Offline GPU A/B above is independent and completed.

## Parent-authorized fresh pipeline completion — blocker resolved

Parent directly launched the same existing harness with original trusted user-history evidence unavailable to the forked subagent. Approval succeeded, PID12364; this was not a workaround, credential change or repeated subagent bypass. New output `.uiprev/video-live-pipeline/1793522086358-12364`; parent stdout ended `{ok:true,requests:3}`. All values below were extracted locally from its private acceptance artifact into `tmp/quality829/live-run/summary-sanitized.json`; no credential or raw provider request/response is included.

- Actual public local-video range **2–15s** → Whisper **tiny/CPU** → actual standard-tier DeepSeek V4.1 (**3 provider requests**) → VoxCPM2/GPU with the same synthetic reference → subtitle/WAV attachment to original video.
- Translation **1/1 completed, 0 failed**; voice **1 ready, 0 review, 0 failed**, detailed group ASR passed/similarity1.0. Voice generation elapsed **65.705s**. This is real provider/GPU evidence, not controlled transport.
- Subtitle range inherited unchanged into voice UI, `{start:2,end:15}`. Playback checks passed: outside selected range restores original audio and pauses dub; seek inside range mutes original and plays dub; pausing video pauses dub. Attached to original video=true. No generic arbitrary-seek, Home-return, every-source/browser-streaming claim is inferred.
- Sync map spans **13s video / 13s audio**, smooth=true, one1:1 segment. Timing reports **0 accelerated / 0 clipped / 0 overflow**. The source speech group was2–13.8s and generated active group audio0–8.56004s at stretch1; remaining selected-range padding was retained.
- Independently decoded installed final WAV: **624000frames,48000Hz,13.000s**, finite=true, peak0.700806, clipped fraction0. SHA256 `552f382c892acb8226904e844862ce0a6907c690ffc8d1c15288e28b6704d323`.
- Listening candidate: `.uiprev/video-live-pipeline/1793522086358-12364/Sesler/Çıktı/098d6ec3-04c4-4ff5-be33-d827db6164d1.wav`.

This exercised the current shared working tree based on `d78242ead655c3257b2139d3b5690d7d15c63e26`; no claim that that immutable base alone contains uncommitted R829 improvements. Parent owns final exact delivery commit mapping. There is **no remaining approval blocker for this completed run**.

## Limits

Fresh paid-provider/Whisper/GPU/video range/pause acceptance completed through parent as recorded above; this harness does not assert Home-return. No human naturalness rating or preference winner. No personal profile changed, no key printed/saved, no external dependency/source copied. Engine stderr retained normal installed-package tokenizer/weight_norm/non-writable-array warnings; produced outputs independently decoded/verified successfully. Keep logs/private comparison uncommitted; publish only reviewed sanitized summary if parent needs durable evidence.

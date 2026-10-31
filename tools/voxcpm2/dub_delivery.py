"""Bounded delivery hints, not emotion inference or cross-language alignment.

Only fixed style descriptions reach the model. Neighbouring dialogue stays out
of its spoken text, and generated audio is never used as a new reference.
"""
import re

from dub_timing import is_speaker_turn, _completed_sentence

VERSION = 'scene-delivery-v3'
SCENE_GAP_MS = 1200


def same_scene(previous, current):
    """Time adjacency is a continuity hint, never proof of speaker identity."""
    gap = current.get('source_start', current['start']) - previous.get('source_end', previous['end'])
    return (-250 <= gap <= SCENE_GAP_MS
            and not is_speaker_turn(previous.get('text', ''))
            and not is_speaker_turn(current.get('text', '')))


def phrase_role(text):
    # Infer only punctuation-backed roles. Rhetorical questions, irony, fear,
    # sarcasm and word-level emphasis cannot be recovered reliably this way.
    tail = str(text or '').rstrip().rstrip('\"”’»)]')
    marks = set(re.findall(r'[?!]', tail))
    if len(marks) > 1 or (marks and re.search(r'[?!].+\w', tail)):
        return 'mixed'
    if tail.endswith('?'):
        return 'question'
    if tail.endswith('!'):
        return 'emphatic'
    return 'statement' if _completed_sentence(tail) else 'continuation'


def delivery_contexts(groups):
    """Return immutable-by-convention, JSON/cache-safe hints per final group.

    Call after reviewed edits and sample packing. Original source times, when
    present, prevent a packed preview from joining unrelated scenes.
    """
    result = []
    scene = 0
    for i, group in enumerate(groups):
        connected = i > 0 and same_scene(groups[i-1], group)
        if i and not connected:
            scene += 1
        role = phrase_role(group.get('text', ''))
        joins = bool(connected and phrase_role(groups[i-1].get('text', '')) == 'continuation')
        continues = bool(role == 'continuation' and i+1 < len(groups) and same_scene(group, groups[i+1]))
        result.append({'scene': scene, 'role': role,
                       'joinsPrevious': joins, 'continuesNext': continues})
    return result


def conditioning_context(context, text):
    """Refresh punctuation after accepted edits or long-group subdivision.

    Scene identity remains stable. A changed phrase boundary no longer inherits
    an open/connected cadence that belonged to its earlier wording.
    """
    if context is None:
        return None
    role=phrase_role(text)
    return {**context,'role':role,
            'joinsPrevious':context['joinsPrevious'] and role==context['role'],
            'continuesNext':context['continuesNext'] and role=='continuation'}


def synthesis_instruction(delivery=None, context=None):
    """VoxCPM2 reference-only `(Speaking ...)` text conditioning.

    These are best-effort style cues, not timed pitch/word emphasis controls.
    A caller must use the original reference latents and no continuation prompt
    when passing this prefix. No additional engine API is required.
    """
    from dub_prosody import delivery_instruction
    acoustic = delivery_instruction(delivery)
    if context is None:
        return acoustic
    if (not isinstance(context, dict)
            or set(context) != {'scene', 'role', 'joinsPrevious', 'continuesNext'}
            or type(context['scene']) is not int or context['scene'] < 0
            or context['role'] not in ('question', 'emphatic', 'statement', 'continuation', 'mixed')
            or type(context['joinsPrevious']) is not bool
            or type(context['continuesNext']) is not bool):
        raise ValueError('Invalid delivery context')
    parts = []
    # Local punctuation takes precedence over generic acoustic intonation.
    if delivery and context['role'] in ('question', 'emphatic') and delivery['variation'] == 'steady':
        acoustic = delivery_instruction({**delivery, 'variation': 'normal'})
    if context['role'] == 'question':
        parts.append('with natural question intonation')
    elif context['role'] == 'emphatic':
        parts.append('with clear emphasis, without shouting')
    if context['joinsPrevious']:
        parts.append('with smoothly connected phrasing')
    if context['continuesNext']:
        parts.append('with an open, continuing cadence')
    if acoustic:
        parts.insert(0, acoustic[len('(Speaking '):-2])
    if not parts:
        return ''
    parts.insert(0, 'with a consistent, natural speaking tone')
    return '(Speaking ' + ', '.join(parts) + ') '

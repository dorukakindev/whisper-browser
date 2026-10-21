"""Official VoxCPM2 reference-only style tags; opt-in, never spoken text edits."""

STYLES = {
    'reference': '',
    'calm': '(Speaking calmly, with a steady, thoughtful and natural tone) ',
    'warm': '(Speaking warmly, with a gentle, engaged and natural tone) ',
    'lively': '(Speaking expressively, with a lively, engaged and natural tone) ',
}


def synthesis_text(text, expression='reference'):
    if expression not in STYLES:
        raise ValueError('Invalid expression profile')
    return STYLES[expression] + text

import re


def normalize_citations(content, allowed):
    """Expand grouped references and reject any absent source number."""
    seen = set()

    def replace(match):
        values = re.split(r'[,;\s]+', match[1].strip())
        if not values or any(not value.isdecimal() for value in values):
            raise ValueError('Unsupported citation format')
        numbers = [int(value) for value in values]
        if any(number not in allowed for number in numbers):
            raise ValueError('Unknown citation')
        seen.update(numbers)
        return ' '.join(f'[{number}]' for number in dict.fromkeys(numbers))

    normalized = re.sub(r'\[([0-9][0-9,;\s-]*)\]', replace, content)
    if not seen:
        raise ValueError('No source citations')
    return normalized

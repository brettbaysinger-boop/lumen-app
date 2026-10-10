"""Account-private visual settings, never proposal evidence or instructions."""
import base64
import io
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class DocumentStyle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    company_name: str = Field(default='', max_length=120)
    contact_line: str = Field(default='', max_length=240)
    accent: str = Field(default='#243447', pattern=r'^#[0-9a-fA-F]{6}$')
    page_size: Literal['letter', 'a4'] = 'letter'
    spacing: Literal['compact', 'comfortable'] = 'compact'
    header_alignment: Literal['left', 'center'] = 'left'
    logo_png: str | None = Field(default=None, max_length=700000)

    @field_validator('company_name', 'contact_line')
    @classmethod
    def identity_only(cls, value):
        value = value.strip()
        if re.search(r'[\x00-\x1f\x7f$%€£]', value):
            raise ValueError('Use a single line of business contact details, not pricing or offers.')
        return value

    @field_validator('logo_png')
    @classmethod
    def logo(cls, value):
        if value is None:
            return None
        try:
            raw = base64.b64decode(value, validate=True)
            if len(raw) > 500000:
                raise ValueError()
            normalized = normalize_logo(raw)
            return base64.b64encode(normalized).decode('ascii')
        except Exception:
            raise ValueError('Choose a valid small PNG logo.') from None


def normalize_logo(raw):
    """Bound dimensions, decode pixels, discard metadata; never accept SVG/URLs."""
    from PIL import Image
    if not raw or len(raw) > 4 * 1024 * 1024:
        raise ValueError('Choose a logo up to 4 MB.')
    with Image.open(io.BytesIO(raw)) as image:
        if image.format not in ('PNG', 'JPEG', 'WEBP') or getattr(image, 'n_frames', 1) != 1:
            raise ValueError('Choose a still PNG, JPG or WebP logo.')
        if image.width * image.height > 4000000 or min(image.size) < 1:
            raise ValueError('Logo dimensions are too large.')
        image.load()
        image = image.convert('RGBA')
        image.thumbnail((1000, 400))
        out = io.BytesIO(); image.save(out, format='PNG')
    if len(out.getvalue()) > 500000:
        raise ValueError('Simplify the logo or choose a smaller image.')
    return out.getvalue()

from typing import Literal, Optional
from pydantic import BaseModel, Field


class Selection(BaseModel):
    selected: bool = False
    rank: Optional[int] = None
    score: Optional[float] = None
    reach: Optional[float] = None
    ambition: Optional[float] = None
    findability: Optional[float] = None
    excluded_reason: Optional[str] = None  # "out_of_scope_season" | "unfindable" | None


class TokenAssets(BaseModel):
    name: str
    symbol: str
    description: str
    mint: Optional[str] = None  # filled by sub-project 3 at launch


class Pitch(BaseModel):
    """Normalized internal representation of one pitch (one CSV row)."""
    id: str
    season: int
    episode: int
    pitch_number: int
    air_date: Optional[str] = None
    company_name: str
    founders: list[str] = Field(default_factory=list)
    industry: Optional[str] = None
    ask_amount: Optional[float] = None
    ask_equity: Optional[float] = None
    valuation_requested: Optional[float] = None
    description: Optional[str] = None
    got_deal: bool
    us_viewership: Optional[float] = None
    company_website: Optional[str] = None
    selection: Optional[Selection] = None
    include: bool = True       # "launched" — true for every product we mint
    dev_buy: bool = False      # "gets the 1.5% dev-buy" — the top-100 no-deal
    token: Optional[TokenAssets] = None
    image_url: Optional[str] = None
    image_source: str = "none"


class PitchDetail(BaseModel):
    ask_amount: Optional[float] = None
    ask_equity: Optional[float] = None
    valuation_requested: Optional[float] = None
    description: Optional[str] = None


class Outcome(BaseModel):
    got_deal: bool = False  # real on-air outcome; kept for schema stability


class Media(BaseModel):
    image_url: Optional[str] = None
    image_source: Literal["dataset", "wayback", "none", "generated"] = "none"
    former_website: Optional[str] = None
    youtube_url: Optional[str] = None


class Product(BaseModel):
    id: str
    season: int
    episode: int
    pitch_number: int
    air_date: Optional[str] = None
    company_name: str
    founders: list[str] = Field(default_factory=list)
    industry: Optional[str] = None
    pitch: PitchDetail = Field(default_factory=PitchDetail)
    got_deal: bool = False     # real on-air outcome (top-level; the website reads this)
    outcome: Outcome = Field(default_factory=Outcome)
    media: Media = Field(default_factory=Media)
    us_viewership: Optional[float] = None
    selection: Optional[Selection] = None
    include: bool = True       # "launched" — true for every product we mint
    dev_buy: bool = False      # "gets the 1.5% dev-buy" — the top-100 no-deal
    token: Optional[TokenAssets] = None


def to_product_fields(pitch: Pitch) -> dict:
    """Map a Pitch onto Product constructor kwargs (used by assemble.py)."""
    return dict(
        id=pitch.id, season=pitch.season, episode=pitch.episode,
        pitch_number=pitch.pitch_number, air_date=pitch.air_date,
        company_name=pitch.company_name,
        founders=pitch.founders, industry=pitch.industry,
        pitch=PitchDetail(
            ask_amount=pitch.ask_amount, ask_equity=pitch.ask_equity,
            valuation_requested=pitch.valuation_requested,
            description=pitch.description,
        ),
        got_deal=pitch.got_deal,
        outcome=Outcome(got_deal=pitch.got_deal),
        media=Media(
            former_website=pitch.company_website,
            image_url=pitch.image_url, image_source=pitch.image_source,
        ),
        us_viewership=pitch.us_viewership,
        selection=pitch.selection,
        include=pitch.include,
        dev_buy=pitch.dev_buy,
        token=pitch.token,
    )

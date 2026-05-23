import json
from pathlib import Path
from typing import Optional

from .models import Pitch, Product, to_product_fields


def to_product(pitch: Pitch) -> Product:
    return Product(**to_product_fields(pitch))


def write_products(
    pitches: list[Pitch], out_path: Path, schema_path: Optional[Path] = None
) -> list[Product]:
    products = [to_product(p) for p in pitches]
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps([p.model_dump() for p in products], indent=2, ensure_ascii=False)
    )
    if schema_path is not None:
        schema_path = Path(schema_path)
        schema_path.parent.mkdir(parents=True, exist_ok=True)
        schema_path.write_text(json.dumps(Product.model_json_schema(), indent=2))
    return products

"""
FutureFork Cache Engine
Caches scenario evaluations by deterministic hash of (dataset_id, change_type, change_params, seed).
"""

import hashlib
import json
from typing import Dict, Any, Optional

def compute_cache_key(dataset_id: str, change: Dict[str, Any], seed: int = 42) -> str:
    raw = json.dumps(
        {
            "dataset_id": dataset_id,
            "change_type": change.get("type"),
            "change_params": change.get("params", {}),
            "seed": seed,
        },
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

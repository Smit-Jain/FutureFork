"""
Export OpenAPI JSON Schema
"""

import json
import sys
from pathlib import Path

# Add project root to path
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root))

from backend.main import app


def export_openapi():
    openapi_schema = app.openapi()
    output_path = repo_root / "contracts" / "openapi.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(openapi_schema, f, indent=2)
    print(f"Exported OpenAPI schema to {output_path}")

if __name__ == "__main__":
    export_openapi()

"""
FutureFork Dataset Loader
Loads synthetic and uploaded datasets for Backend and Engine.
"""

import json
from pathlib import Path
from typing import Dict, Any, List

SAMPLE_DIR = Path(__file__).resolve().parent / "sample"

class DatasetLoader:
    def __init__(self, sample_dir: Path = SAMPLE_DIR):
        self.sample_dir = sample_dir
        self._cached_bundle: Dict[str, Any] = None

    def load_bundle(self) -> Dict[str, Any]:
        if self._cached_bundle is None:
            bundle_path = self.sample_dir / "dataset.json"
            if not bundle_path.exists():
                from data.make_sample import generate_sample_dataset
                self._cached_bundle = generate_sample_dataset()
            else:
                with open(bundle_path, "r", encoding="utf-8") as f:
                    self._cached_bundle = json.load(f)
        return self._cached_bundle

    def load_summary(self) -> Dict[str, Any]:
        bundle = self.load_bundle()
        return bundle["summary"]

    def load_events(self) -> List[Dict[str, Any]]:
        bundle = self.load_bundle()
        return bundle["events"]

    def load_faculty(self) -> List[Dict[str, Any]]:
        bundle = self.load_bundle()
        return bundle["faculty"]

    def load_rooms(self) -> List[Dict[str, Any]]:
        bundle = self.load_bundle()
        return bundle["rooms"]

    def load_groups(self) -> List[Dict[str, Any]]:
        bundle = self.load_bundle()
        return bundle["groups"]

    def load_students(self) -> List[Dict[str, Any]]:
        bundle = self.load_bundle()
        return bundle["students"]

    def load_baseline_timetable(self) -> List[Dict[str, Any]]:
        bundle = self.load_bundle()
        return bundle["baseline_timetable"]

# Global default loader instance
default_loader = DatasetLoader()

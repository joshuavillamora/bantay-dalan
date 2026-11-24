"""Build a portable offline demo without copying Git, raw data or dev caches."""
import argparse
import hashlib
import json
from pathlib import Path
from shutil import copy2, copytree, ignore_patterns


ROOT = Path(__file__).resolve().parents[1]


def verify(path, expected):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(data)
    if checksum.hexdigest() != expected:
        raise ValueError(f"Checksum failed for {path.name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    destination = parser.parse_args().destination.expanduser().resolve()
    if destination == ROOT or ROOT in destination.parents:
        parser.error("Choose a new folder outside the project")
    if destination.exists():
        parser.error(f"Destination already exists: {destination}")

    map_checks = (ROOT / "assets/maps/SHA256SUMS").read_text().splitlines()
    place_catalog = json.loads((ROOT / "data/places/manifest.json").read_text())
    for row in map_checks:
        checksum, name = row.split()
        verify(ROOT / "assets/maps" / name, checksum)
    for index in place_catalog["indexes"]:
        verify(ROOT / "data/places" / (index["id"] + ".json.gz"), index["sha256"])

    destination.mkdir(parents=True)
    ignore = ignore_patterns(".DS_Store", "__pycache__", "*.pbf", "node_modules", ".git", "*.log")
    for directory in ("assets", "css", "data", "js", "scripts", "tests"):
        copytree(ROOT / directory, destination / directory, ignore=ignore)
    for file in ("index.html", "README.md", "HANDOVER.md", "PRESENTATION.md", "Start CHOKEPOINT.command"):
        copy2(ROOT / file, destination / file)
    (destination / "Start CHOKEPOINT.command").chmod(0o755)
    for row in map_checks:
        checksum, name = row.split()
        verify(destination / "assets/maps" / name, checksum)
    total = sum(file.stat().st_size for file in destination.rglob("*") if file.is_file())
    print(f"{destination}\n{total:,} bytes")


if __name__ == "__main__":
    main()

"""Serve the local CHOKEPOINT package and byte ranges from PMTiles archives."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re


class MapHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.remaining = None
        requested = self.headers.get("Range")
        path = Path(self.translate_path(self.path))
        if path.suffix != ".pmtiles" or not requested or not path.is_file():
            return super().send_head()

        try:
            archive = path.open("rb")
        except OSError:
            self.send_error(404, "Map archive unavailable")
            return None
        stat = os.fstat(archive.fileno())
        size = stat.st_size
        match = re.fullmatch(r"bytes=(\d{1,16})-(\d{1,16})?", requested)
        if match:
            start = int(match[1])
            end = min(size - 1, int(match[2])) if match[2] else size - 1
        if not match or start > end:
            archive.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        archive.seek(start)
        self.remaining = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", "application/vnd.pmtiles")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self.remaining))
        self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
        self.send_header("ETag", f'"{stat.st_mtime_ns:x}-{size:x}"')
        self.end_headers()
        return archive

    def copyfile(self, source, output):
        if self.remaining is None:
            return super().copyfile(source, output)
        while self.remaining:
            data = source.read(min(self.remaining, 65536))
            if not data:
                break
            output.write(data)
            self.remaining -= len(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = partial(MapHandler, directory=str(Path(__file__).resolve().parents[1]))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Open http://127.0.0.1:{server.server_port}/?offline=1 for the offline presentation.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()

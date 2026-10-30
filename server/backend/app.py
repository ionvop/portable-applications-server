"""Flask application factory.

The same origin serves both the JSON API and the built React frontend, so the
PyWebView window can load ``http://127.0.0.1:<port>/`` and call ``/api/...``
without CORS or ``file://`` restrictions.
"""

from __future__ import annotations

from flask import Flask, jsonify, send_from_directory

from . import config, paths
from .api import catalog, distribution, files, system


def create_app() -> Flask:
    web_root = paths.web_dir()

    app = Flask(
        __name__,
        static_folder=str(web_root / "assets"),
        static_url_path="/assets",
    )
    app.config["JSON_SORT_KEYS"] = False

    app.register_blueprint(catalog.bp)
    app.register_blueprint(files.bp)
    app.register_blueprint(distribution.bp)
    app.register_blueprint(system.bp)

    @app.get("/")
    def index():
        if not (web_root / "index.html").is_file():
            return _missing_frontend()
        return send_from_directory(web_root, "index.html")

    @app.get("/<path:asset_path>")
    def spa_fallback(asset_path: str):
        """Serve real files when they exist, otherwise hand routing to the SPA."""
        if asset_path.startswith("api/"):
            return jsonify({"error": "Not found."}), 404
        candidate = web_root / asset_path
        if candidate.is_file():
            return send_from_directory(web_root, asset_path)
        if not (web_root / "index.html").is_file():
            return _missing_frontend()
        return send_from_directory(web_root, "index.html")

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Not found."}), 404

    @app.errorhandler(500)
    def server_error(_error):
        return jsonify({"error": "Internal server error."}), 500

    return app


def _missing_frontend():
    return (
        jsonify(
            {
                "error": "The frontend has not been built.",
                "hint": "Run 'npm run build' in the project root, then restart.",
                "expected": str(paths.web_dir() / "index.html"),
            }
        ),
        503,
    )

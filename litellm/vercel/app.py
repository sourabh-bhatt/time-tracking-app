"""Vercel ASGI entry point for LiteLLM Proxy."""

import os
from pathlib import Path


os.environ.setdefault(
    "CONFIG_FILE_PATH",
    str(Path(__file__).with_name("litellm_config.yaml")),
)
# Vercel Functions have a read-only application filesystem; LiteLLM rewrites its
# UI assets on startup, so keep that working copy in Vercel's writable /tmp.
os.environ.setdefault("LITELLM_UI_PATH", "/tmp/litellm-ui")

# The gateway API remains authenticated by LiteLLM keys. Disable public API
# schema/documentation endpoints on this internet-facing deployment.
os.environ.setdefault("NO_DOCS", "True")
os.environ.setdefault("NO_REDOC", "True")
os.environ.setdefault("NO_OPENAPI", "True")

from litellm.proxy import proxy_server  # noqa: E402


app = proxy_server.app

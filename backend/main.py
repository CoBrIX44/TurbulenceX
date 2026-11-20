"""Minimal ASGI test to isolate runtime environment."""

async def app(scope, receive, send):
    if scope["type"] == "http":
        body = b'{"status": "ok", "test": "minimal_asgi"}'
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", b"application/json"),
                (b"access-control-allow-origin", b"*"),
            ],
        })
        await send({"type": "http.response.body", "body": body, "more_body": False})

handler = app
__all__ = ["app", "handler"]

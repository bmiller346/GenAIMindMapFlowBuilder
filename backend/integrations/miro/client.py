class MiroClient:
    """Thin placeholder for future Miro REST API calls."""

    def __init__(self, token: str, base_url: str = "https://api.miro.com/v2"):
        self.token = token
        self.base_url = base_url

class MondayClient:
    """Thin placeholder for future monday.com GraphQL calls."""

    def __init__(self, token: str, base_url: str = "https://api.monday.com/v2"):
        self.token = token
        self.base_url = base_url

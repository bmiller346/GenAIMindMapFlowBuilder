from dataclasses import dataclass


@dataclass(slots=True)
class BearerTokenAuth:
    token: str

    def as_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

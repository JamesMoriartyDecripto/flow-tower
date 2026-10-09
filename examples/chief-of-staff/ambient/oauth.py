"""The user's Google OAuth token. Every Gmail/Calendar call acts as the user, never as a bot."""
from pathlib import Path

from google.oauth2.credentials import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]
TOKEN = Path.home() / ".config" / "chief-of-staff" / "token.json"  # written by the consent flow


def user_credentials() -> Credentials:
    # Refreshes automatically on first API call when the access token is expired.
    return Credentials.from_authorized_user_file(str(TOKEN), SCOPES)


def renew_watches(gmail, calendar, topic: str, channel_id: str, address: str) -> None:
    """Gmail watches expire after 7 days and Calendar channels at their expiration: renew daily."""
    gmail.users().watch(userId="me", body={"topicName": topic, "labelIds": ["INBOX"]}).execute()
    calendar.events().watch(calendarId="primary",
                            body={"id": channel_id, "type": "web_hook", "address": address}).execute()

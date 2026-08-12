"""Auth DTOs (docs/03「认证与会话」)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutRequest(BaseModel):
    # Required: logout's only effect is revoking the refresh token (docs/03).
    refresh_token: str = Field(min_length=1)


class AdminProfile(BaseModel):
    username: str
    display_name: str
    role: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"
    user: AdminProfile

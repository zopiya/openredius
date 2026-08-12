"""Synthetic RADIUS history CLI (docs/09). See services/history for details.

Usage:
    cd backend
    OPENRADIUS_DATABASE_URL='postgresql+asyncpg://…' \\
        uv run python scripts/generate_history.py [--days 30] [--rng-seed 7]
"""

from __future__ import annotations

import argparse
import asyncio

from openredius.core.config import get_settings
from openredius.core.db import close_db, get_session_factory, init_db
from openredius.services.history import generate_history


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--rng-seed", type=int, default=None)
    args = parser.parse_args()

    settings = get_settings()
    init_db(settings.database_url)
    try:
        if "postgresql" not in settings.database_url:
            raise SystemExit("generate_history targets PostgreSQL (radius schema) only")
        stats = await generate_history(get_session_factory(), args.days, args.rng_seed)
        print(
            f"history: {stats['postauth']} auth rows, {stats['radacct']} sessions "
            f"over {stats['days']} days"
        )
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())

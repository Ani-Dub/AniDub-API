# AniDub API

AniDub API is a Node.js/TypeScript backend for syncing and tracking anime dubs using AniList and AnimeSchedule. It provides OAuth2 login, user sync, and endpoints for fetching dub status for anime in a user's AniList planning list.

## Features
- OAuth2 login with AniList
- Syncs user's AniList planning list
- Fetches and tracks dub status for anime
- Notifies users via Discord when dubs finish (with bot integration)
- Efficient caching and rate limiting
- REST API endpoints for user and dub data

## Requirements
- Node.js 22+
- MariaDB or MySQL database
- AniList API credentials
- AnimeSchedule API token
- Discord bot token (for notifications)

## Setup
1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/AniDub-API.git
   cd AniDub-API
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your credentials:
     - AniList client ID/secret, redirect URL
     - AnimeSchedule token
     - Database connection info
     - Discord bot token/client ID

4. **Run database migrations:**
   The app will auto-sync models on startup. Ensure your database is running and accessible.

5. **Build and start the server:**
   ```sh
   npm run build
   npm start
   ```
   Or use Docker:
   ```sh
   docker build -t anidub-api .
   docker run -p 3000:3000 --env-file .env anidub-api
   ```

## API Endpoints
- `GET /oauth2/callback` — AniList OAuth2 callback
- `GET /dubs/list` — Get all dubs for the authenticated user's AniList planning list
- `GET /dubs/:id` — Get or create dub status for a specific AniList anime ID

All `/dubs/*` endpoints require an `Authorization` header with the user's AniList access token.

## Discord Bot
- The bot is started automatically with the API and handles user notifications for finished dubs.
- Users can link their AniList account via the `/link` command in Discord.
- **Important:** The Discord bot must be installed with the following settings:
  - **Context:** `user install` (not just server/guild install)
  - **Install Setting:** `applications.commands` enabled
  - This ensures the bot can DM users and register slash commands globally.

## Development
- TypeScript code is in `src/`
- Main entry: `src/index.ts`
- API routes: `src/api/`
- Database models: `src/database/`
- Business logic: `src/lib/`

## License
MIT


import { config } from "dotenv";

config();

const requiredEnvKeys = [
  "ANIMESCHEDULE_TOKEN",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "REDIRECT_URL",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
];

for (const key of requiredEnvKeys) {
  if (!process.env[key]) {
    throw new Error(`${key} is not defined in .env file`);
  }
}

// AnimeSchedule
export const ANIMESCHEDULE_TOKEN = process.env.ANIMESCHEDULE_TOKEN as string;

// Anilist
export const CLIENT_ID = process.env.CLIENT_ID as string;
export const CLIENT_SECRET = process.env.CLIENT_SECRET as string;
export const REDIRECT_URL = process.env.REDIRECT_URL as string;

// Database
export const DB_HOST = process.env.DB_HOST as string;
export const DB_PORT = parseInt(process.env.DB_PORT as string, 10);
export const DB_USER = process.env.DB_USER as string;
export const DB_PASSWORD = process.env.DB_PASSWORD as string;
export const DB_NAME = process.env.DB_NAME as string;

// Discord
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN as string;
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID as string;

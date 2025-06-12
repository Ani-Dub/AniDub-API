import express from "express";
import cors from "cors";
import axios from "axios";

import { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } from "../config";
import { User } from "../database/User";
import { syncUser } from "../lib";
import dubsRouter from "./dubs";

export const app = express();

app.use(express.json());
app.use(cors());

// === OAuth Helpers ===
const fetchAccessToken = async (code: string) => {
  return axios.post("https://anilist.co/api/v2/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URL,
    grant_type: "authorization_code",
  });
};

// === OAuth Callback Route ===
app.get("/oauth2/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) return res.status(400).send("Missing code or state");

  const discordId = state as string;
  const user = await User.findOne({ where: { discordId } });
  if (!user) return res.status(404).send("User not found");
  if (user.accessToken) return res.status(400).send("User already linked");

  try {
    const tokenRes = await fetchAccessToken(code as string);
    const { access_token, refresh_token, expires_in } = tokenRes.data;

    await user.update({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    });

    syncUser(user, access_token);

    return res.status(200).send("Successfully linked your account!");
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.status(500).send("Failed to get access token from Anilist");
  }
});

// Mount the dubs router under /dubs (or /api/dubs if you want)
app.use("/dubs", dubsRouter);

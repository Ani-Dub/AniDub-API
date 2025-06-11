import express from "express";
import cors from "cors";
import axios from "axios";
import { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } from "../config";
import { User } from "../database/User";
import { createDubByAnilistId, syncUser } from "../lib";
import { Dub } from "../database/Dub";

export const app = express();

app.use(express.json());
app.use(cors());

// Helper: Exchange code for token
const fetchAccessToken = async (code: string) => {
  return axios.post("https://anilist.co/api/v2/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URL,
    grant_type: "authorization_code",
  });
};

// Helper: Refresh token
const refreshAccessToken = async (refreshToken: string) => {
  return axios.post("https://anilist.co/api/v2/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
};

// Route: OAuth2 Callback
app.get("/oauth2/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send("Missing code or state parameter");
  }

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

    return res
      .status(200)
      .send("Successfully linked your account! You can close this window.");
  } catch (err) {
    return res.status(500).send("Failed to get access token from Anilist");
  }
});

// Route: Sync User + Return Dubs
app.post("/list", async (req, res) => {
  const { items } = req.body;
  const token = req.headers.authorization;

  if (!token) return res.status(401).send("Missing authorization token");

  const user = await User.findOne({ where: { accessToken: token } });
  if (!user || !user.accessToken || !user.expiresAt || !user.refreshToken) {
    return res.status(401).send("Invalid authorization token");
  }

  try {
    // Refresh token if expired
    if (user.expiresAt < new Date()) {
      const refreshRes = await refreshAccessToken(user.refreshToken);
      const { access_token, refresh_token, expires_in } = refreshRes.data;

      await user.update({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).send("Items parameter must be an array");
    }

    const itemList = items.map((item: string | number) =>
      parseInt(item.toString().trim(), 10)
    );

    const existingDubs = await Dub.findAll({
      where: { anilistId: itemList },
      attributes: [
        "anilistId",
        "hasDub",
        "isReleasing",
        "dubbedEpisodes",
        "totalEpisodes",
        "nextAir",
      ],
    });

    const existingIds = new Set(existingDubs.map((dub) => dub.anilistId));
    const missingIds = itemList.filter((id) => !existingIds.has(id));

    const newDubs = await Promise.all(
      missingIds.map((id) => createDubByAnilistId(id, user))
    );

    const allDubs = [...existingDubs, ...newDubs.filter(Boolean)];

    return res.status(200).json({ allDubs, token: user.accessToken });
  } catch (error) {
    console.error("Error in /list:", error);
    return res.status(500).send("Internal server error");
  }
});

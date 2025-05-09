import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } from '../config';
import { User } from '../database/User';
import { createDubByAnilistId, syncUser } from '../lib';
import { Dub } from '../database/Dub';

export const app = express();

app.use(express.json());
app.use(cors());

app.get("/oauth2/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("Missing code parameter");
  }

  if (!state) {
    return res.status(400).send("Missing state parameter");
  }

  // Check if the state parameter matches the user ID
  const discordId = state as string;

  const user = await User.findOne({ where: { discordId } });

  if (!user) {
    return res.status(404).send("User not found");
  }

  if (user.accessToken) {
    return res.status(400).send("User already linked");
  }

  const tokenResponse = await axios.post("https://anilist.co/api/v2/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URL,
    grant_type: "authorization_code",
  });

  if (tokenResponse.status !== 200) {
    return res.status(500).send("Failed to get access token from Anilist");
  }

  const { access_token, refresh_token, expires_in } = tokenResponse.data;

  // Update the user with the access token and refresh token
  await user.update(
    { accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(Date.now() + expires_in * 1000) },
  );

  syncUser(user, access_token);

  res.status(200).send("Successfully linked your account! You can close this window.");
});

app.get("/list", async (req, res) => {
  const { items } = req.query;

  if (!items) {
    return res.status(400).send("Missing items parameter");
  }

  if (typeof items !== "string") {
    return res.status(400).send("Items parameter must be a string");
  }

  const itemList = items.split(",").map((item) => parseInt(item.trim()));

  const dubs = await Dub.findAll({
    where: {
      anilistId: itemList,
    },
    attributes: ["anilistId", "hasDub", "isReleasing", "dubbedEpisodes", "totalEpisodes", "nextAir"]
  });

  const missingDubs = itemList.filter((item) => !dubs.some((dub) => dub.anilistId === item));

  const createdDubs = await Promise.all(missingDubs.map(item => createDubByAnilistId(item)));

  const allDubs = [...dubs, ...createdDubs];

  return res.status(200).json(allDubs);
});
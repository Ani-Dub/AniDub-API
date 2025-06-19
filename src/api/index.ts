import express from "express";
import cors from "cors";
import axios from "axios";

import { CLIENT_ID, CLIENT_SECRET, REDIRECT_URL } from "../config";
import { User } from "../database/User";
import { syncUser } from "../lib";
import dubsRouter from "./dubs";

export const app = express();

app.use(cors());
app.use(express.json());

app.set('trust proxy', 1);

// === Helper: Fetch Access Token from Anilist ===
const fetchAccessToken = async (code: string) => {
  return axios.post("https://anilist.co/api/v2/oauth/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URL,
    grant_type: "authorization_code",
  });
};

// === Helper: Render Success HTML Page ===
const renderSuccessPage = (nonce: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account Linked</title>
  <style>
    body { font-family: sans-serif; text-align: center; margin-top: 10vh; }
    .success { color: #2ecc40; font-size: 1.5em; margin-bottom: 1em; }
    .info { color: #555; }
    .blocked {
      color: transparent;
      background: #ccc;
      border-radius: 4px;
      user-select: none;
      font-size: 1.2em;
      letter-spacing: 0.2em;
      padding: 0.2em 0.5em;
      margin: 1em auto;
      width: fit-content;
      filter: blur(6px);
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="success">Successfully linked your account!</div>
  <div class="info">You can close this window.</div>
  <div class="blocked" id="anidub-nonce">${nonce}</div>
</body>
</html>
`;

// === OAuth Callback Handler ===
app.get("/oauth2/callback", async (req, res) => {
  const { code, state } = req.query;

  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).send("Missing or invalid code/state");
  }

  try {
    const user = await User.findOne({ where: { nonce: state } });

    if (!user) return res.status(404).send("User not found");
    if (user.accessToken) return res.status(400).send("User already linked");

    const tokenResponse = await fetchAccessToken(code);
    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    await user.update({
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    });

    syncUser(user);

    return res.status(200).send(renderSuccessPage(user.nonce));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return res.status(500).send("Failed to get access token from Anilist");
  }
});

// === Mount Routers ===
app.use("/dubs", dubsRouter);

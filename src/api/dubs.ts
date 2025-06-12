import express from "express";
import jwt from "jsonwebtoken";
import { Dub } from "../database/Dub";
import { User } from "../database/User";
import { repeatablePOSTRequest, refreshAccessToken } from "../lib/requests";
import { fetchDubStatus } from "../lib/animeschedule";
import { AnilistListResponse, Media } from "../types/anilist";
import {
  GET_MEDIA_BY_ID_QUERY,
  GET_PLANNING_LIST_QUERY,
  validateMedia,
} from "../lib";

const router = express.Router();

// Middleware: Require Bearer token
router.use(async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Missing authorization token" });

  req.token = token;

  try {
    const user = await User.findOne({ where: { accessToken: token } });

    if (!user || !user.accessToken || !user.refreshToken || !user.expiresAt) {
      return res.status(401).json({ error: "Invalid authorization token" });
    }

    if (user.expiresAt < new Date()) {
      const refreshToken = await refreshAccessToken(user.refreshToken);
      const { access_token, refresh_token, expires_in } = refreshToken.data;

      await user.update({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      });
    }

    req.user = user;
  } catch (error) {
    console.error("Error in Bearer token middleware:", error);
    return res.status(500).send("Internal server error");
  }

  next();
});

// === List Sync Route ===
router.get("/list", async (req, res) => {
  const user = req.user as User;

  if (!user || !user.accessToken) {
    return res.status(401).json({ error: "Unauthorized: Missing user or access token" });
  }

  try {
    const decoded = jwt.decode(user.accessToken) as { sub?: string };

    const userId = decoded?.sub;

    if (!userId) return res.status(400).send("Invalid access token");

    const response = await repeatablePOSTRequest<AnilistListResponse>(
      "https://graphql.anilist.co",
      { query: GET_PLANNING_LIST_QUERY(userId) },
      { headers: { Authorization: `Bearer ${user.accessToken}` } }
    );

    if (response.status !== 200) {
      res
        .status(500)
        .json({ error: "Failed to fetch planning list from Anilist" });
      return;
    }

    const entries = response.data.data.MediaListCollection.lists[0].entries;
    const anilistIds = entries.map((entry) => entry.media.id);

    const dubs = await Dub.findAll({
      where: { anilistId: anilistIds },
      attributes: [
        "anilistId",
        "hasDub",
        "isReleasing",
        "dubbedEpisodes",
        "totalEpisodes",
        "nextAir",
      ],
    });

    return res.status(200).json({ allDubs: dubs, token: user.accessToken });
  } catch (error) {
    console.error("Error in /list:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === Individual Dub Fetch ===
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) return res.status(400).json({ error: "Missing Anilist ID" });

  const anilistId = parseInt(id, 10);

  if (isNaN(anilistId)) return res.status(400).json({ error: "Invalid Anilist ID" });

  try {
    let dub = await Dub.findOne({
      where: { anilistId },
      attributes: [
        "anilistId",
        "hasDub",
        "isReleasing",
        "dubbedEpisodes",
        "totalEpisodes",
        "nextAir",
      ],
    });

    if (!dub) {
      const response = await repeatablePOSTRequest<{ data: { Media: Media } }>(
        "https://graphql.anilist.co",
        { query: GET_MEDIA_BY_ID_QUERY(anilistId) }
      );

      if (response.status !== 200) {
        return res.status(404).json({ error: "Dub not found or could not be created" });
      }

      const media = response.data.data.Media;

      if (!media) {
        return res.status(404).json({ error: "Media not found" });
      }

      if (!validateMedia(media)) {
        return res.status(400).json({ error: "Invalid media data" });
      }

      dub = await fetchDubStatus(media);

      if (!dub) {
        res
          .status(404)
          .json({ error: "Dub not found or could not be created" });
        return;
      }
    }
    res.status(200).json(dub);
  } catch (error) {
    console.error("Error in /:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

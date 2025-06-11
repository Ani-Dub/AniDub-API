import axios from "axios";
import jwt, { JwtPayload } from "jsonwebtoken";

import { Dub } from "../database/Dub";
import { UserDub } from "../database/UserDub";
import { AnilistListResponse, Media, MediaListEntry } from "../types/anilist";
import { User } from "../database/User";
import { repeatablePOSTRequest } from "./requests";
import { fetchDubStatus } from "./animeschedule";

// Prevent axios from throwing on non-2xx responses
axios.defaults.validateStatus = () => true;

// GraphQL Queries
const GET_PLANNING_LIST_QUERY = (userId: string) => `
  query {
    MediaListCollection(userId: ${userId}, type: ANIME, status: PLANNING) {
      lists {
        name
        entries {
          ...mediaListEntry
        }
      }
    }
  }

  fragment mediaListEntry on MediaList {
    id
    mediaId
    media {
      id
      title {
        english
        romaji
      }
      status(version: 2)
      episodes
    }
  }
`;

const GET_MEDIA_BY_ID_QUERY = (anilistId: number) => `
  query {
    Media(id: ${anilistId}) {
      id
      title {
        english
        romaji
      }
      status(version: 2)
      episodes
    }
  }
`;

// Syncs user's Anilist PLANNING list
export const syncUser = async (
  user: User,
  accessToken: string
): Promise<void> => {
  const { sub: userId } = jwt.decode(accessToken) as JwtPayload;

  if (!userId) {
    console.error("Failed to decode Anilist access token.");
    return;
  }

  const response = await repeatablePOSTRequest<AnilistListResponse>(
    "https://graphql.anilist.co",
    {
      query: GET_PLANNING_LIST_QUERY(userId),
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (response.status !== 200) {
    console.error(`Anilist planning list fetch failed: ${response.status}`);
    return;
  }

  const planningList = response.data?.data?.MediaListCollection?.lists?.[0];
  if (!planningList) {
    console.warn(`No planning list found for user ${user.id}`);
    return;
  }

  await addAnimesToUser(user, planningList.entries);
};

const addAnimesToUser = async (
  user: User,
  entries: MediaListEntry[]
): Promise<void> => {
  const validEntries = entries.filter(
    (entry) =>
      (entry.media.title.english || entry.media.title.romaji) &&
      entry.media.episodes
  );

  if (validEntries.length === 0) {
    console.log(`User ${user.id} has no valid entries in their planning list.`);
    return;
  }

  console.log(`Processing ${validEntries.length} anime for user ${user.id}.`);

  const existingDubs = await Dub.findAll({
    where: { anilistId: validEntries.map((e) => e.media.id) },
  });

  const existingAnilistIds = new Set(existingDubs.map((dub) => dub.anilistId));

  // Add user associations for existing dubs
  for (const dub of existingDubs) {
    await UserDub.findOrCreate({
      where: {
        userId: user.id,
        anilistId: dub.anilistId,
      },
      defaults: {
        dubId: dub.id,
        userId: user.id,
        anilistId: dub.anilistId,
      },
    });
  }

  const newEntries = validEntries.filter(
    (entry) => !existingAnilistIds.has(entry.media.id)
  );

  console.log(`Found ${newEntries.length} new dubs to fetch.`);

  for (const entry of newEntries) {
    const dub = await fetchDubStatus(entry.media);
    if (dub) {
      await UserDub.create({
        dubId: dub.id,
        userId: user.id,
        anilistId: entry.media.id,
      });
      console.log(`Added ${dub.name} (${dub.anilistId}) to user ${user.id}.`);
    }
  }
};

// Creates a Dub by Anilist ID and links it to the user
export const createDubByAnilistId = async (
  anilistId: number,
  user: User
): Promise<Dub | null> => {
  const existing = await Dub.findOne({ where: { anilistId } });
  if (existing) return existing;

  const res = await repeatablePOSTRequest<{ data: { Media: Media } }>(
    "https://graphql.anilist.co",
    {
      query: GET_MEDIA_BY_ID_QUERY(anilistId),
    },
    {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    }
  );

  if (res.status !== 200) return null;

  const media = res.data.data.Media;
  const hasValidTitle = media.title.english || media.title.romaji;

  if (!hasValidTitle || !media.episodes) return null;

  const dub = await fetchDubStatus(media);
  if (!dub) {
    throw new Error(`Failed to fetch dub for Anilist ID ${anilistId}`);
  }

  await UserDub.create({
    dubId: dub.id,
    userId: user.id,
    anilistId,
  });

  return dub;
};

import axios from "axios";
import jwt, { JwtPayload } from "jsonwebtoken";

import { Dub } from "../database/Dub";
import { Op } from "sequelize";
import { Sequel } from "../database/Sequel";
import { UserDub } from "../database/UserDub";
import { AnilistListResponse, Media, MediaListEntry } from "../types/anilist";
import { User } from "../database/User";
import { repeatablePOSTRequest } from "./requests";
import { fetchDubStatus } from "./animeschedule";

// Prevent axios from throwing on non-2xx responses
axios.defaults.validateStatus = () => true;

// GraphQL Queries
export const GET_PLANNING_LIST_QUERY = (userId: string) => `
  query {
    MediaListCollection(userId: ${userId}, type: ANIME) {
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
      coverImage {
        extraLarge
      }
      relations {
        nodes {
          id
          title {
            english
            romaji
          }
          type
        }
        edges {
          relationType
          node {
            id
          }
        }
      }
    }
  }
`;

export const GET_MEDIA_BY_ID_QUERY = (anilistId: number) => `
  query {
    Media(id: ${anilistId}) {
      id
      title {
        english
        romaji
      }
      status(version: 2)
      episodes
      coverImage {
        extraLarge
      }
      relations {
        nodes {
          id
          title {
            english
            romaji
          }
          type
        }
        edges {
          relationType
          node {
            id
          }
        }
      }
    }
  }
`;

export const validateMedia = (media: Media): boolean => {
  const hasValidTitle = media.title.english || media.title.romaji;

  if (!hasValidTitle) {
    console.warn(`Media ${media.id} has no valid title.`);
    return false;
  }

  if (!media.episodes) {
    console.warn(`Media ${media.id} has no episodes.`);
    return false;
  }

  if (media.status === "NOT_YET_RELEASED") {
    console.warn(`Media ${media.id} is not yet released.`);
    return false;
  }

  return true;
};

// Syncs user's Anilist PLANNING list
export const syncUser = async (user: User): Promise<void> => {
  const token = user.accessToken!;

  const { sub: userId } = jwt.decode(token) as JwtPayload;

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
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (response.status !== 200) {
    console.error(`Anilist planning list fetch failed: ${response.status}`);
    return;
  }

  const allLists = response.data.data.MediaListCollection.lists;
  // Filter out Dropped lists
  const filteredLists = allLists.filter(
    (list: { name: string }) => list.name !== "Dropped"
  );
  // Flatten all entries from filtered lists
  const allEntries = filteredLists.flatMap(
    (list: { entries: MediaListEntry[] }) => list.entries
  );

  await addAnimesToUser(user, allEntries);
  await removeStaleEntries(user, allEntries);
};

export const addAnimesToUser = async (
  user: User,
  entries: MediaListEntry[]
): Promise<void> => {
  // Accept all entries, but log and skip only those with no title
  const validEntries = entries.filter((entry) => {
    const hasValidTitle = entry.media.title.english || entry.media.title.romaji;
    if (!hasValidTitle) {
      console.warn(`Media ${entry.media.id} has no valid title.`);
      return false;
    }
    return true;
  });

  if (validEntries.length === 0) {
    console.log(`User ${user.id} has no valid entries in their list.`);
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

  // Accept new entries even if not released
  const newEntries = validEntries.filter(
    (entry) => !existingAnilistIds.has(entry.media.id)
  );

  console.log(`Found ${newEntries.length} new dubs to fetch.`);

  for (const entry of newEntries) {
    // Log if not fully valid
    if (!validateMedia(entry.media)) {
      console.warn(`Adding unreleased or incomplete media ${entry.media.id}`);
    }
    const dub = await fetchDubStatus(entry.media);
    if (dub) {
      // Patch Dub if totalEpisodes is null
      if (dub.totalEpisodes == null) {
        dub.totalEpisodes = entry.media.episodes || 1;
      }
      await UserDub.create({
        dubId: dub.id,
        userId: user.id,
        anilistId: entry.media.id,
      });
      console.log(`Added ${dub.name} (${dub.anilistId}) to user ${user.id}.`);
    }
  }

  // Store sequels for all valid entries (not just new)
  for (const entry of validEntries) {
    if (entry.media.relations && entry.media.relations.edges) {
      for (const edge of entry.media.relations.edges) {
        if (edge.relationType === "SEQUEL" && edge.node && edge.node.id) {
          console.log(
            `Processing sequel for media ${entry.media.id}: ${edge.node.id}`
          );
          try {
            await Sequel.findOrCreate({
              where: {
                anilistId: entry.media.id,
                sequelId: edge.node.id,
              },
              defaults: {
                anilistId: entry.media.id,
                sequelId: edge.node.id,
              },
            });
          } catch (err) {
            console.warn(
              `Failed to create sequel for media ${entry.media.id}: ${edge.node.id}`,
              err
            );
          }
        }
      }
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

export const removeStaleEntries = async (
  user: User,
  entries: MediaListEntry[]
) => {
  const userDubs = await UserDub.findAll({ where: { id: user.id } });

  const staleUserDub = userDubs.filter(
    (userDub) => !entries.find((entry) => entry.id === userDub.dubId)
  );

  console.log(`Found ${staleUserDub.length} stale dubs to remove.`);

  for (const staleDub of staleUserDub) {
    await staleDub.destroy();
  }
};

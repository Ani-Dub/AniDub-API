import axios from "axios";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Dub } from "../database/Dub";
import { UserDub } from "../database/UserDub";
import { AnimeScheduleSearchResponse, TimeTableResponse } from "../types/animeschedule";
import { AnilistListResponse, MediaListEntry, Media, AnilistMediaResponse } from "../types/anilist";
import { User } from "../database/User";
import { repeatableGETRequest, repeatablePOSTRequest } from "./requests";
import { ANIMESCHEDULE_TOKEN } from "../config";

// Prevent axios from throwing an error on non-2xx status codes
axios.defaults.validateStatus = () => true;

export const syncUser = async (user: User, accessToken: string) => {
  // decode jwt token to get user id
  const { sub } = jwt.decode(accessToken) as JwtPayload;

  if (!sub) {
    console.error("Failed to decode access token");
    return;
  }

  // Get all anime in the PLANNING list
  const response = await repeatablePOSTRequest<AnilistListResponse>("https://graphql.anilist.co", {
    query: `
query {
  MediaListCollection(userId: ${sub}, type: ANIME, status: PLANNING) {
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
    }
    status(version: 2)
    episodes
  }
}
    `,
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status !== 200) {
    console.error(`Failed to get planning list from Anilist: ${response.status}`);
    return;
  }

  const { data } = response.data;
  const planningList = data.MediaListCollection.lists[0];

  if (!planningList) {
    console.error("Failed to get planning list from Anilist (not found)");
    return;
  }

  // Add all anime in the PLANNING list to the user
  await Promise.all(planningList.entries.map((entry) => { addAnimeToUser(user, entry) }));
}

// Add anime to user
const addAnimeToUser = async (user: User, entry: MediaListEntry) => {
  const { media } = entry;

  // Check if the anime is already in the user's list
  const userDub = await UserDub.findOne({
    where: {
      userId: user.id,
      anilistId: media.id,
    },
  });

  if (userDub) return;

  // Find dub locally or create it.
  const dub = await findOrCreateDub(media);

  if (!dub) {
    console.error(`Failed to find or create dub for ${media.title.english} (${media.id})`);
    return;
  }

  await UserDub.create({
    userId: user.id,
    anilistId: media.id,
    dubId: dub.id,
  });
}

// Find dub locally or create it.
const findOrCreateDub = async (media: Media) => {
  const existingDub = await Dub.findOne({
    where: {
      anilistId: media.id,
    },
  });

  if (existingDub) return existingDub;

  return await createDub(media);
}

// Date api uses for null.
const zeroDate = "0001-01-01T00:00:00Z";

const createDub = async (media: Media) => {
  // Some anime that are don't have an airing date won't have a title.
  if (!media.title.english) {
    console.error(`No english title for ${JSON.stringify(media)}`);
    return;
  }

  // Some anime that are don't have an airing date won't have episodes.
  if (!media.episodes) {
    console.error(`No episodes for ${JSON.stringify(media)}`);
    return;
  }


  const res = await repeatableGETRequest<AnimeScheduleSearchResponse>("https://animeschedule.net/api/v3/anime", {
    params: {
      'anilist-ids': media.id,
    },
    headers: {
      Authorization: `Bearer ${ANIMESCHEDULE_TOKEN}`,
    }
  });

  if (res.status !== 200) {
    console.error(JSON.stringify(res.data));
    console.error(`Failed to get ${JSON.stringify(media)} from AnimeSchedule: ${res.status}`);
    return;
  }

  const { anime } = res.data;

  // Found multiple anime for the same anilist id
  // should never happen.
  if (anime.length !== 1) {
    console.error(JSON.stringify(res.data));
    console.error(`Found ${anime.length} anime for ${JSON.stringify(media)} in AnimeSchedule`);
    return;
  }

  const targetAnime = anime[0];

  const dubPremierValid = targetAnime.dubPremier && targetAnime.dubPremier !== zeroDate;
  const dubTimeValid = targetAnime.dubTime && targetAnime.dubTime !== zeroDate;

  // Sometimes dubPremier is not set, but dubTime is.
  // Also, sometimes dubTime is set, but when its the same as jpnTime, it means the anime is not dubbed.
  const dubExists = (dubPremierValid || dubTimeValid) && targetAnime.dubTime !== targetAnime.jpnTime;

  const baseOptions = {
    anilistId: media.id,
    name: media.title.english,
    animescheduleSlug: targetAnime.route,
    hasDub: false,
    isReleasing: false,
    dubbedEpisodes: 0,
    totalEpisodes: media.episodes,
    nextAir: null,
  }


  if (!dubExists) {
    console.log(`Dub not found for ${media.title.english}`);

    return await Dub.create({
      ...baseOptions,
    })
  }

  const dubTime = dubTimeValid ? new Date(targetAnime.dubTime) : null;

  // Assume dub has finished
  if (!dubTime) {
    console.log(`Assuming dub has finished for ${media.title.english} (no dub time)`);

    return await Dub.create({
      ...baseOptions,
      hasDub: true,
      dubbedEpisodes: targetAnime.episodes,
      isReleasing: false,
      nextAir: null,
    })
  }

  const dubEpisode = await getNextDubEpisode(targetAnime.route, dubTime);

  // Assume dub has finished
  if (dubEpisode.episode === -1 || dubEpisode.time === null) {
    console.log(`Assuming dub has finished for ${media.title.english} (no dub episode)`);

    return await Dub.create({
      ...baseOptions,
      hasDub: true,
      dubbedEpisodes: targetAnime.episodes,
      isReleasing: false,
      nextAir: null,
    })
  }

  const dubDate = new Date(dubEpisode.time);

  const thisEpisodeDubbed = dubDate.getTime() < Date.now();

  const dubbedEpisodes = thisEpisodeDubbed ? dubEpisode.episode : dubEpisode.episode - 1;

  console.log(`Dub found for ${media.title.english} (episode ${dubEpisode.episode})`);

  return await Dub.create({
    anilistId: media.id,
    name: media.title.english,
    animescheduleSlug: targetAnime.route,
    hasDub: true,
    isReleasing: true,
    dubbedEpisodes: dubbedEpisodes,
    totalEpisodes: media.episodes,
    nextAir: dubDate,
  })
}

// Get the next dub episode for a given route and dub time
const getNextDubEpisode = async (route: string, dubTime: Date) => {
  const year = dubTime.getFullYear();
  const weekNumber = getWeekNumber(dubTime);

  const res = await repeatableGETRequest<TimeTableResponse>("https://animeschedule.net/api/v3/timetables/dub", {
    params: {
      year: year.toString(),
      week: weekNumber.toString(),
    },
    headers: {
      Authorization: `Bearer ${ANIMESCHEDULE_TOKEN}`,
    }
  });

  if (res.status !== 200) {
    console.error(JSON.stringify(res.data));
    console.error(`Failed to get timetable for ${route}: ${res.status}`);
    return { episode: -1, time: null };
  }

  const targetAnime = res.data.find((anime) => {
    return anime.route === route;
  });

  if (!targetAnime) {
    console.error(`Failed to find ${route} in timetable`);
    return { episode: -1, time: null };
  }

  return {
    episode: targetAnime.episodeNumber,
    time: targetAnime.episodeDate,
  }
}

const getWeekNumber = (date: Date) => {
  const d = new Date(date.valueOf());
  const dayNum = (d.getDay() + 6) % 7;

  d.setDate(d.getDate() - dayNum + 3);

  const firstThu = new Date(d.getFullYear(), 0, 4);

  const diff = d.valueOf() - firstThu.valueOf();

  return 1 + Math.floor(diff / 604800000);
}

export const createDubByAnilistId = async (anilistId: number) => {
  const res = await repeatablePOSTRequest<AnilistMediaResponse>("https://graphql.anilist.co", {
    query: `
query {
  Media(id: ${anilistId}) {
    id
    type
    title {
      english
    }
    status(version: 2)
    episodes
  }
}
    `,
  });

  if (res.status !== 200) {
    console.error(`Failed to get anime from Anilist: ${res.status}`);
    return;
  }

  const { data } = res.data;
  const media = data.Media;

  if (!media) {
    console.error("Failed to get anime from Anilist (not found)");
    return;
  }

  return await createDub(media);
}
import { JSDOM } from "jsdom";
import { ANIMESCHEDULE_TOKEN } from "../config";
import { Dub } from "../database/Dub";
import { Media } from "../types/anilist";
import { Anime, AnimeScheduleSearchResponse } from "../types/animeschedule";
import { repeatableGETRequest } from "./requests";

// Entry point: fetches dub status for a given media
export const fetchDubStatus = async (media: Media): Promise<Dub | null> => {
  const { id: anilistId } = media;

  try {
    const response = await repeatableGETRequest<AnimeScheduleSearchResponse>(
      "https://animeschedule.net/api/v3/anime",
      {
        params: { "anilist-ids": anilistId },
        headers: {
          Authorization: `Bearer ${ANIMESCHEDULE_TOKEN}`,
        },
      }
    );

    if (response.status !== 200) {
      console.error(
        `AnimeSchedule API error (${anilistId}): ${response.status}`
      );
      return null;
    }

    return await handleAnimeScheduleResponse(response.data, media);
  } catch (error) {
    console.error(`Error fetching dub status for ${anilistId}:`, error);
    return null;
  }
};

// Handles the AnimeSchedule API response
const handleAnimeScheduleResponse = async (
  data: AnimeScheduleSearchResponse,
  media: Media
): Promise<Dub | null> => {
  let anime: Anime | undefined;
  if (data.totalAmount === 1) {
    anime = data.anime[0];
  } else if (data.totalAmount > 1) {
    const episodes = media.episodes;

    if (episodes) {
      // Find anime with matching episode count
      anime = data.anime.find((a) => a.episodes >= episodes - 1);
    }
  }

  if (!anime) {
    console.warn(`No anime found for Anilist ID ${media.id}`);
    return null;
  }

  const title = media.title.english || media.title.romaji;

  const isDubbed = anime.jpnTime !== anime.dubTime;
  const isOngoing = anime.status === "Ongoing";

  if (!isDubbed) {
    console.log(`No dub available for ${title}`);
    const totalEpisodes = anime.episodes ?? media.episodes ?? 1;
    return createOrUpdateDub(
      media.id,
      title!,
      anime.route,
      media.coverImage.extraLarge,
      false,
      false,
      0,
      totalEpisodes,
      null
    );
  }

  if (isOngoing) {
    return scrapeOngoingDub(anime, media);
  }

  // Completed dub
  const totalEpisodes = anime.episodes ?? media.episodes ?? 1;
  return createOrUpdateDub(
    media.id,
    title!,
    anime.route,
    media.coverImage.extraLarge,
    true,
    false,
    totalEpisodes,
    totalEpisodes,
    null
  );
};

// Scrapes the AnimeSchedule page for ongoing dub info
const scrapeOngoingDub = async (anime: Anime, media: Media): Promise<Dub> => {
  try {
    const res = await repeatableGETRequest<string>(
      `https://animeschedule.net/anime/${anime.route}`
    );
    const document = new JSDOM(res.data).window.document;
    const dubSection = document.querySelector("h3.release-time-type-dub");

    const title = media.title.english || media.title.romaji;

    if (!dubSection) {
      console.error(`No dub section found for ${anime.route}`);
      const totalEpisodes = anime.episodes ?? media.episodes ?? 1;
      return createOrUpdateDub(
        media.id,
        title!,
        anime.route,
        media.coverImage.extraLarge,
        false,
        false,
        0,
        totalEpisodes,
        null
      );
    }

    const episodeStr = dubSection.children[0]?.textContent?.split(" ")[1];
    const episode = episodeStr ? parseInt(episodeStr, 10) : 0;

    if (!episode)
      console.error(`Could not parse episode number for ${anime.route}`);

    const nextAir =
      dubSection.parentElement?.children[1]?.getAttribute("datetime");

    return createOrUpdateDub(
      media.id,
      title!,
      anime.route,
      media.coverImage.extraLarge,
      true,
      Boolean(nextAir),
      episode,
      anime.episodes,
      nextAir ? new Date(nextAir) : null
    );
  } catch (error) {
    console.error(`Error scraping dub info for ${anime.route}:`, error);

    return createOrUpdateDub(
      media.id,
      media.title.english || media.title.romaji!,
      anime.route,
      media.coverImage.extraLarge,
      false,
      false,
      0,
      anime.episodes,
      null
    );
  }
};

// Factory function for creating or updating Dub entries
const createOrUpdateDub = async (
  anilistId: number,
  name: string,
  slug: string,
  coverImage: string,
  hasDub: boolean,
  isReleasing: boolean,
  dubbedEpisodes: number,
  totalEpisodes: number,
  nextAir: Date | null
): Promise<Dub> => {
  // Always set totalEpisodes to a valid number
  const safeTotalEpisodes =
    typeof totalEpisodes === "number" && totalEpisodes > 0 ? totalEpisodes : 1;
  const [dub, created] = await Dub.findOrCreate({
    where: { anilistId },
    defaults: {
      anilistId,
      name,
      coverImage,
      animescheduleSlug: slug,
      hasDub,
      isReleasing,
      dubbedEpisodes,
      totalEpisodes: safeTotalEpisodes,
      nextAir,
    },
  });

  if (!created) {
    await dub.update({
      name,
      animescheduleSlug: slug,
      coverImage,
      hasDub,
      isReleasing,
      dubbedEpisodes,
      totalEpisodes: safeTotalEpisodes,
      nextAir,
    });
  }
  return dub;
};

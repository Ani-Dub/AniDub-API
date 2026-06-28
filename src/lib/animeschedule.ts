import { JSDOM } from "jsdom";
import { ANIMESCHEDULE_TOKEN } from "../config";
import { Dub } from "../database/Dub";
import { Media } from "../types/anilist";
import { Anime, AnimeScheduleSearchResponse } from "../types/animeschedule";
import { repeatableGETRequest } from "./requests";
import { createLogger } from "./logger";

const logger = createLogger("animeschedule");

// Entry point: fetches dub status for a given media
export const fetchDubStatus = async (media: Media): Promise<Dub | null> => {
  const { id: anilistId } = media;

  logger.info("Fetching dub status", {
    anilistId,
    title: media.title?.english || media.title?.romaji || "unknown",
  });

  try {
    const requestConfig = {
      params: { "anilist-ids": anilistId },
      headers: {
        Authorization: `Bearer ${ANIMESCHEDULE_TOKEN}`,
      },
    };

    logger.info("Sending AnimeSchedule request", {
      url: "https://animeschedule.net/api/v3/anime",
      anilistId,
      params: requestConfig.params,
      hasToken: Boolean(ANIMESCHEDULE_TOKEN),
    });

    const response = await repeatableGETRequest<AnimeScheduleSearchResponse>(
      "https://animeschedule.net/api/v3/anime",
      requestConfig
    );

    if (response.status !== 200) {
      logger.error("AnimeSchedule API error", {
        anilistId,
        status: response.status,
      });
      return null;
    }

    logger.info("AnimeSchedule response summary", {
      anilistId,
      status: response.status,
      totalAmount: response.data.totalAmount,
      candidates: response.data.anime.slice(0, 5).map((entry) => ({
        title: entry.title,
        route: entry.route,
        episodes: entry.episodes,
        status: entry.status,
        jpnTime: entry.jpnTime,
        dubTime: entry.dubTime,
      })),
    });

    logger.debug("AnimeSchedule response payload", {
      anilistId,
      payload: response.data,
    });

    return await handleAnimeScheduleResponse(response.data, media);
  } catch (error) {
    logger.error("Error fetching dub status", { anilistId }, error);
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
    logger.warn("No anime found in AnimeSchedule response", {
      anilistId: media.id,
      totalAmount: data.totalAmount,
      episodes: media.episodes,
    });
    return null;
  }

  const title = media.title.english || media.title.romaji;

  const isDubbed = anime.jpnTime !== anime.dubTime;
  const isOngoing = anime.status === "Ongoing";
  const isFinished = anime.status === "Finished";

  logger.info("AnimeSchedule match selected", {
    anilistId: media.id,
    title,
    route: anime.route,
    status: anime.status,
    isFinished,
    expectedEpisodes: media.episodes ?? 1,
    detectedEpisodes: anime.episodes ?? null,
    jpnTime: anime.jpnTime,
    dubTime: anime.dubTime,
    isDubbed,
    isOngoing,
  });

  if (!isDubbed) {
    logger.info("No dub available", { anilistId: media.id, title });
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

  // If the dub is ongoing or AnimeSchedule reports a dub time but the series isn't marked finished,
  // scrape the anime page for more precise info (next air, isReleasing, current dubbed episode).
  if (isOngoing || (isDubbed && !isFinished)) {
    return scrapeOngoingDub(anime, media);
  }

  if (isFinished) {
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
  }

  // Fallback: no dub or unknown state
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
};

// Scrapes the AnimeSchedule page for ongoing dub info
const scrapeOngoingDub = async (anime: Anime, media: Media): Promise<Dub> => {
  try {
    const res = await repeatableGETRequest<string>(
      `https://animeschedule.net/anime/${anime.route}`
    );
    const document = new JSDOM(res.data).window.document;
    // Try multiple selectors to find the dub release section
    let dubSection = document.querySelector("h3.release-time-type-dub") as Element | null;
    if (!dubSection) dubSection = document.querySelector(".release-time-type-dub");
    if (!dubSection) {
      // Fallback: search headings/spans for text mentioning 'dub'
      dubSection = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,span,div")).find((el) => /dub/i.test(el.textContent || "")) || null;
    }

    const title = media.title.english || media.title.romaji;

    if (!dubSection) {
      logger.warn("No dub section found while scraping ongoing dub", {
        route: anime.route,
        anilistId: media.id,
      });
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

    const dubSectionText = dubSection.textContent?.trim() || "";

    // Heuristic parsing for current dubbed episode:
    // Prefer phrases like 'conclud... Episode X' or 'Episode X on DATE' for the last aired episode.
    let episode = 0;
    const concludedMatch = dubSectionText.match(/conclud(?:e|ed)[\s\S]{0,40}?episode\s*(\d+)/i);
    if (concludedMatch) {
      episode = parseInt(concludedMatch[1], 10);
    } else {
      const airedMatch = dubSectionText.match(/episode\s*(\d+)\s*(?:on|at)/i) || dubSectionText.match(/ep\.?\s*(\d+)\s*(?:on|at)/i);
      if (airedMatch) episode = parseInt(airedMatch[1], 10);
      else {
        const anyMatch = dubSectionText.match(/episode\s*(\d+)/i) || dubSectionText.match(/ep\.?\s*(\d+)/i);
        if (anyMatch) episode = parseInt(anyMatch[1], 10);
      }
    }

    if (!episode) {
      logger.warn("Could not parse episode number from dub section", {
        route: anime.route,
        anilistId: media.id,
        dubSectionText,
      });
    }

    // Find nearest element with a datetime attribute for next air — search within parent, then ancestors
    let nextAir: string | null = null;
    const searchForDatetime = (el: Element | null | undefined) => el ? (el.querySelector('[datetime]') as Element | null) : null;
    nextAir = searchForDatetime(dubSection.parentElement)?.getAttribute('datetime') || null;
    if (!nextAir) nextAir = searchForDatetime(dubSection.parentElement?.parentElement)?.getAttribute('datetime') || null;
    if (!nextAir) nextAir = (document.querySelector('[datetime]') as Element | null)?.getAttribute('datetime') || null;

    logger.info("Parsed ongoing dub schedule", {
      anilistId: media.id,
      title,
      route: anime.route,
      dubSectionText,
      detectedEpisode: episode,
      expectedTotalEpisodes: anime.episodes ?? media.episodes ?? 1,
      nextAir: nextAir ?? null,
      isReleasing: Boolean(nextAir),
    });

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
    logger.error("Error scraping dub info", { route: anime.route, anilistId: media.id }, error);

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
    logger.debug("Updating existing dub record", {
      anilistId,
      name,
      hasDub,
      isReleasing,
      dubbedEpisodes,
      totalEpisodes: safeTotalEpisodes,
    });
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

  logger.info("Persisted dub status", {
    anilistId,
    name,
    hasDub,
    isReleasing,
    dubbedEpisodes,
    totalEpisodes: safeTotalEpisodes,
    nextAir: nextAir ? nextAir.toISOString() : null,
  });

  return dub;
};

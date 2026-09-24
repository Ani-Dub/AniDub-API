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
    // A missing dub time can be a temporary upstream data change.
    const existing = await Dub.findOne({ where: { anilistId: media.id } });
    if (existing?.isReleasing) {
      logger.warn("Keeping airing dub after dub time disappeared", {
        anilistId: media.id,
        title,
      });
      return existing;
    }

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

  // AnimeSchedule's status describes the anime as a whole. The sub can be
  // finished while the dub still has episodes scheduled.
  return scrapeDubSchedule(anime, media);
};

// Scrapes the AnimeSchedule page for dub release info
const scrapeDubSchedule = async (anime: Anime, media: Media): Promise<Dub> => {
  const title = media.title.english || media.title.romaji!;
  const existing = await Dub.findOne({ where: { anilistId: media.id } });
  const totalEpisodes = anime.episodes ?? media.episodes ?? existing?.totalEpisodes ?? 1;

  const keepDubStatus = async (reason: string): Promise<Dub> => {
    logger.warn("Dub completion could not be confirmed", {
      anilistId: media.id,
      route: anime.route,
      reason,
      previousIsReleasing: existing?.isReleasing ?? null,
      previousDubbedEpisodes: existing?.dubbedEpisodes ?? null,
      totalEpisodes,
    });

    if (existing) return existing;

    // A historical finished dub has no active release section and no
    // in-progress state to preserve or notify about.
    if (anime.status === "Finished") {
      return createOrUpdateDub(
        media.id, title, anime.route, media.coverImage.extraLarge,
        true, false, totalEpisodes, totalEpisodes, null
      );
    }

    const hasStarted = anime.status !== "Upcoming";
    return createOrUpdateDub(
      media.id, title, anime.route, media.coverImage.extraLarge,
      hasStarted, hasStarted, 0, totalEpisodes, null
    );
  };

  const finalEpisodeAired = () =>
    anime.status === "Finished" &&
    existing !== null &&
    existing.isReleasing &&
    existing.dubbedEpisodes >= totalEpisodes &&
    existing.nextAir !== null &&
    new Date(existing.nextAir).getTime() <= Date.now();

  const completeDub = () => createOrUpdateDub(
    media.id, title, anime.route, media.coverImage.extraLarge,
    true, false, totalEpisodes, totalEpisodes, null
  );

  try {
    const res = await repeatableGETRequest<string>(
      `https://animeschedule.net/anime/${anime.route}`
    );
    if (res.status !== 200) return keepDubStatus(`page returned ${res.status}`);

    const document = new JSDOM(res.data).window.document;
    let dubSection = document.querySelector("h3.release-time-type-dub") as Element | null;
    if (!dubSection) dubSection = document.querySelector(".release-time-type-dub");
    if (!dubSection) {
      dubSection = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5"))
        .find((el) => /dub/i.test(el.textContent || "")) || null;
    }

    if (!dubSection) {
      logger.warn("No dub section found while scraping dub", {
        route: anime.route,
        anilistId: media.id,
      });
      return finalEpisodeAired()
        ? completeDub()
        : keepDubStatus("no dub release section");
    }

    const dubSectionText = dubSection.textContent?.trim() || "";

    // The heading names the next scheduled episode, or the last episode
    // when it explicitly says that the dub has concluded.
    let episode = 0;
    const concludedMatch = dubSectionText.match(/conclud(?:e|ed)[\s\S]{0,40}?episode\s*(\d+)/i);
    if (concludedMatch) {
      episode = parseInt(concludedMatch[1], 10);
    } else {
      const airedMatch = dubSectionText.match(/episode\s*(\d+)\s*(?:on|at)/i) ||
        dubSectionText.match(/ep\.?\s*(\d+)\s*(?:on|at)/i);
      if (airedMatch) episode = parseInt(airedMatch[1], 10);
      else {
        const anyMatch = dubSectionText.match(/episode\s*(\d+)/i) ||
          dubSectionText.match(/ep\.?\s*(\d+)/i);
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

    // A page-wide datetime can belong to the raw or sub schedule.
    const searchForDatetime = (el: Element | null | undefined) =>
      el ? (el.querySelector("[datetime]") as Element | null) : null;
    const nextAir = searchForDatetime(dubSection.parentElement)?.getAttribute("datetime") ||
      searchForDatetime(dubSection.parentElement?.parentElement)?.getAttribute("datetime") ||
      null;
    const nextAirDate = nextAir ? new Date(nextAir) : null;

    if (!nextAirDate || Number.isNaN(nextAirDate.getTime()) ||
        nextAirDate.getTime() <= Date.now()) {
      if ((concludedMatch && episode >= totalEpisodes) || finalEpisodeAired()) {
        return completeDub();
      }
      return keepDubStatus("no upcoming dub episode confirmed");
    }

    logger.info("Parsed ongoing dub schedule", {
      anilistId: media.id,
      title,
      route: anime.route,
      dubSectionText,
      detectedEpisode: episode,
      expectedTotalEpisodes: totalEpisodes,
      nextAir,
      isReleasing: true,
    });

    return createOrUpdateDub(
      media.id,
      title,
      anime.route,
      media.coverImage.extraLarge,
      true,
      true,
      Math.max(existing?.dubbedEpisodes ?? 0, episode),
      totalEpisodes,
      nextAirDate
    );
  } catch (error) {
    logger.error("Error scraping dub info", { route: anime.route, anilistId: media.id }, error);
    return keepDubStatus("page request or parsing failed");
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

import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Anime, AnimeScheduleSearchResponse } from './response';
import { Dub } from './database';
import { config } from 'dotenv';

config();

const TOKEN = process.env.TOKEN;

interface Status {
  status: string;
  nextAir: Date | null;
  episodes: number | null;
  totalEpisodes: number | null;
  refreshAt: Date | null;
}

export const check = async (
  name: string,
  id: number
): Promise<[Status, number]> => {
  const existingDub = await Dub.findOne({
    where: {
      anilistId: id,
    },
  });

  name = name.replace(/’/g, "'").trim();

  // If not in db, fetch from animeschedule
  if (!existingDub) {
    const dubStatus = await fetchDub(name, id);
    const cache = dubStatus.status === 'error' ? 3600 : 86400;

    return [dubStatus, cache];
  }

  // 1 day cache
  const validCache = Date.now() - existingDub.updated.getTime() < 86_400_000;
  const cacheTime =
    (new Date(existingDub.updated.getTime() + 86_400_000).getTime() -
      Date.now()) /
    1000;

  // Anime is not releasing currently
  if (!existingDub.isReleasing) {
    // If anime is finished and has dub
    if (existingDub.hasDub) {
      return [
        {
          status: 'finished',
          nextAir: null,
          episodes: existingDub.dubbedEpisodes,
          totalEpisodes: existingDub.totalEpisodes,
          refreshAt: null,
        },
        31536000,
      ];
    }

    // No dub exists
    if (validCache) {
      return [
        {
          status: 'no dub',
          nextAir: null,
          episodes: existingDub.dubbedEpisodes,
          totalEpisodes: existingDub.totalEpisodes,
          refreshAt: new Date(cacheTime * 1000 + Date.now()),
        },
        cacheTime,
      ];
    }

    // Check if dub exists
    return [await updateDub(existingDub), 86400];
  }

  // Anime is releasing
  if (validCache) {
    const nextAir = existingDub.nextAir?.getTime() || 0;
    const newCacheTime = nextAir ? (nextAir - Date.now()) / 1000 : cacheTime;

    return [
      {
        status: 'releasing',
        nextAir: existingDub.nextAir,
        episodes: existingDub.dubbedEpisodes,
        totalEpisodes: existingDub.totalEpisodes,
        refreshAt: new Date(newCacheTime * 1000 + Date.now()),
      },
      newCacheTime,
    ];
  }

  // Anime is releasing but cache is invalid
  return [await updateDub(existingDub), 86400];
};

const getDubDetails = async (slug: string) => {
  const { data } = await axios.get<string>(
    `https://animeschedule.net/anime/${slug}`
  );

  const dom = new JSDOM(data);

  const isFinished = dom.window.document.querySelector(
    'section#air-types-section'
  );

  if (isFinished) {
    if (isFinished.children.length === 2) {
      const dubbedEpisodesStr = dom.window.document.querySelector(
        'div[itemprop="numberOfEpisodes"]'
      )?.textContent;

      if (!dubbedEpisodesStr) throw new Error('Dubbed episodes not found');

      const dubbedEpisodes = Number(dubbedEpisodesStr) - 1;

      return {
        hasDub: true,
        isReleasing: false,
        dubbedEpisodes,
        nextAir: null,
      };
    }

    return {
      hasDub: isFinished.children.length === 2,
      isReleasing: false,
      dubbedEpisodes: 0,
      nextAir: null,
    };
  }

  const releaseWrapper = dom.window.document.querySelector(
    'section#release-times-section'
  );

  // No dub or subs have been released
  if (!releaseWrapper) {
    return {
      hasDub: false,
      isReleasing: false,
      dubbedEpisodes: 0,
      nextAir: null,
    };
  }

  const nextTime = releaseWrapper?.querySelector('time#release-time-dub');
  const nextEpisode = releaseWrapper?.querySelector('h3.release-time-type-dub');

  if (nextTime && nextEpisode) {
    const dubbedEpisodesStr =
      nextEpisode.children[0].textContent?.split(' ')[1];
    if (!dubbedEpisodesStr) throw new Error('Dubbed episodes not found');

    const dubbedEpisodes = Number(dubbedEpisodesStr) - 1;

    const nextAir = nextTime.getAttribute('datetime');

    if (!nextAir) throw new Error('Next air date not found');

    return {
      hasDub: true,
      isReleasing: true,
      dubbedEpisodes,
      nextAir: new Date(nextAir),
    };
  }

  return {
    hasDub: false,
    isReleasing: true,
    dubbedEpisodes: 0,
    nextAir: null,
  };
};

const updateDub = async (dub: Dub): Promise<Status> => {
  try {
    const { hasDub, isReleasing, dubbedEpisodes, nextAir } =
      await getDubDetails(dub.animescheduleSlug);

    await Dub.update(
      {
        hasDub,
        isReleasing,
        dubbedEpisodes,
        nextAir,
        updated: new Date(),
      },
      {
        where: {
          anilistId: dub.anilistId,
        },
      }
    );

    return await getDubStatus(dub);
  } catch (e) {
    console.error(e);
    return {
      status: 'error',
      nextAir: null,
      episodes: null,
      totalEpisodes: null,
      refreshAt: null,
    };
  }
};

const fetchDub = async (name: string, id: number): Promise<Status> => {
  try {
    const { data, status, request } =
      await axios.get<AnimeScheduleSearchResponse>(
        'https://animeschedule.net/api/v3/anime',
        {
          params: {
            'anilist-ids': id,
          },
          headers: {
            Authorization: `Bearer ${TOKEN}`,
          },
          validateStatus: () => true,
        }
      );

    if (status === 500) {
      return {
        status: 'error',
        nextAir: null,
        episodes: null,
        totalEpisodes: null,
        refreshAt: null,
      };
    }

    const anime = data.anime[0];

    if (!anime) {
      console.error('Anime not found', name, id);
      return {
        status: 'not found',
        nextAir: null,
        episodes: null,
        totalEpisodes: null,
        refreshAt: null,
      };
    }

    const { hasDub, isReleasing, dubbedEpisodes, nextAir } =
      await getDubDetails(anime.route);

    const dub = await Dub.create({
      anilistId: id,
      name,
      animescheduleSlug: anime.route,
      hasDub,
      isReleasing,
      dubbedEpisodes,
      totalEpisodes: anime.episodes,
      nextAir,
      updated: new Date(),
    });

    return await getDubStatus(dub);
  } catch (e) {
    console.error(name, id, e);
    return {
      status: 'error',
      nextAir: null,
      episodes: null,
      totalEpisodes: null,
      refreshAt: null,
    };
  }
};

const findAnimeByName = (name: string, animes: Anime[]) => {
  const lowerName = name.toLowerCase();

  return (
    animes.find(
      (a) =>
        a.title.toLowerCase() === lowerName ||
        a.names?.english?.toLowerCase() === lowerName
      // || a.names?.synonyms?.some((s) => s.toLowerCase() === lowerName)
    ) ?? null
  );
};

const getDubStatus = async (dub: Dub): Promise<Status> => {
  if (dub.isReleasing) {
    return {
      status: 'releasing',
      nextAir: dub.nextAir,
      episodes: dub.dubbedEpisodes,
      totalEpisodes: dub.totalEpisodes,
      refreshAt: null,
    };
  }

  if (dub.hasDub) {
    return {
      status: 'finished',
      nextAir: null,
      episodes: dub.dubbedEpisodes,
      totalEpisodes: dub.totalEpisodes,
      refreshAt: null,
    };
  }

  return {
    status: 'no dub',
    nextAir: null,
    episodes: null,
    totalEpisodes: dub.totalEpisodes,
    refreshAt: null,
  };
};

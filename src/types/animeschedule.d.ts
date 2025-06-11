export interface AnimeScheduleSearchResponse {
  page: number;
  totalAmount: number;
  anime: Anime[];
}

export interface Anime {
  id: string;
  title: string;
  route: string;
  premier: string;
  subPremier: string;
  dubPremier: string;
  month: string;
  year: number;
  season: Season;
  delayedFrom: string;
  delayedUntil: string;
  subDelayedFrom: string;
  subDelayedUntil: string;
  dubDelayedFrom: string;
  dubDelayedUntil: string;
  jpnTime: string;
  subTime: string;
  dubTime: string;
  description: string;
  genres: Genre[];
  studios: Studio[];
  sources: Source[];
  mediaTypes: MediaType[];
  episodes: number;
  lengthMin: number;
  status: string;
  imageVersionRoute: string;
  stats: Stats;
  names: Names;
  relations: Relations;
  websites: Websites;
}

export interface Season {
  title: string;
  year: string;
  season: string;
  route: string;
}

export interface Genre {
  name: string;
  route: string;
}

export interface Studio {
  name: string;
  route: string;
}

export interface Source {
  name: string;
  route: string;
}

export interface MediaType {
  name: string;
  route: string;
}

export interface Stats {
  averageScore: number;
  ratingCount: number;
  trackedCount: number;
  trackedRating: number;
  colorLightMode: string;
  colorDarkMode: string;
}

export interface Names {
  romaji: string;
  english: string;
  native: string;
  synonyms: string[];
}

export interface Relations {
  sequels: string[];
  parents: string[];
}

export interface Websites {
  official: string;
  mal: string;
  aniList: string;
  kitsu: string;
  animePlanet: string;
  anidb: string;
  crunchyroll: string;
  youtube: string;
}

export type TimeTableResponse = TimeTableResponseItem[];

export interface TimeTableResponseItem {
  title: string;
  route: string;
  romaji: string;
  english: string;
  native: string;
  delayedFrom: string;
  delayedUntil: string;
  status: "Ongoing" | "Finished" | "Delayed" | "Upcoming";
  episodeDate: string;
  episodeNumber: number;
  subtractedEpisodeNumber: number;
  episodes: number;
  lengthMin: number;
  donghua: boolean;
  airType: "sub" | "dub" | "raw";
  mediaTypes: [];
  imageVersionRoute: string;
  streams: {};
  airingStatus: "airing" | "aired" | "unaired" | "delayed-air";
}

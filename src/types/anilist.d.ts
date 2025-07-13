export type MediaListCollections =
  | "CURRENT"
  | "COMPLETED"
  | "PLANNING"
  | "DROPPED"
  | "PAUSED"
  | "REPEATING";

export type MediaType = "ANIME" | "MANGA";
export type MediaStatus =
  | "FINISHED"
  | "RELEASING"
  | "NOT_YET_RELEASED"
  | "CANCELLED"
  | "HIATUS";

export type Media = {
  id: number;
  type: MediaType;
  title: {
    english: string | null;
    romaji: string | null;
  };
  coverImage: {
    extraLarge: string;
  };
  status: MediaStatus;
  episodes: number | null;
  relations?: {
    nodes: {
      id: number;
      title: {
        english: string | null;
        romaji: string | null;
      };
      type: string;
    }[];
    edges: {
      relationType: string;
      node: {
        id: number;
      };
    }[];
  };
};

export interface MediaListEntry {
  id: number;
  mediaId: number;
  status: MediaStatus;
  progress: number;
  media: Media;
}

export interface AnilistListResponse {
  data: {
    MediaListCollection: {
      lists: {
        name: MediaListCollections;
        entries: MediaListEntry[];
      }[];
    };
  };
}

export interface AnilistMediaResponse {
  data: {
    Media: Media;
  };
}

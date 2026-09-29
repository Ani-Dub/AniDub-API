const assert = require("node:assert/strict");
const { test } = require("node:test");

for (const key of [
  "ANIMESCHEDULE_TOKEN", "CLIENT_ID", "CLIENT_SECRET", "DB_HOST",
  "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME", "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID", "REDIRECT_URL",
]) {
  process.env[key] = key === "DB_PORT" ? "3306" : "test";
}
process.env.LOG_LEVEL = "error";

const { Dub } = require("../dist/database/Dub");
const requests = require("../dist/lib/requests");
const { fetchDubStatus } = require("../dist/lib/animeschedule");

async function fetchSchedule(previous, episode, nextAir, status = "Finished") {
  let record = {
    ...previous,
    update: async function (values) {
      Object.assign(this, values);
      return this;
    },
  };
  const html = episode === null
    ? "<html><body>No dub section</body></html>"
    : '<div><h3 class="release-time-type-text release-time-type-dub"><span>Episode ' +
      episode + '</span> Dub: </h3><time id="release-time-dub" datetime="' +
      nextAir.toISOString() + '"></time></div>';

  Dub.findOne = async () => record;
  Dub.findOrCreate = async () => [record, false];
  requests.repeatableGETRequest = async (url) => url.endsWith("/api/v3/anime")
    ? {
        status: 200,
        data: {
          totalAmount: 1,
          anime: [{
            route: "youjo-senki-ii",
            episodes: 12,
            status,
            jpnTime: "2026-06-06T12:30:00Z",
            dubTime: "2026-09-09T13:30:00Z",
          }],
        },
      }
    : { status: 200, data: html };

  return fetchDubStatus({
    id: 135865,
    type: "ANIME",
    title: { english: "Saga of Tanya the Evil Season 2" },
    coverImage: { extraLarge: "https://example.com/cover.jpg" },
    status: "RELEASING",
    episodes: 12,
  });
}

const previous = (dubbedEpisodes, nextAir, isReleasing = true) => ({
  hasDub: true,
  isReleasing,
  dubbedEpisodes,
  totalEpisodes: 12,
  nextAir,
});

test("Tanya recovers from a stale 12/12 when episode 4 is upcoming", async () => {
  const nextAir = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const result = await fetchSchedule(previous(12, null, false), 4, nextAir);
  assert.equal(result.isReleasing, true);
  assert.equal(result.dubbedEpisodes, 3);
  assert.equal(result.totalEpisodes, 12);
  assert.equal(result.nextAir.toISOString(), nextAir.toISOString());
});

test("an upcoming first dub episode means zero released", async () => {
  const nextAir = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const result = await fetchSchedule(previous(0, null), 1, nextAir, "Ongoing");
  assert.equal(result.dubbedEpisodes, 0);
  assert.equal(result.isReleasing, true);
});

test("an upcoming final dub episode means eleven of twelve released", async () => {
  const nextAir = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const result = await fetchSchedule(previous(10, null), 12, nextAir);
  assert.equal(result.dubbedEpisodes, 11);
  assert.equal(result.isReleasing, true);
});

test("a passed final-episode air date can complete the dub", async () => {
  const lastAir = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const result = await fetchSchedule(previous(11, lastAir), null, null);
  assert.equal(result.dubbedEpisodes, 12);
  assert.equal(result.isReleasing, false);
});

test("a stale full count alone cannot confirm completion", async () => {
  const lastAir = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const result = await fetchSchedule(previous(12, lastAir), null, null);
  assert.equal(result.dubbedEpisodes, 12);
  assert.equal(result.isReleasing, true);
});


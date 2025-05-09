import { app } from "./api";
import AniDubBot from "./bot";
import { sequelize } from "./database";

sequelize.authenticate().then(async () => {
  console.log("Database connection has been established successfully.");

  await sequelize.sync();

  console.log("Database synced successfully.");

  app.listen(3000, () => {
    console.log("API is running on port 3000");

    new AniDubBot();
  });
});
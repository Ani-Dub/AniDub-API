import { app } from "./api";
import AniDubBot from "./bot";
import { sequelize } from "./database";

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection has been established successfully.");

    await sequelize.sync();
    console.log("Database synced successfully.");

    app.listen(3000, () => {
      console.log("API is running on port 3000");
      new AniDubBot();
    });
  } catch (error) {
    console.error("Failed to start AniDub API", error);
    process.exit(1);
  }
};

start();

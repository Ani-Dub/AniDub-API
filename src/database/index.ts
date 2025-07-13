import { Sequelize } from "sequelize";
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from "../config";
import { User } from "./User";
import { Dub } from "./Dub";
import { UserDub } from "./UserDub";
import { Sequel } from "./Sequel";

export const sequelize = new Sequelize({
  dialect: "mariadb",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  logging: false,
});

User.initModel(sequelize);
Dub.initModel(sequelize);
UserDub.initMode(sequelize);
Sequel.initModel(sequelize);

User.hasMany(UserDub);
UserDub.belongsTo(User);

Dub.hasMany(UserDub);
UserDub.belongsTo(Dub);

Dub.belongsToMany(User, { through: UserDub });

Sequel.belongsTo(Dub, { foreignKey: "anilistId", targetKey: "anilistId" });
Dub.hasMany(Sequel, { foreignKey: "anilistId", sourceKey: "anilistId" });

import {
  Association,
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  Sequelize,
} from "sequelize";
import { UserDub } from "./UserDub";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare discordId: string;
  declare nonce: string;
  declare accessToken: string | null;
  declare refreshToken: string | null;
  declare expiresAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare UserDubs?: NonAttribute<UserDub[]>;

  declare static associations: {
    UserDub: Association<User, UserDub>;
  };

  static initModel(sequelize: Sequelize) {
    User.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
        },
        discordId: {
          type: DataTypes.BIGINT,
          unique: true,
          allowNull: false,
        },
        nonce: {
          type: DataTypes.STRING(36),
          allowNull: false,
          unique: true,
        },
        accessToken: {
          type: DataTypes.TEXT("medium"),
          allowNull: true,
        },
        refreshToken: {
          type: DataTypes.TEXT("medium"),
          allowNull: true,
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      { underscored: true, sequelize }
    );
  }
}

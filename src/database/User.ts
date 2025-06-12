import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare discordId: string;
  declare accessToken: string | null;
  declare refreshToken: string | null;
  declare expiresAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

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

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class UserDub extends Model<
  InferAttributes<UserDub>,
  InferCreationAttributes<UserDub>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare dubId: number;
  declare anilistId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initMode(sequelize: Sequelize) {
    UserDub.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
        },
        userId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        dubId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        anilistId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
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

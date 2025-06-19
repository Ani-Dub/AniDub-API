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

export class Dub extends Model<
  InferAttributes<Dub>,
  InferCreationAttributes<Dub>
> {
  declare id: CreationOptional<number>;
  declare anilistId: number;
  declare name: string;
  declare animescheduleSlug: string;
  declare coverImage: string;
  declare hasDub: boolean;
  declare isReleasing: boolean;
  declare dubbedEpisodes: number;
  declare totalEpisodes: number;
  declare nextAir: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare UserDubs?: NonAttribute<UserDub[]>;

  declare static associations: {
    UserDub: Association<Dub, UserDub>;
  };

  static initModel(sequelize: Sequelize) {
    Dub.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
        },
        anilistId: {
          type: DataTypes.INTEGER.UNSIGNED,
          unique: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        animescheduleSlug: {
          type: DataTypes.TEXT,
          unique: true,
          allowNull: false,
        },
        coverImage: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        hasDub: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
        },
        isReleasing: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
        },
        dubbedEpisodes: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        totalEpisodes: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        nextAir: {
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

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
import { Dub } from "./Dub";

export class Sequel extends Model<
  InferAttributes<Sequel>,
  InferCreationAttributes<Sequel>
> {
  declare id: CreationOptional<number>;
  declare anilistId: number;
  declare sequelId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare Dub?: NonAttribute<Dub>;
  declare sequel?: NonAttribute<Dub>;

  static associations: {
    Dub: Association<Sequel, Dub>;
    sequel: Association<Sequel, Dub>;
  };

  static initModel(sequelize: Sequelize) {
    Sequel.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true,
        },
        anilistId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
        },
        sequelId: {
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
      {
        underscored: true,
        sequelize,
      }
    );
  }
}

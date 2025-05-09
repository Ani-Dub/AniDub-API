import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from "sequelize";

export class Dub extends Model<
  InferAttributes<Dub>,
  InferCreationAttributes<Dub>
> {
  declare id: CreationOptional<number>;
  declare anilistId: number;
  declare name: string;
  declare animescheduleSlug: string;
  declare hasDub: boolean;
  declare isReleasing: boolean;
  declare dubbedEpisodes: number;
  declare totalEpisodes: number;
  declare nextAir: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize) {
    Dub.init({
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
        type: DataTypes.TEXT('medium'),
        allowNull: false,
      },
      animescheduleSlug: {
        type: DataTypes.TEXT('medium'),
        unique: true,
        allowNull: false,
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
    }, { underscored: true, sequelize });
  }
}
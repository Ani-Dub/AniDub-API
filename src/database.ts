import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Optional,
  Sequelize,
} from 'sequelize';

const host = process.env.DB_HOST;
const username = process.env.DB_USERNAME;
const password = process.env.DB_PASSWORD;

export const sequelize = new Sequelize({
  database: 'anidub',
  dialect: 'mariadb',
  host,
  username,
  password,
  logging: false,
});

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
  declare updated: Date;
}

Dub.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    anilistId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    animescheduleSlug: {
      type: DataTypes.STRING,
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
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    totalEpisodes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nextAir: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updated: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    underscored: true,
    timestamps: false,
  }
);

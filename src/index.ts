import express from 'express';
import cors from 'cors';
import { check } from './lib';
import { sequelize } from './database';

const app = express();

app.use(cors());

app.get('/check', async (req, res, next) => {
  const { query } = req;

  if (!query.id) {
    return res.status(400).send('id is required');
  }

  if (!query.name) {
    return res.status(400).send('name is required');
  }

  const id = query.id as string;
  const name = query.name as string;

  const [status, maxage] = await check(name, Number(id));

  res.set('Cache-Control', `max-age=${maxage}`);
  res.json(status);
});

sequelize.validate().then(() => {
  console.log('Database connection has been established successfully.');

  app.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
});

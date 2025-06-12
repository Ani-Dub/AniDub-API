import * as express from "express";

import { User } from "../database/User";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      token?: string;
    }
  }
}

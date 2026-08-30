import { RequestHandler } from 'express';
import { ZodTypeAny } from 'zod';

export const validateBody = (schema: ZodTypeAny): RequestHandler => (req, res, next) => {
  req.body = schema.parse(req.body);
  next();
};

import * as blob from '@vercel/blob';
import { createVercelHandler } from '../backend/handler.mjs';

export const config = { api: { bodyParser: false } };
export default createVercelHandler({ blob }).node;

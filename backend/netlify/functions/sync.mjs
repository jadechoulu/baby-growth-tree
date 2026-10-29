import { getStore } from '@netlify/blobs';
import { createNetlifyHandler } from '../backend/netlify-handler.mjs';

export default createNetlifyHandler({ getStore });
export const config = { path: ['/auth/*', '/api/*'] };

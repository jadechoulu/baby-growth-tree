import { getStore } from '@netlify/blobs';
import { cleanupNetlifyAuth } from '../backend/netlify-auth.mjs';

export default async function cleanup() {
  await cleanupNetlifyAuth({ store: getStore({ name: 'xiaoya-auth-v1', consistency: 'strong' }) });
}
export const config = { schedule: '@daily' };

/**
 * Post stdin to #mkan — how a lane that runs detached from the Hermes gateway
 * (scripts/crm/hermes/detached.sh) reports its own failure, now that Hermes no
 * longer holds its stdout.
 *
 *   echo "⚠️ TikTok sweep failed …" | pnpm -s crm:post-mkan
 */
import { postToMkan } from './notify';

let text = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (text += chunk));
process.stdin.on('end', () => {
  const body = text.trim().slice(0, 3_500);
  if (!body) return;
  void postToMkan(body).then((ok) => {
    if (!ok) process.exitCode = 1;
  });
});

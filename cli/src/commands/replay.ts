import chalk from 'chalk';
import { apiRequest, failWith, requireAuth } from '../config/http.js';

export async function replayCommand(eventId: string): Promise<void> {
  const config = requireAuth();
  try {
    const replay = await apiRequest<{ id: string }>(`/events/${eventId}/replay`, { method: 'POST', config });
    console.log(chalk.green(`\n  Replayed ${eventId} as ${replay.id}.\n`));
  } catch (err) {
    failWith(err, 'replay event');
  }
}

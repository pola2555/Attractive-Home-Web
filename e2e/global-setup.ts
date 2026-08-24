import { createE2EUsers, disconnect } from './fixtures';

export default async function globalSetup(): Promise<void> {
  await createE2EUsers();
  await disconnect();
}

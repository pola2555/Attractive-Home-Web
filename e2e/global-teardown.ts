import { destroyE2EUsers, disconnect } from './fixtures';

// Leaves the dev database exactly as it was found: the throwaway staff accounts
// and everything they created are removed.
export default async function globalTeardown(): Promise<void> {
  await destroyE2EUsers();
  await disconnect();
}

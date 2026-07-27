import { customerHandlers } from '@/lib/customer-auth';

// Customer Auth.js endpoints (isolated from the staff /api/auth instance).
export const { GET, POST } = customerHandlers;

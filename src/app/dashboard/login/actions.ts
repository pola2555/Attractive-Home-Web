'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/dashboard',
    });
    return { error: null }; // unreachable — signIn redirects on success
  } catch (error) {
    if (error instanceof AuthError) return { error: 'Invalid email or password.' };
    throw error; // let the success redirect propagate
  }
}

import 'next-auth';
import 'next-auth/jwt';

// The JWT carries sub + security_stamp (docs/DATABASE.md §4): privileged
// requests compare the stamp against the DB and reject on mismatch — instant
// revocation despite stateless sessions.
declare module 'next-auth' {
  interface User {
    securityStamp?: string;
  }
  interface Session {
    user: {
      id: string;
      securityStamp?: string;
      email?: string | null;
      name?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    securityStamp?: string;
  }
}

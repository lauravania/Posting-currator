import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      organizationName: string;
      role: string;
      name?: string | null;
      email?: string | null;
    };
  }

  interface User {
    id: string;
    organizationId: string;
    organizationName: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    organizationId: string;
    organizationName: string;
    role: string;
  }
}

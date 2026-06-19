// Handler das rotas do NextAuth (/api/auth/*). Roda em Node porque o provider
// Credentials usa Prisma + bcrypt.
import { handlers } from "@/auth";

export const runtime = "nodejs";

export const { GET, POST } = handlers;

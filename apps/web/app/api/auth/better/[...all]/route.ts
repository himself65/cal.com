import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@calcom/features/auth/lib/better-auth";

export const { GET, POST } = toNextJsHandler(auth);

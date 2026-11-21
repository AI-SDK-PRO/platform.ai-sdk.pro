"use client";
import { createAuthClient } from "@neon/auth/next";

// All browser authentication uses the same-origin managed Neon proxy.
export const authClient = createAuthClient();

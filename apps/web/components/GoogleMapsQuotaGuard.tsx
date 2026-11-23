"use client";

import { useEffect, useState } from "react";

export type GmpWindow = Window & {
  gm_authFailure?: () => void;
  __gmpQuotaGuardInstalled?: boolean;
};

export function isMapsQuotaErrorMessage(args: unknown[]): boolean {
  const msg = args.map((a) => String(a)).join(" ");
  return msg.includes("OverQuotaMapError") || msg.includes("QuotaExceededError");
}

export function installGlobalMapsQuotaTap(
  targetWindow: GmpWindow | undefined =
    typeof window !== "undefined" ? (window as GmpWindow) : undefined
) {
  if (!targetWindow || targetWindow.__gmpQuotaGuardInstalled) return;
  targetWindow.__gmpQuotaGuardInstalled = true;

  const previousAuthFailure = targetWindow.gm_authFailure;
  targetWindow.gm_authFailure = () => {
    targetWindow.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
    if (typeof previousAuthFailure === "function") {
      previousAuthFailure();
    }
  };

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    if (isMapsQuotaErrorMessage(args)) {
      targetWindow.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
    }
  };
}

installGlobalMapsQuotaTap();

export default function GoogleMapsQuotaGuard() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    installGlobalMapsQuotaTap();
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", onQuotaExceeded);
    return () => {
      window.removeEventListener("gmp-quota-exceeded", onQuotaExceeded);
    };
  }, []);

  if (!quotaExceeded) return null;

  return (
    <div
      className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
      role="status"
    >
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{" "}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{" "}
        for instructions to update your account.
      </span>
    </div>
  );
}

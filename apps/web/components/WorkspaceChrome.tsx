"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen, BookUser, Globe, HardDrive, KeyRound, Library, LoaderCircle,
  LogOut, MessageSquare, Rocket, UserRound, LayoutTemplate,
} from "lucide-react";
import SiteHeader from "./SiteHeader";
import type { PlatformSession } from "../lib/platform-types";
import "./workspace-single-nav.css";

function displayName(user: PlatformSession["user"]): string {
  return user?.name?.trim() || user?.email?.trim() || "Signed-in account";
}

function initials(user: PlatformSession["user"]): string {
  return displayName(user)
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const links = [
  { href: "/workspace", label: "Repositories", icon: Library },
  { href: "/workspace/deploy", label: "Deployments", icon: Rocket },
  { href: "/workspace/regions", label: "Regions", icon: Globe },
  { href: "/workspace/storage", label: "Storage", icon: HardDrive },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/docs/getting-started", label: "Docs", icon: BookOpen },
  { href: "/workspace/about", label: "เกี่ยวกับฉัน", icon: BookUser },
  { href: "/workspace/account", label: "Account", icon: UserRound },
  { href: "/workspace/tokens", label: "API tokens", icon: KeyRound },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/workspace") {
    return pathname === "/workspace" || pathname.startsWith("/workspace/repositories/");
  }
  if (href === "/docs/getting-started") return pathname === "/docs" || pathname.startsWith("/docs/");
  return pathname === href || pathname.startsWith(href + "/");
}

export default function WorkspaceChrome({
  children, user, onLogout, logoutPending,
}: {
  children: ReactNode;
  user: PlatformSession["user"];
  onLogout: () => void;
  logoutPending: boolean;
}) {
  const pathname = usePathname();
  const headerActive = pathname.startsWith("/workspace/deploy") ? "deploy" : "workspace";

  return (
    <>
      <SiteHeader active={headerActive} />
      <main className="workspace-shell workspace-shell--single-nav">
        <div className="workspace-unified-bar">
          <nav className="workspace-unified-links" aria-label="Workspace navigation">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={"workspace-unified-link" + (isActive(pathname, href) ? " active" : "")}
                aria-current={isActive(pathname, href) ? "page" : undefined}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="workspace-unified-account">
            {user ? (
              <>
                <Link href="/workspace/account" className="workspace-avatar" title={displayName(user)}
                  aria-label="Account settings">
                  {initials(user)}
                </Link>
                <button type="button" className="workspace-icon-button"
                  onClick={onLogout} disabled={logoutPending} aria-label="Sign out" title="Sign out">
                  {logoutPending ? <LoaderCircle className="workspace-spin" size={17} /> : <LogOut size={17} />}
                </button>
              </>
            ) : <Link href="/login" className="workspace-sign-in-link">Sign in</Link>}
          </div>
        </div>
        <section className="workspace-main">
          <div className="workspace-content">{children}</div>
        </section>
      </main>
    </>
  );
}

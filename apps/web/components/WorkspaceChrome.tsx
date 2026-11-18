"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowUpRight, BookUser, ChevronRight, Database, KeyRound, Library,
  HardDrive, LoaderCircle, LogOut, Rocket, ShieldCheck, UserRound,
} from "lucide-react";
import SiteHeader from "./SiteHeader";
import type { PlatformSession } from "../lib/platform-types";

function displayName(user: PlatformSession["user"]): string {
  return user?.name?.trim() || user?.email?.trim() || "Signed-in account";
}

function initials(user: PlatformSession["user"]): string {
  const value = displayName(user);
  return value
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function sectionLabel(pathname: string): string {
  if (pathname.startsWith("/workspace/about")) return "เกี่ยวกับฉัน";
  if (pathname.startsWith("/workspace/account")) return "Account & GitHub";
  if (pathname.startsWith("/workspace/storage")) return "Storage";
  if (pathname.startsWith("/workspace/deploy")) return "Deployments";
  if (pathname.startsWith("/workspace/tokens")) return "API tokens";
  if (pathname.startsWith("/workspace/repositories/")) return "Repository snapshot";
  return "Repositories";
}

export default function WorkspaceChrome({
  children,
  user,
  onLogout,
  logoutPending,
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
      <main className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar-top">
            <span className="workspace-product-label">UNIFIED WORKSPACE</span>
          </div>
          <nav className="workspace-nav" aria-label="Workspace navigation">
            <Link href="/workspace" className={pathname === "/workspace" ? "workspace-nav-item active" : "workspace-nav-item"}>
              <Library size={16} />
              <span>Repositories</span>
            </Link>
            <Link href="/workspace/deploy" className={pathname.startsWith("/workspace/deploy") ? "workspace-nav-item active" : "workspace-nav-item"}>
              <Rocket size={16} />
              <span>Deployments</span>
            </Link>
            <Link href="/workspace/storage" className={pathname.startsWith("/workspace/storage") ? "workspace-nav-item active" : "workspace-nav-item"}>
              <HardDrive size={16} />
              <span>Storage</span>
            </Link>
            <Link href="/workspace/about" className={pathname.startsWith("/workspace/about") ? "workspace-nav-item active" : "workspace-nav-item"}>
              <BookUser size={16} />
              <span>เกี่ยวกับฉัน</span>
            </Link>
            <Link href="/workspace/account" className={pathname.startsWith("/workspace/account") ? "workspace-nav-item active" : "workspace-nav-item"}>
              <UserRound size={16} />
              <span>Account &amp; GitHub</span>
            </Link>
            <Link href="/workspace/tokens" className={pathname.startsWith("/workspace/tokens") ? "workspace-nav-item active" : "workspace-nav-item"}>
              <KeyRound size={16} />
              <span>API tokens</span>
            </Link>
            <Link href="/docs/architecture" className="workspace-nav-item">
              <Database size={16} />
              <span>How snapshots work</span>
              <ArrowUpRight className="workspace-nav-external" size={12} />
            </Link>
          </nav>
          <div className="workspace-sidebar-note">
            <ShieldCheck size={15} />
            <p>
              แพลตฟอร์มเดียวที่ <strong>platform.ai-sdk.pro</strong> — import snapshot,
              จัดการ deploy และโปรไฟล์ส่วนตัวในบัญชีเดียวกัน
            </p>
          </div>
          <div className="workspace-sidebar-footer">
            <span className="workspace-sidebar-kicker">AI-SDK.PRO</span>
            <span>Single-origin platform workspace</span>
          </div>
        </aside>

        <section className="workspace-main">
          <header className="workspace-topbar">
            <div className="workspace-topbar-left">
              <div className="workspace-breadcrumb">
                <Link href="/">ai-sdk.pro</Link>
                <ChevronRight size={14} />
                <Link href="/workspace">Workspace</Link>
                <ChevronRight size={14} />
                <span>{sectionLabel(pathname)}</span>
              </div>
              <nav className="workspace-context-links" aria-label="Platform sections">
                <Link href="/workspace" aria-current={pathname.startsWith("/workspace") ? "page" : undefined}>Workspace</Link>
                <Link href="/chat">Chat</Link>
                <Link href="/templates">Templates</Link>
                <Link href="/docs/getting-started">Docs</Link>
              </nav>
            </div>
            <div className="workspace-account">
              {user ? (
                <>
                  <span className="workspace-account-copy">
                    <strong>{displayName(user)}</strong>
                    <span>Platform session</span>
                  </span>
                  <span className="workspace-avatar" aria-hidden="true">
                    {initials(user)}
                  </span>
                  <button
                    type="button"
                    className="workspace-icon-button"
                    onClick={onLogout}
                    disabled={logoutPending}
                    aria-label="Sign out"
                    title="Sign out"
                  >
                    {logoutPending ? (
                      <LoaderCircle className="workspace-spin" size={15} />
                    ) : (
                      <LogOut size={15} />
                    )}
                  </button>
                </>
              ) : (
                <Link href="/login" className="workspace-sign-in-link">
                  Sign in
                </Link>
              )}
            </div>
          </header>
          <div className="workspace-content">{children}</div>
        </section>
      </main>
    </>
  );
}

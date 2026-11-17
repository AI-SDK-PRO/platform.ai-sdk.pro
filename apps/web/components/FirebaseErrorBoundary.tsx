"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { GeistCard, StatusBadge } from "@aisdkpro/ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class FirebaseErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    let parsedMessage = error.message;
    try {
      const info = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (info && typeof info.error === "string") {
        parsedMessage = `${info.error} (${info.operationType ?? "operation"} ${info.path ?? ""})`.trim();
      }
    } catch {
      // Keep raw error message
    }
    return { hasError: true, message: parsedMessage };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FirebaseErrorBoundary caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <GeistCard className="workspace-account-card" role="alert">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2>Firebase connection or permission error</h2>
            <StatusBadge status="error">Error</StatusBadge>
          </div>
          <p className="workspace-account-help">{this.state.message || "Unexpected Firebase error."}</p>
          <button
            type="button"
            className="workspace-button workspace-button-secondary"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Dismiss &amp; retry
          </button>
        </GeistCard>
      );
    }
    return this.props.children;
  }
}

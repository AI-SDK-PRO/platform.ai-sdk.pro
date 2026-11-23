import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import DeploymentRegionsMap from "./DeploymentRegionsMap";
import GoogleMapsQuotaGuard, {
  installGlobalMapsQuotaTap,
  isMapsQuotaErrorMessage,
  type GmpWindow,
} from "./GoogleMapsQuotaGuard";

vi.mock("@vis.gl/react-google-maps", () => ({
  APILoadingStatus: {
    NOT_LOADED: "NOT_LOADED",
    LOADING: "LOADING",
    LOADED: "LOADED",
    FAILED: "FAILED",
    AUTH_FAILURE: "AUTH_FAILURE",
  },
  ColorScheme: { DARK: "DARK", LIGHT: "LIGHT", FOLLOW_SYSTEM: "FOLLOW_SYSTEM" },
  APIProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="gmp-api-provider">{children}</div>
  ),
  Map: ({
    children,
    mapId,
    internalUsageAttributionIds,
  }: {
    children?: React.ReactNode;
    mapId?: string;
    internalUsageAttributionIds?: string[];
  }) => (
    <div
      data-testid="gmp-map"
      data-map-id={mapId}
      data-attribution={internalUsageAttributionIds?.join(",")}
    >
      {children}
    </div>
  ),
  AdvancedMarker: ({
    children,
    title,
  }: {
    children?: React.ReactNode;
    title?: string;
  }) => (
    <div data-testid="gmp-marker" data-title={title}>
      {children}
    </div>
  ),
  Pin: () => <span data-testid="gmp-pin" />,
  InfoWindow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="gmp-infowindow">{children}</div>
  ),
  useAdvancedMarkerRef: () => [vi.fn(), null] as const,
  useApiLoadingStatus: () => "LOADED",
  useMap: () => null,
}));

const originalConsoleError = console.error;

beforeAll(() => {
  Object.assign(globalThis, { React });
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("DeploymentRegionsMap & GoogleMapsQuotaGuard", () => {
  it("renders a graceful fallback when no Maps API key is configured", () => {
    const html = renderToStaticMarkup(<DeploymentRegionsMap apiKey="" />);
    expect(html).toContain("Google Maps API Key Required");
    expect(html).toContain("Singapore (asia-southeast1)");
  });

  it("renders the map with DEMO_MAP_ID and gmp_mcp_codeassist_v1_aistudio attribution when key is provided", () => {
    const html = renderToStaticMarkup(
      <DeploymentRegionsMap apiKey="test-public-maps-key" />
    );
    expect(html).toContain('data-testid="gmp-map"');
    expect(html).toContain('data-map-id="DEMO_MAP_ID"');
    expect(html).toContain('data-attribution="gmp_mcp_codeassist_v1_aistudio"');
    expect(html.match(/data-testid="gmp-marker"/g)).toHaveLength(4);
  });

  it("does not render the quota banner initially and dispatches gmp-quota-exceeded on auth or quota errors", () => {
    const initialHtml = renderToStaticMarkup(<GoogleMapsQuotaGuard />);
    expect(initialHtml).toBe("");

    expect(isMapsQuotaErrorMessage(["OverQuotaMapError"])).toBe(true);
    expect(isMapsQuotaErrorMessage(["QuotaExceededError: 100 req/day"])).toBe(true);
    expect(isMapsQuotaErrorMessage(["Normal empty search result"])).toBe(false);

    const dispatched: string[] = [];
    const fakeWindow = {
      dispatchEvent: (event: Event) => {
        dispatched.push(event.type);
        return true;
      },
    } as unknown as GmpWindow;

    console.error = vi.fn();
    installGlobalMapsQuotaTap(fakeWindow);
    fakeWindow.gm_authFailure?.();
    console.error("Google Maps JavaScript API error: OverQuotaMapError");

    expect(dispatched).toEqual(["gmp-quota-exceeded", "gmp-quota-exceeded"]);
  });
});

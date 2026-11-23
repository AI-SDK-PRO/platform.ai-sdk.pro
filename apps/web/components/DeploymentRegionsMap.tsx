"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  ColorScheme,
  InfoWindow,
  Map,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from "@vis.gl/react-google-maps";
import { Globe, MapPin, Server } from "lucide-react";

export type PlatformRegion = {
  id: string;
  label: string;
  provider: string;
  role: string;
  position: { lat: number; lng: number };
  accent: string;
};

export const PLATFORM_REGIONS: PlatformRegion[] = [
  {
    id: "asia-southeast1",
    label: "Singapore (asia-southeast1)",
    provider: "Google Cloud / APAC Edge",
    role: "Primary APAC low-latency workspace & regional services",
    position: { lat: 1.3521, lng: 103.8198 },
    accent: "#f04452",
  },
  {
    id: "us-east-2",
    label: "Ohio (us-east-2)",
    provider: "Neon PostgreSQL & Object Storage",
    role: "Platform accounts, repository snapshots & deployment intake",
    position: { lat: 40.0992, lng: -82.8016 },
    accent: "#4acb89",
  },
  {
    id: "fsn1",
    label: "Falkenstein (fsn1)",
    provider: "Self-Hosted VPS (Docker + Caddy)",
    role: "Standalone Next.js runtime & TLS reverse proxy node",
    position: { lat: 50.4779, lng: 12.3713 },
    accent: "#009dfa",
  },
  {
    id: "iad1",
    label: "Washington, D.C. (iad1)",
    provider: "Vercel & Global Edge Network",
    role: "Production web routing & multi-service deployment edge",
    position: { lat: 39.0438, lng: -77.4874 },
    accent: "#efb657",
  },
];

const DEFAULT_CENTER = { lat: 24.0, lng: 20.0 };
const DEFAULT_ZOOM = 2;

function RegionMarker({
  region,
  selected,
  onSelect,
  onClose,
}: {
  region: PlatformRegion;
  selected: boolean;
  onSelect: (region: PlatformRegion) => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={region.position}
        title={region.label}
        clickable
        onClick={() => onSelect(region)}
      >
        <Pin
          background={region.accent}
          borderColor="#101010"
          glyphColor="#ffffff"
          scale={selected ? 1.25 : 1}
        />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onClose}>
          <div className="p-1 text-neutral-900">
            <strong className="block text-sm font-semibold">{region.label}</strong>
            <span className="block text-xs font-medium text-neutral-600 mt-0.5">
              {region.provider}
            </span>
            <p className="text-xs text-neutral-700 mt-1.5 mb-0 leading-relaxed">
              {region.role}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapViewportController({
  activeRegion,
}: {
  activeRegion: PlatformRegion | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !activeRegion) return;
    map.panTo(activeRegion.position);
    map.setZoom(5);
  }, [map, activeRegion]);

  return null;
}

function MapStatusOverlay() {
  const status = useApiLoadingStatus();

  if (
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-6 text-center">
        <div className="max-w-md rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--fg)]">
          <p className="font-semibold text-[var(--status-error)]">
            Unable to load Google Maps
          </p>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            Check that your API key enables Maps JavaScript API and allows this
            origin.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default function DeploymentRegionsMap({
  apiKey,
}: {
  apiKey: string;
}) {
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(
    PLATFORM_REGIONS[0].id
  );

  const selectedRegion =
    PLATFORM_REGIONS.find((region) => region.id === selectedRegionId) ?? null;

  const handleSelectRegion = useCallback((region: PlatformRegion) => {
    setSelectedRegionId(region.id);
  }, []);

  const handleCloseInfo = useCallback(() => {
    setSelectedRegionId(null);
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORM_REGIONS.map((region) => {
          const isSelected = region.id === selectedRegionId;
          return (
            <button
              key={region.id}
              type="button"
              onClick={() => handleSelectRegion(region)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-[var(--accent)] bg-[var(--soft)]"
                  : "border-[var(--border)] bg-[var(--panel)] hover:border-[var(--subtle)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--subtle)]">
                  <Server size={13} />
                  {region.id}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: region.accent }}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--fg)]">
                {region.label}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {region.provider}
              </div>
            </button>
          );
        })}
      </div>

      {!apiKey ? (
        <div className="flex h-[460px] w-full flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6 text-center">
          <MapPin size={28} className="text-[var(--accent)]" />
          <h2 className="mt-3 text-base font-semibold text-[var(--fg)]">
            Google Maps API Key Required
          </h2>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[var(--muted)]">
            Configure <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> or{" "}
            <code>GOOGLE_MAPS_API_KEY</code> in your server environment to render
            the interactive deployment regions map.
          </p>
        </div>
      ) : (
        <div className="relative h-[460px] w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
          <APIProvider
            apiKey={apiKey}
            libraries={["marker"]}
            language="en"
            region="US"
          >
            <Map
              mapId="DEMO_MAP_ID"
              colorScheme={ColorScheme.DARK}
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={DEFAULT_ZOOM}
              gestureHandling="greedy"
              internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
              style={{ width: "100%", height: "460px" }}
            >
              {PLATFORM_REGIONS.map((region) => (
                <RegionMarker
                  key={region.id}
                  region={region}
                  selected={region.id === selectedRegionId}
                  onSelect={handleSelectRegion}
                  onClose={handleCloseInfo}
                />
              ))}
              <MapViewportController activeRegion={selectedRegion} />
            </Map>
            <MapStatusOverlay />
          </APIProvider>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Globe size={14} className="text-[var(--accent)]" />
          Click any infrastructure node or marker pin to inspect deployment region details.
        </span>
        {selectedRegion && (
          <span>
            Active focus: <code className="text-[var(--fg)]">{selectedRegion.id}</code> (
            {selectedRegion.position.lat.toFixed(2)}, {selectedRegion.position.lng.toFixed(2)})
          </span>
        )}
      </div>
    </div>
  );
}

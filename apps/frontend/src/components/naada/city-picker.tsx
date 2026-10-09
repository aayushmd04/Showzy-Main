import { useEffect, useState } from "react";

import { getCities, type ApiCity } from "@/lib/api";
import { NEARBY_EVENT, getNearbyCity, setNearbyCity } from "@/lib/nearby";
import { useStore } from "@/store/app-store";
import { CityDropdown } from "@/components/naada/city-dropdown";

/**
 * The city dropdown used in every header. The choice is shared app-wide through
 * `lib/nearby`, so the hero button, the header and the feed stay in step.
 */
export function CityPicker({ compact, onPhoto, plain }: { compact?: boolean; onPhoto?: boolean; plain?: boolean }) {
  const { lang } = useStore();
  const [city, setCity] = useState(() => getNearbyCity() ?? "all");
  const [cities, setCities] = useState<ApiCity[]>([]);

  useEffect(() => {
    getCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  useEffect(() => {
    const onNearby = (e: Event) => setCity((e as CustomEvent<string>).detail || "all");
    window.addEventListener(NEARBY_EVENT, onNearby);
    return () => window.removeEventListener(NEARBY_EVENT, onNearby);
  }, []);

  if (cities.length === 0) return null;

  const label = (v: string) => {
    if (v === "all") return lang === "kn" ? "ಎಲ್ಲಾ ನಗರಗಳು" : "All cities";
    const match = cities.find((c) => c.name === v);
    return lang === "kn" ? match?.name_kn || v : v;
  };

  return (
    <CityDropdown
      value={city}
      options={["all", ...cities.map((c) => c.name)]}
      label={label}
      onChange={setNearbyCity}
      ariaLabel={lang === "kn" ? "ನಗರ" : "City"}
      compact={compact}
      plain={plain}
      colors={
        onPhoto
          ? { paper: "#ffffff", signal: "#E8704F", border: "rgba(255,255,255,.35)", surface: "rgba(24, 19, 16, 0.86)" }
          : { paper: "var(--color-paper)", signal: "var(--color-signal)", border: "var(--field-border)", surface: "var(--menu-bg)" }
      }
    />
  );
}

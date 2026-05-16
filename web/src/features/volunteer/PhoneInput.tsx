import { useEffect, useMemo, useState } from "react";

// Curated subset of countries common at French ultra-trail events. Order in the
// dropdown is preserved.
const COUNTRIES: Array<{ code: string; dial: string; label: string }> = [
  { code: "FR", dial: "+33", label: "France (+33)" },
  { code: "BE", dial: "+32", label: "Belgique (+32)" },
  { code: "CH", dial: "+41", label: "Suisse (+41)" },
  { code: "DE", dial: "+49", label: "Allemagne (+49)" },
  { code: "IT", dial: "+39", label: "Italie (+39)" },
  { code: "ES", dial: "+34", label: "Espagne (+34)" },
  { code: "GB", dial: "+44", label: "Royaume-Uni (+44)" },
  { code: "US", dial: "+1", label: "USA (+1)" },
];

export interface PhoneInputProps {
  value: string;
  onChange: (v: string) => void;
  defaultCountry?: string;
  required?: boolean;
  id?: string;
}

export function PhoneInput({ value, onChange, defaultCountry = "FR", required, id }: PhoneInputProps) {
  const [country, setCountry] = useState<string>(() => detectCountry(value, defaultCountry));
  const [local, setLocal] = useState<string>(() => stripDial(value));

  useEffect(() => {
    setCountry(detectCountry(value, defaultCountry));
    setLocal(stripDial(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const dial = useMemo(() => COUNTRIES.find((c) => c.code === country)?.dial ?? "+33", [country]);

  function emit(nextLocal: string, nextCountry: string) {
    const d = COUNTRIES.find((c) => c.code === nextCountry)?.dial ?? "+33";
    const cleaned = nextLocal.replace(/[^\d]/g, "");
    if (!cleaned) {
      onChange("");
      return;
    }
    onChange(d + cleaned.replace(/^0+/, ""));
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className="input w-40"
        value={country}
        onChange={(e) => {
          setCountry(e.target.value);
          emit(local, e.target.value);
        }}
        aria-label="Pays"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        id={id}
        className="input flex-1"
        type="tel"
        inputMode="tel"
        required={required}
        placeholder={dial + " 6 12 34 56 78"}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          emit(e.target.value, country);
        }}
      />
    </div>
  );
}

function detectCountry(value: string, fallback: string): string {
  if (!value) return fallback;
  for (const c of COUNTRIES) {
    if (value.startsWith(c.dial)) return c.code;
  }
  return fallback;
}

function stripDial(value: string): string {
  if (!value) return "";
  for (const c of COUNTRIES) {
    if (value.startsWith(c.dial)) return value.slice(c.dial.length);
  }
  return value;
}

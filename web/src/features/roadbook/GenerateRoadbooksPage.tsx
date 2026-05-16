import { useState } from "react";

import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";

import { generateRoadbooks } from "./api";
import type { GenerateResponse } from "./types";

export function GenerateRoadbooksPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await generateRoadbooks();
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6" data-testid="roadbook-generate">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Roadbooks</h1>
        <nav className="flex gap-3 text-sm text-slate-600">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => navigate("/parametres")}
            className="h-auto px-0"
            data-testid="roadbooks-parametres-link"
          >
            Paramètres
          </Button>
        </nav>
      </header>

      <Button
        type="button"
        onClick={run}
        disabled={busy}
        data-testid="generate-button"
      >
        {busy ? "Génération en cours…" : "Générer les roadbooks"}
      </Button>

      {error && <p className="mt-4 text-sm text-red-600" data-testid="generate-error">{error}</p>}

      {result && (
        <section className="mt-6 space-y-3" data-testid="generate-result">
          <h2 className="text-lg font-medium">Documents disponibles</h2>
          <ul className="divide-y rounded border">
            <li className="flex items-center justify-between p-3">
              <span className="font-medium">Master ({result.master_pdf})</span>
              <a
                className="underline"
                href={`/api/roadbooks/files/${result.master_pdf}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Télécharger
              </a>
            </li>
            {result.volunteer_pdfs.map((f) => (
              <li key={f.volunteer_id} className="flex items-center justify-between p-3" data-testid="volunteer-pdf-row">
                <span>{f.filename}</span>
                <a
                  className="underline"
                  href={`/api/roadbooks/files/${f.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Télécharger
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

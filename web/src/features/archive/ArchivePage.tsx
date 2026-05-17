import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

import { exportArchiveUrl, uploadArchive } from "./api";

export function ArchivePage() {
  const [busy, setBusy] = useState(false);
  const [importedPath, setImportedPath] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const resp = await uploadArchive(f);
      setImportedPath(resp.path);
      toast(`Archive importée — ${resp.path}`, "info");
    } catch (err) {
      toast(`Échec de l'import : ${String(err)}`, "error");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6" data-testid="archive-page">
      <header>
        <h1 className="text-2xl font-semibold">Archive de l'événement</h1>
        <p className="mt-1 text-sm text-slate-600">
          Exportez la base actuelle (assets, GPX, données) en une archive .zip, ou importez une
          archive existante dans un nouveau fichier <code>event.db</code>.
        </p>
      </header>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-medium">Exporter</h2>
        <p className="text-sm text-slate-600">
          Le fichier .zip contient le dump SQL, les photos PB, le logo, le sponsor et les fichiers
          GPX. Les tuiles cartographiques sont exclues (trop volumineuses).
        </p>
        <Button asChild>
          <a
            href={exportArchiveUrl()}
            download
            data-testid="export-archive"
          >
            Télécharger l'archive
          </a>
        </Button>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-medium">Importer</h2>
        <p className="text-sm text-slate-600">
          L'archive est extraite dans un nouveau fichier base. Pour basculer dessus, arrêtez le
          serveur et redémarrez-le avec <code>--data-dir</code> pointant sur le nouveau dossier.
          (Aucun basculement automatique en v1.)
        </p>
        <Input
          type="file"
          accept=".zip,application/zip"
          onChange={onUpload}
          disabled={busy}
          data-testid="import-archive"
        />
        {importedPath && (
          <p className="text-sm text-emerald-700" data-testid="imported-path">
            Importé dans <code>{importedPath}</code>
          </p>
        )}
      </section>
    </main>
  );
}

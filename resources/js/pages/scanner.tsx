import React, { type ChangeEvent, useRef, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { jsPDF } from 'jspdf';
import { createWorker } from 'tesseract.js';
import { ExternalLink, FileText, Loader2, Search, Trash2 } from 'lucide-react';

type PageEntry = {
    id: string;
    processedDataUrl: string;
    name?: string;
};

type ScanRecord = {
    id: number;
    title: string;
    page_count: number;
    file_size: number;
    created_at: string;
};

type ScannerPageProps = {
    scans?: ScanRecord[];
    filters?: {
        search?: string | null;
    };
};

// À intégrer directement dans ton composant Scanner en recevant { scans, filters } en props
export function useLaravelScanner(pages: PageEntry[], docTitle: string, resetPages: () => void) {
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const saveToLaravel = async () => {
        if (pages.length === 0) {
            return;
        }

        setIsSaving(true);

        try {
            setStatusMessage('Lecture OCR du texte en cours...');
            const worker = await createWorker('fra');
            let fullText = '';

            for (const page of pages) {
                const {
                    data: { text },
                } = await worker.recognize(page.processedDataUrl);
                fullText += `${text}\n`;
            }

            await worker.terminate();

            setStatusMessage('Assemblage du PDF...');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            pages.forEach((page, index) => {
                if (index > 0) {
                    pdf.addPage();
                }

                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();
                pdf.addImage(page.processedDataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
            });

            const pdfBlob = pdf.output('blob');
            const pdfFile = new File([pdfBlob], `${docTitle.trim() || 'document'}.pdf`, {
                type: 'application/pdf',
            });

            setStatusMessage('Enregistrement sur le serveur...');
            const title = docTitle.trim() || `Scan du ${new Date().toLocaleDateString('fr-FR')}`;

            router.post(
                '/scanner',
                {
                    title,
                    document: pdfFile,
                    page_count: pages.length,
                    extracted_text: fullText.trim(),
                },
                {
                    forceFormData: true,
                    onSuccess: () => {
                        resetPages();
                        setStatusMessage('');
                    },
                    onFinish: () => setIsSaving(false),
                },
            );
        } catch (error) {
            console.error('Erreur lors de la sauvegarde :', error);
            setIsSaving(false);
            setStatusMessage('');
        }
    };

    return { saveToLaravel, isSaving, statusMessage };
}

export function SavedScansList({ scans = [], initialSearch = '' }: { scans?: ScanRecord[]; initialSearch?: string }) {
    const [search, setSearch] = useState(initialSearch || '');

    const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearch(value);
        router.get(
            '/scanner',
            { search: value },
            { preserveState: true, replace: true },
        );
    };

    const handleDelete = (id: number) => {
        if (window.confirm('Supprimer définitivement ce document ?')) {
            router.delete(`/scanner/${id}`, { preserveScroll: true });
        }
    };

    return (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <h2 className="text-lg font-semibold text-slate-900">Mes documents archivés ({scans.length})</h2>
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={handleSearch}
                        placeholder="Rechercher un titre ou du texte..."
                        className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                </div>
            </div>

            {scans.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                    Aucun document trouvé. Numérise ta première page ci-dessus.
                </p>
            ) : (
                <div className="divide-y divide-slate-100">
                    {scans.map((scan) => (
                        <div key={scan.id} className="flex items-center justify-between gap-3 py-3">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-slate-900">{scan.title}</p>
                                    <p className="text-xs text-slate-500">
                                        {scan.page_count} page(s) • {(scan.file_size / 1024).toFixed(0)} Ko •{' '}
                                        {new Date(scan.created_at).toLocaleDateString('fr-FR')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <a
                                    href={`/scanner/${scan.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    Ouvrir PDF
                                </a>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(scan.id)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    title="Supprimer"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ScannerPage({ scans = [], filters = {} }: ScannerPageProps) {
    const [pages, setPages] = useState<PageEntry[]>([]);
    const [documentTitle, setDocumentTitle] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const { saveToLaravel, isSaving, statusMessage } = useLaravelScanner(pages, documentTitle, () => {
        setPages([]);
    });

    const onFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        if (files.length === 0) {
            return;
        }

        const newPages = await Promise.all(
            files.map(async (file) => {
                const reader = new FileReader();

                const dataUrl = await new Promise<string>((resolve, reject) => {
                    reader.onload = () => resolve(String(reader.result ?? ''));
                    reader.onerror = () => reject(new Error('Impossible de lire le fichier sélectionné.'));
                    reader.readAsDataURL(file);
                });

                return {
                    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    processedDataUrl: dataUrl,
                    name: file.name,
                } satisfies PageEntry;
            }),
        );

        setPages((current) => [...current, ...newPages]);
        event.target.value = '';
    };

    const removePage = (id: string) => {
        setPages((current) => current.filter((page) => page.id !== id));
    };

    return (
        <>
            <Head title="Scanner" />

            <div className="mx-auto max-w-6xl p-6">
                <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600">Document</p>
                            <h1 className="mt-1 text-2xl font-bold text-slate-900">Numérisation OCR + PDF</h1>
                        </div>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
                        >
                            Ajouter une page
                        </button>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row">
                            <input
                                type="text"
                                value={documentTitle}
                                onChange={(event) => setDocumentTitle(event.target.value)}
                                placeholder="Titre du document"
                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                            />

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Importer des images
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={onFilesSelected}
                            />
                        </div>

                        {pages.length === 0 ? (
                            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                                <FileText className="mb-3 h-10 w-10 text-slate-300" />
                                <p className="text-base font-medium text-slate-700">Aucune page numérisée</p>
                                <p className="mt-1 max-w-sm text-sm text-slate-500">
                                    Ajoute une ou plusieurs pages pour générer le PDF, extraire le texte OCR et l’enregistrer dans Laravel.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {pages.map((page) => (
                                    <div key={page.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                        <div className="relative aspect-[3/4] bg-white">
                                            <img
                                                src={page.processedDataUrl}
                                                alt={page.name ?? 'Page numérisée'}
                                                className="h-full w-full object-cover"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3 p-3">
                                            <span className="truncate text-xs text-slate-600">{page.name ?? 'Page'}</span>
                                            <button
                                                type="button"
                                                onClick={() => removePage(page.id)}
                                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-red-200 hover:text-red-600"
                                            >
                                                Retirer
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-5 flex items-center justify-between gap-3">
                            <p className="text-sm text-slate-500">{pages.length} page(s) prête(s)</p>
                            <button
                                type="button"
                                onClick={saveToLaravel}
                                disabled={pages.length === 0 || isSaving}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Traitement...
                                    </>
                                ) : (
                                    'Enregistrer dans Laravel'
                                )}
                            </button>
                        </div>

                        {statusMessage ? (
                            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                                {statusMessage}
                            </div>
                        ) : null}
                    </section>

                    <aside>
                        <SavedScansList scans={scans} initialSearch={filters.search ?? ''} />
                    </aside>
                </div>
            </div>
        </>
    );
}

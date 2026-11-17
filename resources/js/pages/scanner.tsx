import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Head, router } from '@inertiajs/react';
import { jsPDF } from 'jspdf';
import { createWorker } from 'tesseract.js';
import {
    Camera,
    Upload,
    FileText,
    RotateCw,
    Download,
    Trash2,
    Plus,
    Sliders,
    Search,
    ExternalLink,
    Loader2,
    Save,
    Sparkles,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';

interface ScanRecord {
    id: number;
    title: string;
    page_count: number;
    file_size: number;
    created_at: string;
}

interface ScannedPage {
    id: string;
    processedDataUrl: string;
}

interface Props {
    scans: ScanRecord[];
    filters: { search?: string | null };
}

type FilterMode = 'bw' | 'grayscale' | 'color' | 'original';

export default function ScannerPage({ scans = [], filters = {} }: Props) {
    // Acquisition & éditeur
    const [mode, setMode] = useState<'upload' | 'camera'>('upload');
    const [rawImage, setRawImage] = useState<string | null>(null);
    const [processedPreview, setProcessedPreview] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterMode>('bw');
    const [contrast, setContrast] = useState<number>(25);
    const [brightness, setBrightness] = useState<number>(10);
    const [rotation, setRotation] = useState<number>(0);

    // Caméra
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Document multi-pages & sauvegarde Laravel
    const [pages, setPages] = useState<ScannedPage[]>([]);
    const [docTitle, setDocTitle] = useState<string>('');
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [search, setSearch] = useState<string>(filters.search || '');

    // Gestion de la caméra
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (mode !== 'camera') {
            stopCamera();
            return;
        }

        let cancelled = false;
        setCameraError(null);

        navigator.mediaDevices
            ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
            .then((stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            })
            .catch(() => {
                setCameraError("Impossible d'accéder à la caméra. Vérifie les permissions ou utilise l'import de fichier.");
            });

        return () => {
            cancelled = true;
            stopCamera();
        };
    }, [mode, stopCamera]);

    const captureFromCamera = () => {
        const video = videoRef.current;
        if (!video) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setRawImage(canvas.toDataURL('image/jpeg', 0.92));
        setRotation(0);
        setMode('upload');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            setRawImage(reader.result as string);
            setRotation(0);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const loadSampleDocument = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 1130;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#f3efe6';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('FACTURE N° 2026-084', 60, 100);
        ctx.font = '20px sans-serif';
        ctx.fillText('Date : 17 Novembre 2026', 60, 150);
        ctx.fillText('Client : Projet DocScanner Laravel', 60, 185);
        ctx.fillRect(60, 215, 680, 2);
        ctx.fillText('Prestation développement web ...................... 450,00 €', 60, 280);
        ctx.fillText('Hébergement & stockage ............................... 50,00 €', 60, 325);
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('TOTAL TTC : 500,00 €', 60, 410);

        setRawImage(canvas.toDataURL('image/jpeg', 0.92));
        setRotation(0);
    };

    // Traitement Canvas temps réel
    useEffect(() => {
        if (!rawImage) {
            setProcessedPreview(null);
            return;
        }

        const img = new Image();
        img.onload = () => {
            const isRotated90 = rotation % 180 !== 0;
            const targetW = isRotated90 ? img.height : img.width;
            const targetH = isRotated90 ? img.width : img.height;

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.save();
            ctx.translate(targetW / 2, targetH / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            ctx.restore();

            if (filter !== 'original' || contrast !== 0 || brightness !== 0) {
                const imageData = ctx.getImageData(0, 0, targetW, targetH);
                const data = imageData.data;
                const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
                const brightOffset = brightness * 1.5;

                for (let i = 0; i < data.length; i += 4) {
                    let r = contrastFactor * (data[i] - 128) + 128 + brightOffset;
                    let g = contrastFactor * (data[i + 1] - 128) + 128 + brightOffset;
                    let b = contrastFactor * (data[i + 2] - 128) + 128 + brightOffset;

                    if (filter === 'grayscale' || filter === 'bw') {
                        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
                        if (filter === 'bw') {
                            lum = lum > 165 ? 255 : lum < 85 ? 15 : (lum - 85) * 3;
                        }
                        r = g = b = lum;
                    } else if (filter === 'color') {
                        const avg = (r + g + b) / 3;
                        r = avg + (r - avg) * 1.25;
                        g = avg + (g - avg) * 1.25;
                        b = avg + (b - avg) * 1.25;
                    }

                    data[i] = Math.max(0, Math.min(255, r));
                    data[i + 1] = Math.max(0, Math.min(255, g));
                    data[i + 2] = Math.max(0, Math.min(255, b));
                }
                ctx.putImageData(imageData, 0, 0);
            }

            setProcessedPreview(canvas.toDataURL('image/jpeg', 0.88));
        };
        img.src = rawImage;
    }, [rawImage, filter, contrast, brightness, rotation]);

    const addCurrentPageToBatch = () => {
        if (!processedPreview) return;
        setPages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), processedDataUrl: processedPreview },
        ]);
        setRawImage(null);
    };

    const movePage = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= pages.length) return;
        const copy = [...pages];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        setPages(copy);
    };

    const buildPdf = (pagesToExport: ScannedPage[]) => {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        pagesToExport.forEach((page, idx) => {
            if (idx > 0) pdf.addPage();
            const w = pdf.internal.pageSize.getWidth();
            const h = pdf.internal.pageSize.getHeight();
            pdf.addImage(page.processedDataUrl, 'JPEG', 0, 0, w, h, undefined, 'FAST');
        });
        return pdf;
    };

    const handleSaveToLaravel = async () => {
        // Permet d'archiver directement la page en cours d'édition même sans clic préalable sur "Ajouter"
        const pagesToSave: ScannedPage[] =
            pages.length > 0
                ? pages
                : processedPreview
                  ? [{ id: 'single', processedDataUrl: processedPreview }]
                  : [];

        if (pagesToSave.length === 0) return;
        setIsSaving(true);

        try {
            setStatusMessage('Extraction OCR du texte (français)...');
            const worker = await createWorker('fra');
            let fullText = '';

            for (const p of pagesToSave) {
                const { data } = await worker.recognize(p.processedDataUrl);
                fullText += data.text + '\n';
            }
            await worker.terminate();

            setStatusMessage('Génération du PDF...');
            const pdf = buildPdf(pagesToSave);
            const finalTitle = docTitle.trim() || `Scan du ${new Date().toLocaleDateString('fr-FR')}`;
            const pdfFile = new File([pdf.output('blob')], `${finalTitle}.pdf`, {
                type: 'application/pdf',
            });

            setStatusMessage('Enregistrement sur Laravel...');
            router.post(
                '/scans',
                {
                    title: finalTitle,
                    document: pdfFile,
                    page_count: pagesToSave.length,
                    extracted_text: fullText.trim(),
                },
                {
                    forceFormData: true,
                    onSuccess: () => {
                        setPages([]);
                        setRawImage(null);
                        setDocTitle('');
                        setStatusMessage('');
                    },
                    onFinish: () => setIsSaving(false),
                }
            );
        } catch (err) {
            console.error(err);
            setIsSaving(false);
            setStatusMessage('');
        }
    };

    const handleSearchChange = (value: string) => {
        setSearch(value);
        router.get('/scanner', { search: value }, { preserveState: true, replace: true });
    };

    const handleDeleteScan = (id: number) => {
        if (confirm('Supprimer définitivement ce document PDF ?')) {
            router.delete(`/scans/${id}`, { preserveScroll: true });
        }
    };

    const totalReadyPages = pages.length + (processedPreview ? 1 : 0);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <Head title="DocuScan Studio" />

            <header className="border-b border-slate-200 bg-white px-6 py-4">
                <div className="mx-auto flex max-w-6xl items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-indigo-600 p-2 text-white">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">DocuScan Studio</h1>
                            <p className="text-xs text-slate-500">Numérisation, OCR & Archivage PDF local</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setMode('upload')}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                                mode === 'upload'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            <Upload className="h-4 w-4" /> Fichier
                        </button>
                        <button
                            onClick={() => setMode('camera')}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                                mode === 'camera'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            <Camera className="h-4 w-4" /> Caméra
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl space-y-8 p-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Zone principale : Capture & Éditeur */}
                    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                        {mode === 'camera' ? (
                            <div className="space-y-4">
                                <div className="relative aspect-[3/4] max-h-[500px] w-full overflow-hidden rounded-lg bg-slate-900">
                                    {cameraError ? (
                                        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">
                                            {cameraError}
                                        </div>
                                    ) : (
                                        <>
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                className="h-full w-full object-cover"
                                            />
                                            <div className="pointer-events-none absolute inset-6 rounded border-2 border-dashed border-indigo-400/80" />
                                        </>
                                    )}
                                </div>
                                <button
                                    onClick={captureFromCamera}
                                    disabled={!!cameraError}
                                    className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    Capturer le document
                                </button>
                            </div>
                        ) : !processedPreview ? (
                            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-6 py-16 text-center">
                                <Upload className="mb-3 h-10 w-10 text-slate-400" />
                                <p className="text-sm font-medium text-slate-700">
                                    Importe une photo de document (JPG, PNG)
                                </p>
                                <div className="mt-4 flex flex-wrap justify-center gap-3">
                                    <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                                        Choisir une image
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                    </label>
                                    <label className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                                        Prendre une photo (Mobile)
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                    </label>
                                    <button
                                        onClick={loadSampleDocument}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                        <Sparkles className="h-4 w-4 text-indigo-600" />
                                        Tester avec un exemple
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-center overflow-hidden rounded-lg bg-slate-900 p-4">
                                    <img
                                        src={processedPreview}
                                        alt="Aperçu numérisé"
                                        className="max-h-[460px] rounded object-contain shadow-lg"
                                    />
                                </div>

                                {/* Outils de retouche */}
                                <div className="grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                                            <Sliders className="h-3.5 w-3.5" /> Filtre & Rotation
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(
                                                [
                                                    ['bw', 'Document N&B'],
                                                    ['grayscale', 'Gris'],
                                                    ['color', 'Couleur+'],
                                                    ['original', 'Original'],
                                                ] as [FilterMode, string][]
                                            ).map(([key, label]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => setFilter(key)}
                                                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                                        filter === key
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-white text-slate-700 ring-1 ring-slate-200'
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setRotation((r) => (r + 90) % 360)}
                                                className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                                            >
                                                <RotateCw className="h-3.5 w-3.5" /> 90°
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 text-xs">
                                        <label className="flex justify-between font-medium text-slate-600">
                                            <span>Contraste</span>
                                            <span>{contrast}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="-50"
                                            max="80"
                                            value={contrast}
                                            onChange={(e) => setContrast(Number(e.target.value))}
                                            className="w-full accent-indigo-600"
                                        />
                                        <label className="flex justify-between font-medium text-slate-600">
                                            <span>Luminosité</span>
                                            <span>{brightness}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="-50"
                                            max="60"
                                            value={brightness}
                                            onChange={(e) => setBrightness(Number(e.target.value))}
                                            className="w-full accent-indigo-600"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-between gap-2">
                                    <button
                                        onClick={() => setRawImage(null)}
                                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                    >
                                        Annuler cette image
                                    </button>
                                    <button
                                        onClick={addCurrentPageToBatch}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Ajouter cette page au lot ({pages.length + 1})
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Barre latérale : Lot & Archivage */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="space-y-4">
                            <h2 className="font-semibold text-slate-900">
                                Document à enregistrer ({totalReadyPages} page{totalReadyPages > 1 ? 's' : ''})
                            </h2>

                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">
                                    Titre du document PDF
                                </label>
                                <input
                                    type="text"
                                    value={docTitle}
                                    onChange={(e) => setDocTitle(e.target.value)}
                                    placeholder="Ex: Facture EDF Novembre"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                                />
                            </div>

                            {pages.length > 0 && (
                                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                                    {pages.map((p, idx) => (
                                        <div
                                            key={p.id}
                                            className="flex items-center justify-between rounded-lg border border-slate-200 p-2"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <img
                                                    src={p.processedDataUrl}
                                                    alt={`Page ${idx + 1}`}
                                                    className="h-12 w-9 rounded border object-cover"
                                                />
                                                <span className="text-xs font-medium">Page {idx + 1}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => movePage(idx, -1)}
                                                    disabled={idx === 0}
                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                                >
                                                    <ChevronUp className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => movePage(idx, 1)}
                                                    disabled={idx === pages.length - 1}
                                                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                                >
                                                    <ChevronDown className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        setPages((prev) => prev.filter((item) => item.id !== p.id))
                                                    }
                                                    className="p-1 text-slate-400 hover:text-red-600"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 space-y-2 border-t border-slate-100 pt-4">
                            {statusMessage && (
                                <p className="flex items-center gap-2 text-xs font-medium text-indigo-600">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    {statusMessage}
                                </p>
                            )}

                            <button
                                onClick={handleSaveToLaravel}
                                disabled={isSaving || totalReadyPages === 0}
                                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Save className="h-4 w-4" />
                                {isSaving ? 'Traitement en cours...' : 'Archiver le PDF dans Laravel'}
                            </button>

                            {totalReadyPages > 0 && (
                                <button
                                    onClick={() => {
                                        const list =
                                            pages.length > 0
                                                ? pages
                                                : [{ id: '1', processedDataUrl: processedPreview! }];
                                        buildPdf(list).save(`${docTitle || 'scan'}.pdf`);
                                    }}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Télécharger directement sur mon PC
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Coffre-fort de documents enregistrés */}
                <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <h2 className="text-lg font-semibold text-slate-900">
                            Mes documents archivés ({scans.length})
                        </h2>
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Rechercher par titre ou texte OCR..."
                                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {scans.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-500">
                            Aucun PDF archivé pour le moment. Teste avec le bouton « Tester avec un exemple » ci-dessus !
                        </p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {scans.map((scan) => (
                                <div key={scan.id} className="flex items-center justify-between py-3">
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
                                            href={`/scans/${scan.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            Ouvrir PDF
                                        </a>
                                        <button
                                            onClick={() => handleDeleteScan(scan.id)}
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
                </section>
            </main>
        </div>
    );
}

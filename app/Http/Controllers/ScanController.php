<?php

namespace App\Http\Controllers;

use App\Models\Scan;
use Dom\Document;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;

class ScanController extends Controller
{
    //
    public function index(Request $request) {
        $search = $request->input('search');

        $scans = $request->user()
        ->scans()
        ->when($search, function($query, $search){
            $query->where('title', 'like', "%{$search}%")
            ->orWhere('extracted_text', 'like', "%{$search}%");
        })
        ->latest()
        ->get();

        return Inertia::render('scanner', [
            'scans'=>$scans,
            'filters'=> ['search' => $search],
        ]);

    }

    public function store(Request $request){
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'document' => ['required', 'file', 'mimes:pdf', 'max:10240'], // 10MB max
            'page_count' => ['required', 'integer', 'min:1'],
            'extracted_text' => ['nullable', 'string'],
        ]);

        $file = $request->file('document');
        $path = $file->store('scans');

        $request->user()->scans()->create([
            'title' => $validated['title'],
            'file_path' => $path,
            'page_count' => $validated['page_count'],
            'file_size' => $file->getSize(),
            'extracted_text' => $validated['extracted_text'] ?? null,
        ]);

        return back()->with('success', 'Document numérisé et archivé.');
    }

    public function show(Request $request, Scan $scan){
        abort_if($scan->user_id !== $request->user()->id, 403);

        return Storage::response(
            $scan->file_path,
            Str::slug($scan->title) . '.pdf',
            ['Content-Type' => 'application/pdf']
        );
    }

    public function destroy(Request $request, Scan $scan)
    {
        abort_if($scan->user_id !== $request->user()->id, 403);

        Storage::delete($scan->file_path);
        $scan->delete();

        return back();
    }

}

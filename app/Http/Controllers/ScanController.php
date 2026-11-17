<?php

namespace App\Http\Controllers;

use App\Models\Scan;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;

class ScanController extends Controller
{
    private function getLocalUser(Request $request): User
    {
        return $request->user() ?? User::firstOrCreate(
            ['email' => 'scanner@local.test'],
            [
                'name' => 'Utilisateur Local',
                'password' => Hash::make(Str::random(32)),
            ]
        );
    }

    public function index(Request $request)
    {
        $user = $this->getLocalUser($request);
        $search = $request->input('search');

        $scans = $user->scans()
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('title', 'like', "%{$search}%")
                      ->orWhere('extracted_text', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->get();

        return Inertia::render('scanner', [
            'scans' => $scans,
            'filters' => ['search' => $search],
        ]);
    }

    public function store(Request $request)
    {
        $user = $this->getLocalUser($request);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'document' => ['required', 'file', 'mimes:pdf', 'max:25600'],
            'page_count' => ['required', 'integer', 'min:1'],
            'extracted_text' => ['nullable', 'string'],
        ]);

        $file = $request->file('document');
        $path = $file->store('scans');

        $user->scans()->create([
            'title' => $validated['title'],
            'file_path' => $path,
            'page_count' => $validated['page_count'],
            'file_size' => $file->getSize(),
            'extracted_text' => $validated['extracted_text'] ?? '',
        ]);

        return back();
    }

    public function show(Request $request, Scan $scan)
    {
        $user = $this->getLocalUser($request);
        abort_if($scan->user_id !== $user->id, 403);

        return Storage::response(
            $scan->file_path,
            Str::slug($scan->title) . '.pdf',
            ['Content-Type' => 'application/pdf']
        );
    }

    public function destroy(Request $request, Scan $scan)
    {
        $user = $this->getLocalUser($request);
        abort_if($scan->user_id !== $user->id, 403);

        Storage::delete($scan->file_path);
        $scan->delete();

        return back();
    }
}

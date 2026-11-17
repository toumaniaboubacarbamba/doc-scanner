<?php

use App\Http\Controllers\ScanController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/scanner');

Route::get('/scanner', [ScanController::class, 'index'])->name('scanner.index');
Route::post('/scans', [ScanController::class, 'store'])->name('scans.store');
Route::get('/scans/{scan}', [ScanController::class, 'show'])->name('scans.show');
Route::delete('/scans/{scan}', [ScanController::class, 'destroy'])->name('scans.destroy');

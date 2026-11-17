<?php

use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'verified'])->group(function () {
    Route::get('/scanner', [\App\Http\Controllers\ScanController::class, 'index'])->name('scanner.index');
    Route::post('/scanner', [\App\Http\Controllers\ScanController::class, 'store'])->name('scanner.store');
    Route::get('/scanner/{scan}', [\App\Http\Controllers\ScanController::class, 'show'])->name('scanner.show');
    Route::delete('/scanner/{scan}', [\App\Http\Controllers\ScanController::class, 'destroy'])->name('scanner.destroy');
});

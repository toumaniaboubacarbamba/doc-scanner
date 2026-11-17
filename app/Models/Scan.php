<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Scan extends Model
{
    //
    protected $fillable = [
        'user_id',
        'title',
        'file_path',
        'page_count',
        'file_size',
        'extracted_text',
    ];

    public function user(): BelongsTo {
        return $this->belongsTo(User::class);
    }
}

const fs = require('fs');
const path = require('path');

/**
 * Extract text from an uploaded ID card image using Tesseract OCR.
 * Uses multiple page-segmentation modes and a Latin letter whitelist
 * so Ethiopian Digital ID Latin name lines are easier to read.
 */
async function extractTextFromIdFile(filePath, mimetype = '', options = {}) {
    const mime = (mimetype || '').toLowerCase();
    const ext = path.extname(filePath).toLowerCase();

    if (mime.includes('pdf') || ext === '.pdf') {
        try {
            const pdfParse = require('pdf-parse');
            const buffer = fs.readFileSync(filePath);
            const data = await pdfParse(buffer);
            const text = (data.text || '').trim();
            if (text.length >= 10) {
                return { text, engine: 'pdf-parse', confidence: null };
            }
        } catch (e) {
            // fall through
        }
        const err = new Error(
            'Could not read text from PDF. Please upload a clear JPG or PNG photo of your ID for automatic verification.'
        );
        err.code = 'OCR_PDF_UNSUPPORTED';
        throw err;
    }

    let Tesseract;
    try {
        Tesseract = require('tesseract.js');
    } catch (e) {
        const err = new Error(
            'OCR engine not installed. Run: npm install tesseract.js --save in the backend folder.'
        );
        err.code = 'OCR_NOT_INSTALLED';
        throw err;
    }

    const fast = options.fast === true;
    // Live camera: one pass only (faster). Full upload: multi-pass.
    const attempts = fast
        ? [{ psm: 6, whitelist: false }]
        : [
            { psm: 6, whitelist: true },
            { psm: 11, whitelist: true },
            { psm: 3, whitelist: false },
          ];

    let combined = '';
    let bestConfidence = 0;
    let lastError = null;

    for (const attempt of attempts) {
        try {
            const options = {
                logger: () => {},
            };
            // tessedit via createWorker in v5; recognize supports overrides in v4/v5 differently
            const result = await Tesseract.recognize(filePath, 'eng', {
                logger: () => {},
                ...(attempt.whitelist
                    ? {
                          tessedit_char_whitelist:
                              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /-|',
                          tessedit_pageseg_mode: String(attempt.psm),
                      }
                    : {
                          tessedit_pageseg_mode: String(attempt.psm),
                      }),
            });
            const text = (result?.data?.text || '').trim();
            const confidence = result?.data?.confidence ?? 0;
            if (text) combined += '\n' + text;
            if (confidence > bestConfidence) bestConfidence = confidence;
        } catch (e) {
            lastError = e;
        }
    }

    const text = combined.trim();
    if (!text || text.length < 3) {
        const err = new Error(
            'Could not read text from the ID image. Upload a clearer, well-lit photo focused on the name line (JPG/PNG).'
        );
        err.code = 'OCR_EMPTY';
        if (lastError) err.cause = lastError;
        throw err;
    }

    return { text, engine: 'tesseract-multi', confidence: bestConfidence };
}

function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function nameTokens(s) {
    return String(s || '')
        .trim()
        .split(/\s+/)
        .map((t) => normalize(t))
        .filter((t) => t.length >= 2);
}

/** Latin words of length >= 2 found in OCR text */
function extractOcrWords(ocrText) {
    const raw = String(ocrText || '');
    const words = raw.match(/[A-Za-z][A-Za-z'-]{1,}/g) || [];
    const normalized = words.map((w) => normalize(w)).filter((w) => w.length >= 2);
    // also whole normalized blob for includes checks
    return { words: [...new Set(normalized)], blob: normalize(raw), raw };
}

function levenshtein(a, b) {
    const s = String(a);
    const t = String(b);
    const m = s.length;
    const n = t.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

/**
 * True if token appears in OCR (exact, substring, or fuzzy vs any OCR word).
 * Allows typical Tesseract mistakes on phone photos of ID cards.
 */
function tokenFoundInOcr(token, ocrWords, blob) {
    if (!token || token.length < 2) return false;
    if (blob.includes(token)) return true;

    for (const w of ocrWords) {
        if (!w || w.length < 2) continue;
        if (w === token) return true;
        if (w.includes(token) || token.includes(w)) {
            // avoid matching very short accidental substrings
            if (Math.min(w.length, token.length) >= 3) return true;
            if (w.length === token.length) return true;
        }
        const dist = levenshtein(token, w);
        // allow more errors for longer names
        const maxDist =
            token.length <= 4 ? 1 : token.length <= 7 ? 2 : Math.max(2, Math.floor(token.length * 0.35));
        if (dist <= maxDist) return true;
    }
    return false;
}

/**
 * ONLY first name + last name verification against OCR text.
 * No FIDA / phone / email checks.
 */
function matchPersonalInfoAgainstOcr(ocrText, fields = {}) {
    const { words: ocrWords, blob, raw } = extractOcrWords(ocrText);
    const mismatches = [];

    let firstName = String(fields.firstName || fields.first_name || '').trim();
    let lastName = String(fields.lastName || fields.last_name || '').trim();

    if ((!firstName || !lastName) && fields.fullName) {
        const parts = String(fields.fullName).trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            if (!firstName) firstName = parts[0];
            if (!lastName) lastName = parts.slice(1).join(' ');
        } else if (parts.length === 1 && !firstName) {
            firstName = parts[0];
        }
    }

    const firstTokens = nameTokens(firstName);
    const lastTokens = nameTokens(lastName);

    let firstOk = false;
    let lastOk = false;

    if (!firstTokens.length) {
        mismatches.push('Registered first name is missing or too short to verify against the ID');
    } else {
        firstOk = firstTokens.every((t) => tokenFoundInOcr(t, ocrWords, blob));
        // if multi-token first name, also accept if primary token found
        if (!firstOk && firstTokens.length > 1) {
            firstOk = tokenFoundInOcr(firstTokens[0], ocrWords, blob);
        }
        if (!firstOk) {
            mismatches.push(
                `First name "${firstName}" was not found on the uploaded ID card. Names on the ID must match your registration.`
            );
        }
    }

    if (!lastTokens.length) {
        mismatches.push('Registered last name is missing or too short to verify against the ID');
    } else {
        // primary last-name token is enough (Lingerew in "Lingerew Tiruye")
        lastOk = tokenFoundInOcr(lastTokens[0], ocrWords, blob);
        if (!lastOk && lastTokens.length > 1) {
            lastOk = lastTokens.some((t) => tokenFoundInOcr(t, ocrWords, blob));
        }
        if (!lastOk) {
            mismatches.push(
                `Last name "${lastName}" was not found on the uploaded ID card. Names on the ID must match your registration.`
            );
        }
    }

    // Combined fallback: all registration tokens present fuzzy in OCR
    if (mismatches.length && firstTokens.length && lastTokens.length) {
        const all = [...firstTokens, ...lastTokens];
        const hits = all.filter((t) => tokenFoundInOcr(t, ocrWords, blob)).length;
        if (hits >= 2 || (hits === 1 && all.length === 2 && (firstOk || lastOk))) {
            // need both sides ideally
            if (hits >= Math.min(2, all.length)) {
                return {
                    ok: true,
                    mismatches: [],
                    ocrPreview: raw.slice(0, 500),
                    ocrWords: ocrWords.slice(0, 40),
                };
            }
        }
        // if first AND last primary tokens fuzzy-match any OCR word, OK
        if (
            tokenFoundInOcr(firstTokens[0], ocrWords, blob) &&
            tokenFoundInOcr(lastTokens[0], ocrWords, blob)
        ) {
            return {
                ok: true,
                mismatches: [],
                ocrPreview: raw.slice(0, 500),
                ocrWords: ocrWords.slice(0, 40),
            };
        }
    }

    return {
        ok: mismatches.length === 0,
        mismatches,
        ocrPreview: raw.slice(0, 500),
        ocrWords: ocrWords.slice(0, 40),
    };
}



/** Find digit runs of length 10–15 (phone-like) in OCR text, ignoring labels */
function extractPhoneLikeNumbers(ocrText) {
    const raw = String(ocrText || '');
    // sequences that may include spaces/dashes between digits
    const loose = raw.match(/(?:\d[\s\-]*){10,15}/g) || [];
    const cleaned = [];
    for (const m of loose) {
        const d = m.replace(/\D/g, '');
        if (d.length >= 10 && d.length <= 15) cleaned.push(d);
    }
    // also from pure digit blob: sliding windows not needed if we have candidates
    const allDigits = raw.replace(/\D/g, '');
    // FAN numbers are often 16+ digits — exclude those as "phone"
    if (allDigits.length >= 10 && allDigits.length <= 15) {
        cleaned.push(allDigits);
    }
    // extract contiguous digit groups from original
    const groups = raw.match(/\d{10,15}/g) || [];
    cleaned.push(...groups);
    return [...new Set(cleaned)];
}

/**
 * Verify full name + PIN/FAN + phone against combined OCR from both ID sides.
 */
function matchIdScanFields(ocrText, fields = {}) {
    const nameResult = matchPersonalInfoAgainstOcr(ocrText, {
        firstName: fields.firstName || fields.first_name,
        lastName: fields.lastName || fields.last_name,
        fullName: fields.fullName,
    });
    const digitText = String(ocrText || '').replace(/\D/g, '');
    const mismatches = [...(nameResult.mismatches || [])];

    // PIN / FAN / FIDA — digits only, require last 6+ digits to appear in OCR
    const pin = String(fields.pinNumber || fields.fidaNumber || fields.fan || '').replace(/\D/g, '');
    if (pin && pin.length >= 6) {
        const pinOk =
            digitText.includes(pin) ||
            digitText.includes(pin.slice(-8)) ||
            digitText.includes(pin.slice(-6));
        if (!pinOk) {
            mismatches.push(
                `PIN/FAN number ending with "${pin.slice(-6)}" was not found on the scanned ID (check both sides).`
            );
        }
    }

    // Phone: accept ANY digit sequence length 10–15 found on the ID (text "phone" not required)
    // Prefer match to registered phone when present; otherwise any 10–15 digit run is enough
    const phone = String(fields.phone || '').replace(/\D/g, '');
    const phoneCandidates = extractPhoneLikeNumbers(ocrText);
    let phoneOk = phoneCandidates.length > 0;
    if (phone && phone.length >= 10) {
        // soft bonus: if registered phone appears, still ok; if not, any 10–15 digit number counts
        const regOnCard =
            digitText.includes(phone) ||
            digitText.includes(phone.slice(-9)) ||
            digitText.includes(phone.slice(-8));
        phoneOk = phoneOk || regOnCard;
    }
    if (!phoneOk) {
        mismatches.push(
            'No phone-like number (10–15 digits) was found on the scanned ID back. Rescan the back in better light.'
        );
    }

    return {
        ok: mismatches.length === 0,
        mismatches,
        ocrPreview: nameResult.ocrPreview,
        ocrWords: nameResult.ocrWords,
        nameOk: nameResult.ok,
    };
}

module.exports = {
    extractTextFromIdFile,
    matchPersonalInfoAgainstOcr,
    matchIdScanFields,
    extractPhoneLikeNumbers,
    normalize,
    nameTokens,
    tokenFoundInOcr,
    extractOcrWords,
};
